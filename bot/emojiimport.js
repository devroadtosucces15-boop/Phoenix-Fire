// The importer and the numbers behind bot/emoji.js:
//   parseEmojis       the custom emojis in a pasted string or a message (copying from other servers)
//   addToServer       an approved suggestion (stored in R2) is uploaded to the Phoenix server – needs Manage Expressions
//   statsData/Panel   free slots (they follow the Boost level), request counts, most and least used emojis
//   emojiScan         10-minute cron: counts the server's own emojis in new messages and reactions. The Worker has no Gateway, so counting
//                     starts when the scan switches on and a reaction is seen only if it was there when the scan looked.
import { message, header, text, sep, footer } from './ui.js';
import { appConfigured, appCreds, appEnv } from './apps.js';

const DAY = 86400e3, FRESH_DAYS = 14, STAT_DAYS = 30;
const API = 'https://discord.com/api/v10';
const TIER_SLOTS = [50, 100, 150, 250]; // per kind (static / animated), by Boost level
const one = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).first();
const all = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).all().then((r) => r.results ?? []);
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
// Server writes and reads use the Fun app's bot when it has a token (the role that gets Manage Expressions), whichever app the click arrived on.
export const funEnv = (env) => (appConfigured(env, 'fun') && appCreds(env, 'fun').token && env.BOT_APP !== 'fun' ? appEnv(env, 'fun') : env);

// ---------- emoji helpers (pure) ----------
const EMOJI_RE = /<(a?):(\w{1,32}):(\d{17,20})>/g;
// Unique custom emojis in a string, in order. Unicode emojis have no image to copy, so they are skipped.
export function parseEmojis(str = '') {
  const seen = new Map();
  for (const [, a, name, id] of String(str).matchAll(EMOJI_RE)) if (!seen.has(id)) seen.set(id, { id, name, animated: a === 'a' });
  return [...seen.values()];
}
export const emojiImage = (id, animated, size = 128) => `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}?size=${size}`;
export const emojiTag = (e) => `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>`;
export const snowflakeTime = (id) => { try { return Number(BigInt(id) >> 22n) + 1420070400000; } catch { return 0; } };
const timeSnowflake = (ms) => String((BigInt(Math.max(0, ms - 1420070400000)) << 22n));
const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
// Slots per kind: the Boost level sets 50/100/150/250 for static and the same for animated, MORE_EMOJI servers have at least 200.
export const slotLimit = (tier = 0, features = []) => Math.max(TIER_SLOTS[tier] ?? 50, features.includes('MORE_EMOJI') ? 200 : 0);
export function toBase64(buf) {
  const b = new Uint8Array(buf); let s = '';
  for (let k = 0; k < b.length; k += 0x8000) s += String.fromCharCode(...b.subarray(k, k + 0x8000));
  return btoa(s);
}
// Counts the Phoenix server's own emojis in one message: text uses and reactions. ids = Set of the server's emoji IDs.
export function countMessage(m, ids) {
  const uses = new Map(), reacts = new Map();
  for (const [, , , id] of String(m.content ?? '').matchAll(EMOJI_RE)) if (ids.has(id)) uses.set(id, (uses.get(id) ?? 0) + 1);
  for (const r of m.reactions ?? []) if (r.emoji?.id && ids.has(r.emoji.id)) reacts.set(r.emoji.id, (reacts.get(r.emoji.id) ?? 0) + (r.count ?? 1));
  return { uses, reacts };
}

