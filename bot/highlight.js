// PF-024 Item 18 – the highlight clip upload, /highlight upload | mine | delete | list in the matchday app (the tools app is at the 25 help-page limit).
//   upload  a member attaches a clip (mp4 / webm / mov) with an optional title and note. The bot copies it from Discord's attachment URL into R2 (binding MEDIA, key hl/…)
//           and writes an index row (user, title, size, type, created, status `stored`). The reply is a private receipt. NOTHING ELSE happens: the clip is not served, not posted,
//           not shared (the social automation comes later and reads the `stored` rows). If the Organization config has a channel for purpose `highlights`, a small card
//           (who, title, size: never the file or its link) is posted there; none set = no post.
//   mine    the member's own clips.   delete  the uploader or a manager removes one (R2 object deleted, row kept as `deleted`).   list  managers: the latest stored clips.
// Limits come from config (config.json `highlight`, copied to the Worker var HIGHLIGHT by bot.yml); code only holds safe defaults and a hard ceiling.
// Safety: the file is validated by declared type AND by its first bytes, never more than the declared size, only from Discord's CDN hosts; per-member daily limit is
// enforced inside the INSERT (atomic); storage uses the existing club storage guard figure and refuses before the bucket is full. Nothing about the clip is logged.
import { can, flagOn } from './roles.js';
import { message, notice, reply, header, text, sep, footer, cards, bannerUrl } from './ui.js';
import { orgName, channelFor } from './orgconfig.js';
import { discord } from './servertools.js';
import { appConfigured, appEnv } from './apps.js';
import { sniff, usedBytes, mb, hex, MB, REFUSE_AT } from './media.js';

