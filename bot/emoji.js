// PF-024 Item 22 – the emoji and sticker suggester, /emoji suggest | mine | delete | review in the matchday app (the tools app is at the 25 help-page limit).
//   suggest  a member attaches an image, picks emoji or sticker and a name. The bot checks it (declared type AND first bytes, size, real pixel size), copies it from Discord's attachment
//            URL into R2 (binding MEDIA, key emoji/…) and writes a library row (user, name, kind, status `pending`, size, format). The reply is a private receipt. ONE review card (name,
//            kind, size, who) goes to the managers' channel (Organization config purpose `emoji_review`) with Approve and Reject buttons; none set = no card (managers use the Control Center).
//   mine     the member's own suggestions with their status.   delete  the member withdraws a pending one (managers: any).   review  managers: what is waiting.
//   copy     the same queue, from ANY server: right-click a message → Apps → Request emoji, or /emoji copy (the app is user-installable). Only people in our server.
//   stats    managers: slots, request counts, most and least used (bot/emojiimport.js).
// Approving an EMOJI imports it into our server (bot/emojiimport.js); if Discord refuses or no slot is free it stays waiting with the reason. Stickers are only kept (not imported yet).
// Limits (Discord, checked against the API docs): custom emoji 256 KiB, JPEG, PNG or GIF (animated only as GIF); sticker 512 KiB, PNG, APNG or GIF (no JPEG, no Lottie, no WebP, no SVG).
// config.json `emojiSuggest` (Worker var EMOJI_SUGGEST) can only tighten the size and pixel limits, never go above Discord's. Uploads are untrusted: the image is parsed from its own bytes,
// never trusted from its name or declared type, and the review page shows it only after a manager asks. Nothing about the image is logged.
import { can, flagOn } from './roles.js';
import { message, notice, reply, header, text, sep, footer, buttons, cards, bannerUrl } from './ui.js';
import { orgName, channelFor } from './orgconfig.js';
import { discord } from './servertools.js';
import { appConfigured, appEnv } from './apps.js';
import { usedBytes, mb, hex, REFUSE_AT } from './media.js';
import { parseEmojis, emojiImage, addToServer, slots, funEnv, statsPanel, statsData } from './emojiimport.js';
import { notifyManagers, safely } from './notify.js';