// ---------- Discord REST (the receiving app's bot) ----------
const bot = (env, path, init = {}) => fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers } });
// The server, its emojis and slot limits in one call.
export async function slots(env) {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) return { ok: false, error: 'The bot is not connected to the server yet.' };
  const r = await bot(env, `/guilds/${env.DISCORD_GUILD_ID}`).catch(() => null);
  if (!r?.ok) return { ok: false, error: 'Could not read the server’s emojis from Discord.' };
  const g = await r.json(), limit = slotLimit(g.premium_tier, g.features ?? []);
  const emojis = (g.emojis ?? []).map((e) => ({ id: e.id, name: e.name, animated: !!e.animated }));
  const used = { static: emojis.filter((e) => !e.animated).length, animated: emojis.filter((e) => e.animated).length };
  return { ok: true, emojis, limit, used, free: { static: limit - used.static, animated: limit - used.animated }, tier: g.premium_tier ?? 0 };
}
// ---------- the importer ----------
// Uploads a suggestion's stored image to the server. → { ok, emoji } or { ok:false, error }; nothing is half-done.
export async function addToServer(baseEnv, row) {
  const env = funEnv(baseEnv);
  const s = await slots(env);
  if (!s.ok) return s;
  const kind = row.animated ? 'animated' : 'static';
  if (s.free[kind] <= 0) return { ok: false, error: `No free ${kind} slots (${s.used[kind]}/${s.limit}). Free one up first: /emoji stats shows the least used.` };
  const obj = env.MEDIA ? await env.MEDIA.get(row.key) : null;
  if (!obj) return { ok: false, error: 'The stored image is gone, so there is nothing to add.' };
  const buf = await new Response(obj.body).arrayBuffer();
  if (buf.byteLength > 256 * 1024) return { ok: false, error: 'The image is over Discord’s 256 KB emoji limit.' };
  const res = await bot(env, `/guilds/${env.DISCORD_GUILD_ID}/emojis`, { method: 'POST', body: JSON.stringify({ name: row.name, image: `data:${row.mime};base64,${toBase64(buf)}` }) }).catch(() => null);
  const body = await res?.json().catch(() => ({}));
  if (!res?.ok) return { ok: false, error: body?.code === 50013 ? 'The Fun bot needs the Manage Expressions permission in the server.' : `Discord refused it${body?.message ? `: ${clean(body.message, 120)}` : ''}.` };
  return { ok: true, emoji: { id: body.id, name: body.name, animated: !!body.animated } };
}

// ---------- stats ----------
// Usage per emoji over the last STAT_DAYS days, joined with the server's real emoji list. Emojis younger than FRESH_DAYS are kept
// out of "least used": they haven't had time to be used.
export async function usageStats(env, s, now = Date.now()) {
  const since = dayKey(now - STAT_DAYS * DAY);
  const use = new Map((await all(env, 'SELECT emoji_id, SUM(uses) AS u, SUM(reactions) AS r FROM emoji_usage WHERE day >= ? GROUP BY emoji_id', since)).map((r) => [r.emoji_id, { uses: r.u, reactions: r.r }]));
  const rows = s.emojis.map((e) => { const u = use.get(e.id) ?? { uses: 0, reactions: 0 }; return { ...e, ...u, total: u.uses + u.reactions, age: Math.floor((now - snowflakeTime(e.id)) / DAY) }; });
  const eligible = rows.filter((r) => r.age >= FRESH_DAYS).sort((a, b) => a.total - b.total || a.name.localeCompare(b.name));
  const tracking = (await one(env, 'SELECT MIN(since) AS t, COUNT(*) AS n FROM emoji_scan')) ?? {};
  return { least: eligible.slice(0, 10), top: [...rows].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)).filter((r) => r.total > 0).slice(0, 5), fresh: rows.filter((r) => r.age < FRESH_DAYS).length, trackingSince: tracking.t ?? null, channels: tracking.n ?? 0 };
}
const counts = async (env) => Object.fromEntries((await all(env, "SELECT status, COUNT(*) AS n FROM emoji_suggestions WHERE kind = 'emoji' GROUP BY status")).map((r) => [r.status, r.n]));

export async function statsPanel(env, now = Date.now()) {
  const [c, s] = await Promise.all([counts(env), slots(funEnv(env))]);
  const req = `⏳ **${c.pending ?? 0}** waiting · ✅ **${c.approved ?? 0}** approved · ❌ **${c.rejected ?? 0}** rejected`;
  if (!s.ok) return message({ ephemeral: true, accent: 'steel', blocks: [header({ eyebrow: 'Staff · Emojis', title: 'Emoji stats', size: 3 }), text(req), text(`⚠️ ${s.error}`)] });
  const u = await usageStats(env, s, now), line = (r) => `${emojiTag(r)} \`:${r.name}:\` · ${r.uses} in text · ${r.reactions} reactions${r.age < 60 ? ` · ${r.age}d old` : ''}`;
  return message({ ephemeral: true, accent: 'steel', blocks: [
    header({ eyebrow: 'Staff · Emojis', title: 'Emoji stats', sub: `Boost level ${s.tier}`, size: 3 }),
    text(`**Slots**\nStatic **${s.used.static}/${s.limit}** (${s.free.static} free) · Animated **${s.used.animated}/${s.limit}** (${s.free.animated} free)`),
    text(`**Requests**\n${req}`),
    sep(),
    text(u.trackingSince
      ? `**Least used, last ${STAT_DAYS} days**\n${u.least.length ? u.least.map(line).join('\n') : 'Nothing old enough to judge yet.'}${u.fresh ? `\n-# ${u.fresh} newer than ${FRESH_DAYS} days left out.` : ''}`
      : '**Usage**\nNot counting yet. The usage scan runs with the `emoji` feature and needs the Fun bot to read the channels.'),
    u.top.length ? text(`**Most used**\n${u.top.map(line).join('\n')}`) : null,
    u.trackingSince ? footer(`Counted since <t:${Math.floor(u.trackingSince / 1000)}:D> in ${u.channels} channels · text uses and reactions seen by the scan · need space? Delete the least used in Server Settings → Emoji`) : null,
  ] });
}