export const HIGHLIGHT_COMMANDS = new Set(['highlight']);
export const HIGHLIGHT_FLAG = 'highlight';
export const DEFAULTS = { maxMb: 50, perDay: 5, hardMaxMb: 100 };
export const TYPES = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };
const EXT_TYPE = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' };
export const CDN_HOSTS = ['cdn.discordapp.com', 'media.discordapp.net'];
const DAY = 864e5;
const clean = (s, n) => String(s ?? '').replace(/<(@[!&]?|#)\d+>|@(everyone|here)/g, '').replace(/[\u0000-\u001f<>"]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const note = (title, body = '') => reply(notice(title, body));
const userOf = (i) => i.member?.user?.id ?? i.user?.id ?? '';
const byOf = (i) => i.member?.nick || i.member?.user?.global_name || i.member?.user?.username || i.user?.username || 'Member';

/** limits from the Worker var HIGHLIGHT (config.json `highlight`), clamped to safe values */
export function limits(env) {
  let c = {}; try { c = JSON.parse(env.HIGHLIGHT || '{}'); } catch { /* defaults */ }
  const num = (v, d, lo, hi) => (Number.isFinite(Number(v)) && Number(v) >= lo ? Math.min(Number(v), hi) : d);
  const maxMb = num(c.maxMb, DEFAULTS.maxMb, 1, DEFAULTS.hardMaxMb);
  return { maxBytes: maxMb * MB, maxMb, perDay: Math.floor(num(c.perDay, DEFAULTS.perDay, 1, 50)) };
}
/** the clip's type from Discord's content_type, else its file extension; null = not allowed */
export function typeOf(att) {
  const ct = String(att?.content_type ?? '').split(';')[0].trim().toLowerCase();
  if (TYPES[ct]) return ct;
  if (ct && ct !== 'application/octet-stream') return null;
  return EXT_TYPE[String(att?.filename ?? '').split('.').pop().toLowerCase()] ?? null;
}
export function cdnUrl(u) {
  try { const x = new URL(String(u)); return x.protocol === 'https:' && CDN_HOSTS.includes(x.hostname) ? x : null; } catch { return null; }
}
const highlightEnv = (env) => (appConfigured(env, 'matchday') && env.BOT_APP !== 'matchday' ? appEnv(env, 'matchday') : env);

/** the private receipt */
export function receiptMessage(env, row, left) {
  const t = TYPES[row.type]?.toUpperCase() ?? 'VIDEO';
  return message({
    accent: 'red', ephemeral: true, mentions: { parse: [] },
    blocks: [cards(bannerUrl(env, 'highlight')), header({ eyebrow: `${orgName(env)} · Highlight clip`, title: 'Clip stored', sub: row.title || 'Untitled clip', size: 3 }),
      text([['Clip', `#${row.id}`], ['Title', row.title || '-'], ['Type', t], ['Size', mb(row.size)], ['Status', '✅ Stored privately']].map(([k, v]) => `**${k}**\n${v}`).join('\n\n')), sep(),
      text(`Nothing is posted or shared yet. /highlight mine lists your clips, /highlight delete removes one.${left != null ? ` ${left} upload${left === 1 ? '' : 's'} left today.` : ''}`),
      footer(`${orgName(env)} · Rise. Burn. Repeat.`)],
  });
}
/** the optional channel card: who and what, never the file or a link to it */
export function channelCard(env, row) {
  return message({
    accent: 'red', mentions: { parse: [] },
    blocks: [cards(bannerUrl(env, 'highlight')), header({ eyebrow: `${orgName(env)} · New highlight`, title: row.title || 'Untitled clip', sub: `from ${clean(row.user_name, 40) || 'a player'}`, size: 3 }),
      text(`🎬 ${mb(row.size)} · ${TYPES[row.type]?.toUpperCase() ?? 'VIDEO'}`), footer(`${orgName(env)} · the clip is stored privately`)],
  });
}
const line = (r) => `🎬 #${r.id} · ${r.title || 'Untitled'} · ${mb(r.size)} · ${TYPES[r.type] ?? '?'} · ${r.status === 'stored' ? '✅ stored' : r.status}`;

/** copies the attachment into R2 and writes the row. → a message (receipt or notice) */
export async function storeClip(env, i, att, o, now = Date.now()) {
  const lim = limits(env), uid = userOf(i);
  if (!uid) return notice('I could not tell who you are');
  if (!env.MEDIA) return notice('Clip storage is not switched on yet', 'A manager has to connect the media storage first.');
  const type = typeOf(att), url = cdnUrl(att?.url), size = Number(att?.size) || 0;
  if (!att || !url) return notice('I need a clip file', 'Attach an MP4, WebM or MOV clip to the command.');
  if (!type) return notice('That file type is not allowed', 'Clips only: MP4, WebM or MOV.');
  if (!size) return notice('That file is empty');
  if (size > lim.maxBytes) return notice('That clip is too big', `The limit is ${lim.maxMb} MB and this one is ${mb(size)}. Trim it and try again.`);
  const sum = await env.DB.prepare("SELECT COALESCE(SUM(size), 0) AS n FROM highlights WHERE status IN ('pending', 'stored')").first();
  const mediaSum = await env.DB.prepare('SELECT COALESCE(SUM(size), 0) AS n FROM media WHERE gone = 0').first();
  if (Math.max(await usedBytes(env), (sum?.n || 0) + (mediaSum?.n || 0)) + size >= REFUSE_AT) return notice('Club storage is nearly full', 'Uploads are paused until old files are cleared. Tell a manager.');
  const key = `hl/${hex(16)}.${TYPES[type]}`, title = clean(o.title, 80), memo = clean(o.note, 300);
  // reserve the row first: the daily limit sits inside the INSERT so parallel uploads cannot slip past it
  const ins = await env.DB.prepare(`INSERT INTO highlights (user_id, user_name, title, note, key, type, size, status, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, 'pending', ?
    WHERE (SELECT COUNT(*) FROM highlights WHERE user_id = ? AND created_at > ? AND status != 'failed') < ?`)
    .bind(uid, clean(byOf(i), 40), title, memo, key, type, size, now, uid, now - DAY, lim.perDay).run();
  if (!ins.meta?.changes) return notice('That is today\'s limit', `${lim.perDay} clips a day per member. More tomorrow.`);
  const fail = async (why) => { await env.DB.prepare("UPDATE highlights SET status = 'failed' WHERE key = ?").bind(key).run().catch(() => null); return notice('The upload did not finish', why); };
  try {
    const res = await fetch(url);
    const len = Number(res.headers.get('Content-Length')) || size;
    if (!res.ok || !res.body) return await fail('Discord would not hand over the file. Try again.');
    if (len !== size || len > lim.maxBytes) return await fail('The file size did not match. Try again.');
    await env.MEDIA.put(key, checked(res.body, len, type), { httpMetadata: { contentType: type }, customMetadata: { user: uid, kind: 'highlight' } });
  } catch (e) {
    await env.MEDIA.delete(key).catch(() => null);
    return fail(e.message === 'type' ? 'That does not look like a real MP4, WebM or MOV file.' : 'Try again in a minute.'); // nothing about the clip is logged
  }
  await env.DB.prepare("UPDATE highlights SET status = 'stored' WHERE key = ?").bind(key).run();
  const row = await env.DB.prepare('SELECT * FROM highlights WHERE key = ?').bind(key).first();
  const used = (await env.DB.prepare("SELECT COUNT(*) AS n FROM highlights WHERE user_id = ? AND created_at > ? AND status != 'failed'").bind(uid, now - DAY).first())?.n ?? 0;
  const channel = await channelFor(env, 'highlights').catch(() => null);
  if (channel) await discord(highlightEnv(env), 'POST', `/channels/${channel}/messages`, channelCard(env, row)).catch(() => null);
  return receiptMessage(env, row, Math.max(0, lim.perDay - used));
}
// streams the body through a size and type check (first bytes must match the declared type), never more than the declared length
function checked(body, len, type) {
  let seen = 0, head = new Uint8Array(0), ok = false;
  const check = new TransformStream({
    transform(chunk, c) {
      seen += chunk.byteLength;
      if (seen > len) return c.error(new Error('size'));
      if (!ok) {
        const h = new Uint8Array(Math.min(16, head.length + chunk.byteLength));
        h.set(head.subarray(0, h.length)); h.set(chunk.subarray(0, h.length - head.length), head.length);
        head = h;
        if (head.length >= 12 || seen === len) { if (!sniff(head, type)) return c.error(new Error('type')); ok = true; }
      }
      c.enqueue(chunk);
    },
    flush(c) { if (seen !== len) c.error(new Error('size')); },
  });
  const out = body.pipeThrough(check);
  return typeof FixedLengthStream === 'function' ? out.pipeThrough(new FixedLengthStream(len)) : out;
}

async function mine(env, uid) {
  const rows = (await env.DB.prepare("SELECT * FROM highlights WHERE user_id = ? AND status = 'stored' ORDER BY id DESC LIMIT 10").bind(uid).all()).results ?? [];
  return note('Your highlight clips', rows.length ? rows.map(line).join('\n') : 'None stored.');
}
async function remove(env, i, who, n, now) {
  const uid = userOf(i), row = n ? await env.DB.prepare('SELECT * FROM highlights WHERE id = ?').bind(n).first() : await env.DB.prepare("SELECT * FROM highlights WHERE user_id = ? AND status = 'stored' ORDER BY id DESC LIMIT 1").bind(uid).first();
  if (!row || row.status !== 'stored' || (row.user_id !== uid && !can(who, 'highlight.manage'))) return note('Nothing to delete', 'No stored clip with that number is yours.');
  if (env.MEDIA) await env.MEDIA.delete(row.key).catch(() => null);
  await env.DB.prepare("UPDATE highlights SET status = 'deleted', deleted_at = ?, deleted_by = ? WHERE id = ?").bind(now, uid, row.id).run();
  return note('Clip deleted', `#${row.id} is removed from storage.`);
}

/** i = the interaction; ctx = the Worker's execution context (the copy can take longer than Discord's 3 seconds). → the interaction response */
export async function highlightCommand(i, env, who, ctx, now = Date.now()) {
  if (!flagOn(env, who, HIGHLIGHT_FLAG)) return note('Not switched on yet', 'Highlight uploads are being tested.');
  if (!can(who, 'highlight.upload')) return note('Members only');
  if (!env.DB) return note('The member database is not connected');
  const sub = i.data?.options?.[0], o = Object.fromEntries((sub?.options ?? []).map((x) => [x.name, x.value]));
  if (sub?.name === 'upload') {
    const att = i.data?.resolved?.attachments?.[o.clip];
    const work = (async () => {
      const m = await storeClip(env, i, att, o, now).catch(() => notice('The upload did not finish', 'Try again in a minute.'));
      const body = m; // notice() and message() return the message data
      await fetch(`https://discord.com/api/v10/webhooks/${env.DISCORD_APP_ID}/${i.token}/messages/@original`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ flags: body.flags, components: body.components, allowed_mentions: body.allowed_mentions ?? { parse: [] } }),
      }).catch(() => null);
    })();
    if (ctx?.waitUntil) { ctx.waitUntil(work); return { type: 5, data: { flags: (1 << 15) | 64 } }; }
    await work; return { type: 5, data: { flags: (1 << 15) | 64 } };
  }
  if (sub?.name === 'mine') return mine(env, userOf(i));
  if (sub?.name === 'delete') return remove(env, i, who, Number(o.number) || 0, now);
  if (sub?.name === 'list') {
    if (!can(who, 'highlight.manage')) return note('Managers only');
    const rows = (await env.DB.prepare("SELECT * FROM highlights WHERE status = 'stored' ORDER BY id DESC LIMIT 25").all()).results ?? [];
    return reply(message({ accent: 'red', ephemeral: true, blocks: [header({ eyebrow: `${orgName(env)} · Highlights`, title: 'Stored clips', size: 3 }), text(rows.length ? rows.map((r) => `${line(r)} · <@${r.user_id}>`).join('\n') : 'No clips stored.'), footer('Clips are stored privately and not served anywhere.')] }));
  }
  return note('Pick upload, mine, delete or list');
}