export const EMOJI_COMMANDS = new Set(['emoji', 'Request emoji']);
const MAX_COPY = 5;
export const EMOJI_ID = /^norex:emo:/;
export const EMOJI_FLAG = 'emoji';
export const KIB = 1024;
// Discord's hard limits per kind; the config may only go lower
export const KINDS = {
  emoji: { icon: '😀', label: 'Emoji', maxBytes: 256 * KIB, mimes: ['image/png', 'image/jpeg', 'image/gif'], animated: ['image/gif'], nameMax: 32 },
  sticker: { icon: '🏷️', label: 'Sticker', maxBytes: 512 * KIB, mimes: ['image/png', 'image/gif'], animated: ['image/png', 'image/gif'], nameMax: 30 },
};
export const DEFAULTS = { maxPending: 3, minSide: 32, maxSide: 1024, maxRatio: 1.25 };
export const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif' };
export const CDN_HOSTS = ['cdn.discordapp.com', 'media.discordapp.net'];
const clean = (s, n) => String(s ?? '').replace(/<(@[!&]?|#)\d+>|@(everyone|here)/g, '').replace(/[\u0000-\u001f<>"]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const note = (title, body = '') => reply(notice(title, body));
const userOf = (i) => i.member?.user?.id ?? i.user?.id ?? '';
const byOf = (i) => i.member?.nick || i.member?.user?.global_name || i.member?.user?.username || i.user?.username || 'Member';
const kb = (n) => `${Math.max(1, Math.round(n / KIB))} KB`;
const matchdayEnv = (env) => (appConfigured(env, 'matchday') && env.BOT_APP !== 'matchday' ? appEnv(env, 'matchday') : env);

/** limits from the Worker var EMOJI_SUGGEST (config.json `emojiSuggest`), clamped: never above Discord's limits, never below a usable minimum */
export function limits(env, kind = 'emoji') {
  let c = {}; try { c = JSON.parse(env.EMOJI_SUGGEST || '{}'); } catch { /* defaults */ }
  const num = (v, d, lo, hi) => (Number.isFinite(Number(v)) && Number(v) >= lo ? Math.min(Number(v), hi) : d);
  const k = KINDS[kind] ?? KINDS.emoji, cfgKb = kind === 'sticker' ? c.stickerKb : c.emojiKb;
  return {
    maxBytes: Math.floor(num(cfgKb, k.maxBytes / KIB, 8, k.maxBytes / KIB) * KIB),
    maxPending: Math.floor(num(c.maxPending, DEFAULTS.maxPending, 1, 20)),
    minSide: Math.floor(num(c.minSide, DEFAULTS.minSide, 16, 512)),
    maxSide: Math.floor(num(c.maxSide, DEFAULTS.maxSide, 64, 4096)),
    maxRatio: DEFAULTS.maxRatio,
  };
}
/** a Discord-safe name: letters, digits and underscore only, 2 to 32 characters (30 for a sticker). null when too little is left */
export function cleanName(raw, kind = 'emoji') {
  const max = (KINDS[kind] ?? KINDS.emoji).nameMax;
  const n = String(raw ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[\s-]+/g, '_').replace(/[^A-Za-z0-9_]/g, '').replace(/_+/g, '_').replace(/^_+|_+$/g, '').slice(0, max);
  return n.length >= 2 ? n : null;
}
export function cdnUrl(u) {
  try { const x = new URL(String(u)); return x.protocol === 'https:' && CDN_HOSTS.includes(x.hostname) ? x : null; } catch { return null; }
}

/** reads the format and the real pixel size from the image's own bytes. → { mime, width, height, animated } or null for anything that is not a clean PNG, JPEG or GIF */
export function inspect(b) {
  if (!b || b.length < 24) return null;
  const u16 = (i) => (b[i] << 8) | b[i + 1], u32 = (i) => ((b[i] * 2 ** 24) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3]), l16 = (i) => b[i] | (b[i + 1] << 8);
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) { // PNG: IHDR first, an acTL chunk before the pixels = APNG
    if (u32(8) !== 13 || String.fromCharCode(b[12], b[13], b[14], b[15]) !== 'IHDR') return null;
    let animated = false, p = 8;
    while (p + 8 <= b.length) {
      const len = u32(p), type = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]);
      if (type === 'acTL') { animated = true; break; }
      if (type === 'IDAT' || type === 'IEND') break;
      p += 12 + len;
    }
    return { mime: 'image/png', width: u32(16), height: u32(20), animated };
  }
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) { // JPEG: the first SOF marker holds the size
    let p = 2;
    while (p + 9 < b.length) {
      if (b[p] !== 0xff) { p++; continue; }
      const m = b[p + 1];
      if (m === 0xff) { p++; continue; }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { mime: 'image/jpeg', width: u16(p + 7), height: u16(p + 5), animated: false };
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { p += 2; continue; }
      p += 2 + u16(p + 2);
    }
    return null;
  }
  const gifHead = String.fromCharCode(b[0], b[1], b[2], b[3], b[4], b[5]);
  if (gifHead === 'GIF89a' || gifHead === 'GIF87a') { // GIF: count the frames
    let p = 13, frames = 0;
    if (b[10] & 0x80) p += 3 * (1 << ((b[10] & 7) + 1));
    const skip = () => { while (p < b.length && b[p] !== 0) p += b[p] + 1; p++; };
    while (p < b.length && frames < 3) {
      if (b[p] === 0x21) { p += 2; skip(); } else if (b[p] === 0x2c) { frames++; const f = b[p + 9]; p += 10; if (f & 0x80) p += 3 * (1 << ((f & 7) + 1)); p++; skip(); } else break;
    }
    return { mime: 'image/gif', width: l16(6), height: l16(8), animated: frames > 1 };
  }
  return null;
}
/** the whole check: kind rules, size, format, pixels. → { ok: info } or { why } (a sentence for the member) */
export function validate(env, kind, bytes, { copy = false } = {}) { // copy: it is already a Discord emoji, so only format and weight are checked
  const k = KINDS[kind], lim = limits(env, kind);
  if (!k) return { why: 'Pick emoji or sticker.' };
  if (!bytes.length) return { why: 'That file is empty.' };
  if (bytes.length > lim.maxBytes) return { why: `A ${k.label.toLowerCase()} can be at most ${kb(lim.maxBytes)} and this one is ${kb(bytes.length)}.` };
  const info = inspect(bytes);
  if (!info) return { why: 'That is not a real PNG, JPEG or GIF image (SVG, WebP and video are not accepted).' };
  if (!k.mimes.includes(info.mime)) return { why: kind === 'sticker' ? 'Stickers must be PNG, APNG or GIF.' : 'Emoji must be PNG, JPEG or GIF.' };
  if (info.animated && !k.animated.includes(info.mime)) return { why: 'An animated emoji must be a GIF.' };
  const { width: w, height: h } = info;
  if (copy) return { ok: info };
  if (!w || !h || Math.min(w, h) < lim.minSide) return { why: `The image is too small: at least ${lim.minSide} x ${lim.minSide} pixels.` };
  if (Math.max(w, h) > lim.maxSide) return { why: `The image is too big: at most ${lim.maxSide} x ${lim.maxSide} pixels.` };
  if (Math.max(w, h) / Math.min(w, h) > lim.maxRatio) return { why: `Make it square (yours is ${w} x ${h}).` };
  return { ok: info };
}