// For the Control Center (GET /api/emoji/review/stats).
export async function statsData(env, now = Date.now()) {
  const c = await counts(env), s = await slots(funEnv(env)).catch(() => ({ ok: false }));
  const out = { counts: c, server: null };
  if (s.ok) {
    const u = await usageStats(env, s, now);
    const row = (r) => ({ id: r.id, name: r.name, animated: r.animated, uses: r.uses, reactions: r.reactions, ageDays: r.age, url: emojiImage(r.id, r.animated, 48) });
    out.server = { tier: s.tier, limit: s.limit, used: s.used, free: s.free, least: u.least.map(row), top: u.top.map(row), trackingSince: u.trackingSince, days: STAT_DAYS };
  }
  return out;
}

// ---------- usage scan (10-minute cron) ----------
// Counts the server's own emojis in new messages (text + reactions). A channel is first seen "now" (no backlog), then each run reads
// what is newer than its cursor. At most SCAN_CHANNELS per run, least recently scanned first, to stay inside the Worker's subrequest limit.
const SCAN_CHANNELS = 10;
export async function emojiScan(env, now = Date.now()) {
  if (!env.DB || !env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) return { scanned: 0 };
  const s = await slots(env);
  if (!s.ok || !s.emojis.length) return { scanned: 0 };
  const ids = new Set(s.emojis.map((e) => e.id));
  const cr = await bot(env, `/guilds/${env.DISCORD_GUILD_ID}/channels`).catch(() => null);
  if (!cr?.ok) return { scanned: 0 };
  const channels = (await cr.json()).filter((c) => c.type === 0 || c.type === 5);
  const known = new Map((await all(env, 'SELECT * FROM emoji_scan')).map((r) => [r.channel_id, r]));
  const fresh = channels.filter((c) => !known.has(c.id));
  if (fresh.length) await env.DB.batch(fresh.map((c) => env.DB.prepare('INSERT OR IGNORE INTO emoji_scan (channel_id, last_id, since, at) VALUES (?, ?, ?, ?)').bind(c.id, timeSnowflake(now), now, now)));
  const queue = channels.filter((c) => known.has(c.id)).sort((a, b) => known.get(a.id).at - known.get(b.id).at).slice(0, SCAN_CHANNELS);
  let scanned = 0, counted = 0;
  for (const c of queue) {
    const cur = known.get(c.id);
    const r = await bot(env, `/channels/${c.id}/messages?after=${cur.last_id}&limit=100`).catch(() => null);
    if (!r?.ok) { await env.DB.prepare('UPDATE emoji_scan SET at = ? WHERE channel_id = ?').bind(now, c.id).run(); continue; } // no access: try again later, others go first
    const msgs = (await r.json()).filter((m) => m?.id);
    scanned++;
    const per = new Map(); let newest = cur.last_id;
    for (const m of msgs) {
      if (BigInt(m.id) > BigInt(newest)) newest = m.id;
      if (m.author?.bot) continue;
      const { uses, reacts } = countMessage(m, ids), day = dayKey(Date.parse(m.timestamp) || now);
      for (const [id, n] of uses) { const k = `${id}|${day}`; const x = per.get(k) ?? { id, day, uses: 0, reactions: 0 }; x.uses += n; per.set(k, x); }
      for (const [id, n] of reacts) { const k = `${id}|${day}`; const x = per.get(k) ?? { id, day, uses: 0, reactions: 0 }; x.reactions += n; per.set(k, x); }
    }
    counted += per.size;
    await env.DB.batch([
      ...[...per.values()].map((x) => env.DB.prepare('INSERT INTO emoji_usage (emoji_id, day, uses, reactions) VALUES (?, ?, ?, ?) ON CONFLICT (emoji_id, day) DO UPDATE SET uses = uses + excluded.uses, reactions = reactions + excluded.reactions').bind(x.id, x.day, x.uses, x.reactions)),
      env.DB.prepare('UPDATE emoji_scan SET last_id = ?, at = ? WHERE channel_id = ?').bind(newest, now, c.id),
    ]);
  }
  await env.DB.prepare('DELETE FROM emoji_usage WHERE day < ?').bind(dayKey(now - 120 * DAY)).run();
  return { scanned, counted };
}