const STATUS = { pending: '🟠 Waiting for a manager', approved: '✅ Approved', rejected: '❌ Rejected', deleted: '⚪ Withdrawn', failed: '⚪ Did not finish' };
const fmt = (r) => `${r.mime?.split('/')[1]?.toUpperCase() ?? '?'}${r.animated ? ' · animated' : ''} · ${r.width} x ${r.height} · ${kb(r.size)}`;
const line = (r) => `${KINDS[r.kind]?.icon ?? '🖼️'} #${r.id} · ${r.name} · ${KINDS[r.kind]?.label ?? r.kind} · ${STATUS[r.status] ?? r.status}`;

/** the private receipt to the member */
export function receiptMessage(env, row, left) {
  const k = KINDS[row.kind];
  return message({
    accent: 'red', ephemeral: true, mentions: { parse: [] },
    blocks: [cards(bannerUrl(env, 'emoji')), header({ eyebrow: `${orgName(env)} · ${k.label} suggestion`, title: 'Sent to the managers', sub: `:${row.name}:`, size: 3 }),
      text([['Number', `#${row.id}`], ['Name', row.name], ['Type', `${k.icon} ${k.label}`], ['Image', fmt(row)], ['Status', STATUS.pending]].map(([a, v]) => `**${a}**\n${v}`).join('\n\n')), sep(),
      text(`Managers decide if it joins the server. Nothing is shown publicly. /emoji mine shows the answer, /emoji delete withdraws it.${left != null ? ` ${left} more can wait for review.` : ''}`),
      footer(`${orgName(env)} · Rise. Burn. Repeat.`)],
  });
}
/** the manager review card. `preview` is Discord's own attachment link, used only on the first post (it expires): later edits drop the picture. */
export function reviewMessage(env, row, preview = null) {
  const k = KINDS[row.kind] ?? KINDS.emoji, live = row.status === 'pending';
  const by = row.reviewed_name ? ` by ${clean(row.reviewed_name, 40)}` : '';
  const rows = [['Name', `:${row.name}:`], ['Type', `${k.icon} ${k.label}`], ['Image', fmt(row)], ['From', `<@${row.user_id}>`], ['Status', `${STATUS[row.status] ?? row.status}${row.status === 'approved' || row.status === 'rejected' ? by : ''}`]];
  return message({
    accent: row.status === 'approved' ? 'win' : live ? 'red' : 'steel', mentions: { parse: [] },
    blocks: [cards(bannerUrl(env, 'emoji')), header({ eyebrow: `${orgName(env)} · ${k.label} suggestion`, title: clean(row.user_name, 40) || 'A player', sub: `:${row.name}:`, size: 3 }),
      preview ? cards(preview) : null,
      text(rows.map(([a, v]) => `**${a}**\n${v}`).join('\n\n')), sep(),
      live ? buttons([{ label: 'Approve', id: `norex:emo:ok:${row.id}`, style: 'ok', emoji: '✅' }, { label: 'Reject', id: `norex:emo:no:${row.id}`, style: 'bad', emoji: '❌' }]) : null,
      footer(`${orgName(env)} · ${row.kind === 'sticker' ? 'approved stickers are kept; they are not added to the server yet' : 'approving an emoji adds it to the server'}`)].filter(Boolean),
  });
}
async function postCard(env, row, preview) {
  const channel = await channelFor(env, 'emoji_review').catch(() => null);
  if (!channel) return { skipped: 'no-channel' };
  try {
    const m = await discord(matchdayEnv(env), 'POST', `/channels/${channel}/messages`, reviewMessage(env, row, preview));
    await env.DB.prepare('UPDATE emoji_suggestions SET channel_id = ?, message_id = ? WHERE id = ?').bind(channel, m?.id ?? null, row.id).run();
    return { posted: true };
  } catch { return { skipped: 'error' }; }
}
async function refreshCard(env, row) {
  if (!row.channel_id || !row.message_id) return;
  const m = reviewMessage(env, row);
  await discord(matchdayEnv(env), 'PATCH', `/channels/${row.channel_id}/messages/${row.message_id}`, { flags: m.flags, components: m.components, allowed_mentions: m.allowed_mentions }).catch(() => null);
}

/** downloads the attachment, checks it, then reserves the row (pending cap and duplicate name inside the INSERT) and stores the file. → a message (receipt or notice) */
export async function storeSuggestion(env, i, att, o, now = Date.now(), { sourceId = null } = {}) {
  const uid = userOf(i);
  if (!uid) return notice('I could not tell who you are');
  if (!env.MEDIA) return notice('Image storage is not switched on yet', 'A manager has to connect the media storage first.');
  const kind = KINDS[o.type] ? o.type : null, url = cdnUrl(att?.url), declared = Number(att?.size) || 0;
  if (!kind) return notice('Pick emoji or sticker');
  if (!att || !url) return notice('I need an image', 'Attach a PNG, JPEG or GIF to the command.');
  const name = cleanName(o.name, kind);
  if (!name) return notice('That name does not work', `Use 2 to ${KINDS[kind].nameMax} letters, digits or underscores, like phoenix_flame.`);
  const lim = limits(env, kind);
  if (declared > lim.maxBytes) return notice('That image is too big', validate(env, kind, { length: declared }).why);
  const sum = await env.DB.prepare("SELECT COALESCE(SUM(size), 0) AS n FROM emoji_suggestions WHERE status IN ('pending', 'approved')").first();
  const mediaSum = await env.DB.prepare('SELECT COALESCE(SUM(size), 0) AS n FROM media WHERE gone = 0').first();
  if (Math.max(await usedBytes(env), (sum?.n || 0) + (mediaSum?.n || 0)) + declared >= REFUSE_AT) return notice('Club storage is nearly full', 'Uploads are paused until old files are cleared. Tell a manager.');
  let bytes;
  try {
    const res = await fetch(url);
    if (!res.ok || !res.body) return notice('The upload did not finish', 'Discord would not hand over the file. Try again.');
    const len = Number(res.headers.get('Content-Length')) || declared;
    if (len > lim.maxBytes) return notice('That image is too big', validate(env, kind, { length: len }).why);
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch { return notice('The upload did not finish', 'Try again in a minute.'); }
  const v = validate(env, kind, bytes, { copy: !!sourceId });
  if (!v.ok) return notice('That image cannot be used', v.why);
  const info = v.ok, key = `emoji/${hex(16)}.${EXT[info.mime]}`;
  // the pending cap and the duplicate name sit inside the INSERT so parallel submissions cannot slip past them
  const ins = await env.DB.prepare(`INSERT INTO emoji_suggestions (user_id, user_name, name, kind, key, mime, width, height, animated, size, status, created_at, source_id) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?
    WHERE (SELECT COUNT(*) FROM emoji_suggestions WHERE user_id = ? AND status = 'pending') < ?
    AND NOT EXISTS (SELECT 1 FROM emoji_suggestions WHERE kind = ? AND lower(name) = lower(?) AND status IN ('pending', 'approved'))`)
    .bind(uid, clean(byOf(i), 40), name, kind, key, info.mime, info.width, info.height, info.animated ? 1 : 0, bytes.length, now, sourceId, uid, lim.maxPending, kind, name).run();
  if (!ins.meta?.changes) {
    const taken = await env.DB.prepare("SELECT 1 AS x FROM emoji_suggestions WHERE kind = ? AND lower(name) = lower(?) AND status IN ('pending', 'approved')").bind(kind, name).first();
    return taken ? notice('That name is taken', `A ${kind} called :${name}: is already waiting or approved. Pick another name.`) : notice('Too many are waiting', `You can have ${lim.maxPending} suggestions waiting for review. Wait for an answer or /emoji delete one.`);
  }
  try {
    await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: info.mime }, customMetadata: { user: uid, kind: 'emoji' } });
  } catch {
    await env.DB.prepare("UPDATE emoji_suggestions SET status = 'failed' WHERE key = ?").bind(key).run().catch(() => null);
    return notice('The upload did not finish', 'Try again in a minute.'); // nothing about the image is logged
  }
  const row = await env.DB.prepare('SELECT * FROM emoji_suggestions WHERE key = ?').bind(key).first();
  await postCard(env, row, att.url);
  const waiting = (await env.DB.prepare("SELECT COUNT(*) AS n FROM emoji_suggestions WHERE user_id = ? AND status = 'pending'").bind(uid).first())?.n ?? 0;
  return receiptMessage(env, row, Math.max(0, lim.maxPending - waiting));
}

/** approve or reject a pending suggestion (once: the UPDATE only matches a pending row). → the row after, or null when it was not pending */
export async function decide(env, id, action, byId, byName, now = Date.now()) {
  const status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : null;
  if (!status || !env.DB) return null;
  const r = await env.DB.prepare("UPDATE emoji_suggestions SET status = ?, reviewed_by = ?, reviewed_name = ?, reviewed_at = ? WHERE id = ? AND status = 'pending'").bind(status, byId, clean(byName, 40), now, id).run();
  if (!r.meta?.changes) return null;
  const row = await env.DB.prepare('SELECT * FROM emoji_suggestions WHERE id = ?').bind(id).first();
  if (status === 'approved' && row.kind === 'emoji') { // the row is claimed first, so two presses can never upload twice
    const added = await addToServer(env, row).catch(() => ({ ok: false, error: 'Discord did not answer. Try again.' }));
    if (!added.ok) {
      await env.DB.prepare("UPDATE emoji_suggestions SET status = 'pending', reviewed_by = NULL, reviewed_name = NULL, reviewed_at = NULL WHERE id = ?").bind(id).run();
      return { ...row, status: 'pending', importError: added.error };
    }
    await env.DB.prepare('UPDATE emoji_suggestions SET emoji_id = ? WHERE id = ?').bind(added.emoji.id, id).run();
    row.emoji_id = added.emoji.id;
  }
  await refreshCard(env, row);
  return row;
}

// ---------- copy from another server ----------
// Requests may come from any server, but only from someone who is in ours.
async function isMember(env, i) {
  const e = funEnv(env);
  if (!e.DISCORD_GUILD_ID) return false;
  if (String(i.guild_id ?? '') === String(e.DISCORD_GUILD_ID)) return true;
  const r = await fetch(`https://discord.com/api/v10/guilds/${e.DISCORD_GUILD_ID}/members/${userOf(i)}`, { headers: { Authorization: `Bot ${e.DISCORD_BOT_TOKEN}` } }).catch(() => null);
  return !!r?.ok;
}
/** the custom emojis in a pasted string or in the right-clicked message, each sent through the same checks and queue as an upload. → a message */
export async function copyRequest(env, i, now = Date.now()) {
  const menu = i.data?.type === 3;
  const o = Object.fromEntries((i.data?.options?.[0]?.options ?? []).map((x) => [x.name, x.value]));
  const found = parseEmojis(menu ? i.data.resolved?.messages?.[i.data.target_id]?.content : o.emoji);
  if (!found.length) return notice('No custom emojis found', menu ? 'That message has no custom server emojis in its text. Unicode emojis (😀) have no image to copy.' : 'Paste a custom emoji. Unicode emojis (😀) have no image to copy.');
  if (!(await isMember(env, i))) return notice('Phoenix members only', 'Join the Phoenix server first, then you can request emojis from anywhere.');
  const s = await slots(funEnv(env)).catch(() => ({ ok: false }));
  const have = new Set(s.ok ? s.emojis.map((e) => e.id) : []);
  const sent = [], skipped = [];
  let last = null;
  for (const e of found.slice(0, MAX_COPY)) {
    const dup = await env.DB.prepare("SELECT status FROM emoji_suggestions WHERE (source_id = ? OR emoji_id = ?) AND status IN ('pending', 'approved') LIMIT 1").bind(e.id, e.id).first();
    if (dup || have.has(e.id)) { skipped.push(`:${e.name}: ${dup?.status === 'pending' ? 'is already waiting' : 'is already ours'}`); continue; }
    const name = (found.length === 1 && o.name) || (cleanName(e.name) ? e.name : `${e.name}_emoji`);
    last = await storeSuggestion(env, i, { url: emojiImage(e.id, e.animated), size: 0 }, { type: 'emoji', name }, now, { sourceId: e.id });
    const row = await env.DB.prepare("SELECT name FROM emoji_suggestions WHERE source_id = ? AND status = 'pending'").bind(e.id).first();
    if (row) sent.push(row.name); else skipped.push(`:${e.name}: was not sent`);
  }
  if (found.length > MAX_COPY) skipped.push(`only the first ${MAX_COPY} are read`);
  if (sent.length) await safely(notifyManagers(env, { icon: '😀', title: `Emoji waiting for review: ${sent.map((n) => `:${n}:`).join(' ')}`, body: 'Approve or reject on the review card or in the Control Center.', link: 'members.html#manager' }, userOf(i)));
  if (found.length === 1 && last) return last; // the usual receipt, or the exact reason it was refused
  return notice(sent.length ? 'Sent to the managers' : 'Nothing new to send', [sent.length ? sent.map((n) => `:${n}:`).join(' ') : '', ...skipped].filter(Boolean).join('\n'));
}
// Work that can outlast Discord's 3 seconds: answer "thinking" privately, then fill the reply in.
async function deferred(env, i, ctx, make) {
  const work = (async () => {
    const m = await make().catch(() => notice('The upload did not finish', 'Try again in a minute.'));
    await fetch(`https://discord.com/api/v10/webhooks/${env.DISCORD_APP_ID}/${i.token}/messages/@original`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ flags: m.flags, components: m.components, allowed_mentions: m.allowed_mentions ?? { parse: [] } }),
    }).catch(() => null);
  })();
  if (ctx?.waitUntil) ctx.waitUntil(work); else await work;
  return { type: 5, data: { flags: (1 << 15) | 64 } };
}

async function mine(env, uid) {
  const rows = (await env.DB.prepare("SELECT * FROM emoji_suggestions WHERE user_id = ? AND status IN ('pending', 'approved', 'rejected') ORDER BY id DESC LIMIT 15").bind(uid).all()).results ?? [];
  return note('Your suggestions', rows.length ? rows.map(line).join('\n') : 'None yet. /emoji suggest sends one.');
}
async function remove(env, i, who, n, now) {
  const uid = userOf(i), mgr = can(who, 'emoji.review');
  const row = n ? await env.DB.prepare('SELECT * FROM emoji_suggestions WHERE id = ?').bind(n).first() : await env.DB.prepare("SELECT * FROM emoji_suggestions WHERE user_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1").bind(uid).first();
  // a member withdraws only a pending one (an approved image is kept for the importer); a manager may remove any
  if (!row || !['pending', 'approved', 'rejected'].includes(row.status) || (!mgr && (row.user_id !== uid || row.status !== 'pending'))) return note('Nothing to delete', 'No suggestion of yours that is still waiting has that number.');
  if (env.MEDIA) await env.MEDIA.delete(row.key).catch(() => null);
  await env.DB.prepare("UPDATE emoji_suggestions SET status = 'deleted', reviewed_by = ?, reviewed_at = ? WHERE id = ?").bind(uid, now, row.id).run();
  await refreshCard(env, { ...row, status: 'deleted' });
  return note('Removed', `#${row.id} :${row.name}: is removed from storage.`);
}

/** i = the interaction; ctx = the Worker's execution context (the copy can take longer than Discord's 3 seconds). → the interaction response */
export async function emojiCommand(i, env, who, ctx, now = Date.now()) {
  if (!flagOn(env, who, EMOJI_FLAG)) return note('Not switched on yet', 'Emoji and sticker suggestions are being tested.');
  if (!can(who, 'emoji.suggest')) return note('Members only');
  if (!env.DB) return note('The member database is not connected');
  const sub = i.data?.options?.[0], o = Object.fromEntries((sub?.options ?? []).map((x) => [x.name, x.value]));
  if (sub?.name === 'suggest') {
    const att = i.data?.resolved?.attachments?.[o.image];
    return deferred(env, i, ctx, () => storeSuggestion(env, i, att, o, now));
  }
  if (i.data?.type === 3 || sub?.name === 'copy') return deferred(env, i, ctx, () => copyRequest(env, i, now));
  if (sub?.name === 'stats') {
    if (!can(who, 'emoji.review')) return note('Managers only');
    return reply(await statsPanel(env, now));
  }
  if (sub?.name === 'mine') return mine(env, userOf(i));
  if (sub?.name === 'delete') return remove(env, i, who, Number(o.number) || 0, now);
  if (sub?.name === 'review') {
    if (!can(who, 'emoji.review')) return note('Managers only');
    const rows = (await env.DB.prepare("SELECT * FROM emoji_suggestions WHERE status = 'pending' ORDER BY id LIMIT 25").all()).results ?? [];
    return reply(message({ accent: 'red', ephemeral: true, mentions: { parse: [] }, blocks: [header({ eyebrow: `${orgName(env)} · Emoji and stickers`, title: 'Waiting for review', size: 3 }), text(rows.length ? rows.map((r) => `${line(r)} · <@${r.user_id}>`).join('\n') : 'Nothing is waiting.'), footer('Approve or reject on the cards in the review channel, or in the Control Center.')] }));
  }
  return note('Pick suggest, copy, mine, delete, review or stats');
}

/** the Approve and Reject buttons on the review card (managers only) */
export async function emojiButton(i, env, who, now = Date.now()) {
  if (!can(who, 'emoji.review')) return note('Managers only', 'A manager approves or rejects emoji and sticker suggestions.');
  const [, , verb, idRaw] = String(i.data?.custom_id ?? '').split(':'), id = Number(idRaw);
  const row = env.DB ? await env.DB.prepare('SELECT * FROM emoji_suggestions WHERE id = ?').bind(id).first() : null;
  if (!row) return note('That suggestion is gone');
  const cur = row.status === 'pending' ? (await decide(env, id, verb === 'ok' ? 'approve' : 'reject', userOf(i), byOf(i), now)) ?? await env.DB.prepare('SELECT * FROM emoji_suggestions WHERE id = ?').bind(id).first() : row;
  if (cur.importError) return note('Not added yet', cur.importError); // the card stays as it is, with its buttons
  const m = reviewMessage(env, cur);
  return { type: 7, data: { flags: m.flags, components: m.components, allowed_mentions: m.allowed_mentions } };
}

/** the Control Center review API (managers; listed in bot/ccpermissions.js):
 *  GET /api/emoji/review → the waiting ones first, then the latest decided;  GET /api/emoji/review/file?id=N → { dataUrl } of the stored image (on request, never in the list);
 *  POST /api/emoji/review/decide { id, action: approve | reject } */
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
const pub = (r) => ({ id: r.id, userId: r.user_id, user: r.user_name, name: r.name, kind: r.kind, mime: r.mime, width: r.width, height: r.height, animated: !!r.animated, size: r.size, status: r.status, createdAt: r.created_at, reviewedBy: r.reviewed_name, reviewedAt: r.reviewed_at });
export async function emojiRoute(p, method, body, me, env, url, now = Date.now()) {
  if (!p.startsWith('/api/emoji/review')) return null;
  if (!flagOn(env, me, EMOJI_FLAG)) return json({ error: 'Not available yet.' }, 404);
  if (!can(me, 'emoji.review')) return json({ error: 'Managers only.' }, 403);
  if (!env.DB) return json({ error: 'The member database is not connected.' }, 503);
  if (p === '/api/emoji/review/stats' && method === 'GET') return json(await statsData(env, now));
  if (p === '/api/emoji/review' && method === 'GET') {
    const wait = (await env.DB.prepare("SELECT * FROM emoji_suggestions WHERE status = 'pending' ORDER BY id LIMIT 100").all()).results ?? [];
    const done = (await env.DB.prepare("SELECT * FROM emoji_suggestions WHERE status IN ('approved', 'rejected') ORDER BY id DESC LIMIT 50").all()).results ?? [];
    return json({ items: [...wait, ...done].map(pub), limits: { emojiKb: Math.round(limits(env, 'emoji').maxBytes / KIB), stickerKb: Math.round(limits(env, 'sticker').maxBytes / KIB) } });
  }
  if (p === '/api/emoji/review/file' && method === 'GET') {
    const row = await env.DB.prepare("SELECT * FROM emoji_suggestions WHERE id = ? AND status IN ('pending', 'approved', 'rejected')").bind(Number(url?.searchParams?.get('id')) || 0).first();
    const obj = row && env.MEDIA ? await env.MEDIA.get(row.key) : null;
    if (!obj) return json({ error: 'Not found.' }, 404);
    const buf = new Uint8Array(await new Response(obj.body).arrayBuffer());
    let bin = ''; for (let k = 0; k < buf.length; k += 8192) bin += String.fromCharCode(...buf.subarray(k, k + 8192));
    return json({ dataUrl: `data:${row.mime};base64,${btoa(bin)}` });
  }
  if (p === '/api/emoji/review/decide' && method === 'POST') {
    const id = Number(body?.id) || 0, row = await decide(env, id, String(body?.action), me.u ?? me.id ?? '', me.name ?? me.username ?? 'Manager', now);
    if (row?.importError) return json({ error: row.importError }, 409);
    return row ? json({ item: pub(row) }) : json({ error: 'That suggestion is not waiting any more.' }, 409);
  }
  return json({ error: 'Not found' }, 404);
}
