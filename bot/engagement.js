// PF-024 Item 24b – engagement points: reward members for being active in the community, not only for League stats (the club is mainly Rush and
// Rush cannot be tracked). The Worker reads each PUBLIC text channel over Discord REST, a few channels per 10-minute run, and keeps COUNTS only:
// per member per UTC day the channels they were active in, the hours they were active, how many messages (a number) and how many bot commands.
//
// GUARDRAILS (each has a test in tests/engagement-points.test.mjs):
//   1. RAW MESSAGE TEXT IS NEVER READ INTO A VARIABLE THAT SURVIVES THE LOOP, STORED OR LOGGED. Only author id, channel id and timestamp are used.
//      No Message Content intent is needed for that.
//   2. Only the channels the server-intelligence rules call public (bot/serverintel.js eligibleChannels): staff, private, NSFW and `intel_skip` are skipped.
//      No channel or role is named in code; the list comes from Discord and the Organization config.
//   3. Messages themselves pay nothing, so spamming does not farm points. A day pays for BEING ACTIVE: the day, the channels (up to a limit), the
//      hours (up to a limit) and using a command. A week with 5+ active days pays a streak bonus. Availability set on the site pays once a week.
//   4. Every amount is a rule in the Control Center (area `points`, 0 = off). The match points of one member are capped per week (rule match.weekly_cap)
//      so a full day of League cannot outscore a full week of community life.
//   5. Flag `engagementPoints` (ships `owner`): tracking runs for the owner; points are only paid while it AND `pointsEconomy` are on for members.
// D1: `engagement_days` (migration 0079). meta: `eng_state` (channel list, per-channel read position).
import { flagOn } from './roles.js';
import { awardPoints, loadRules, weekKey } from './points.js';
import { eligibleChannels, purposeMap, snowflake } from './serverintel.js';

const API = 'https://discord.com/api/v10';
export const FLAG = 'engagementPoints';
export const CHANNELS_PER_RUN = 8, CHANNEL_LIST_TTL = 3600e3, KEEP_DAYS = 45, STREAK_DAYS = 5, STATE = 'eng_state';
const DAY = 86400e3, WEEK = 7 * DAY;
const MON0 = Date.UTC(1970, 0, 5);

const metaGet = async (env, key) => { try { return JSON.parse(await env.DB.prepare('SELECT value FROM meta WHERE key = ?').bind(key).first('value')); } catch { return null; } };
const metaSet = (env, key, v) => env.DB.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').bind(key, JSON.stringify(v)).run();
export const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const popcount = (n) => { let c = 0; for (let x = n >>> 0; x; x &= x - 1) c++; return c; };
export const hoursOf = (mask) => popcount(mask);

/** tracking runs while the flag is on for the owner; points are paid only while it and pointsEconomy are on for members */
export const tracking = (env) => !!env.DB && flagOn(env, { role: 'owner' }, FLAG);
export const paying = (env) => tracking(env) && flagOn(env, { role: 'member' }, FLAG) && flagOn(env, { role: 'member' }, 'pointsEconomy');

/** the points one member earns for ONE day from the rules. row = { chs: 'id,id', hours: mask, msgs, cmds } → { delta, parts } */
export function dayPoints(rules, row) {
  const a = rules.amounts, parts = [];
  const add = (n, text) => { if (n > 0) parts.push([n, text]); };
  const chs = String(row.chs || '').split(',').filter(Boolean).length, hrs = hoursOf(row.hours || 0);
  if (row.msgs > 0) {
    add(a['engagement.active_day'], 'active');
    const extra = Math.min(Math.max(0, chs - 1), a['engagement.channel_max']);
    add(a['engagement.channel'] * extra, `${chs} channel${chs === 1 ? '' : 's'}`);
    const hh = Math.min(hrs, a['engagement.hour_max']);
    add(a['engagement.hour'] * hh, `${hrs} hour${hrs === 1 ? '' : 's'}`);
  }
  if (row.cmds > 0) add(a['engagement.command_day'], 'used a command');
  return { delta: parts.reduce((s, [n]) => s + n, 0), parts: parts.map(([, t]) => t) };
}

// ---------- collecting: counts only ----------
/** fold messages ({ author, ch, at }) into a Map "user|day" → { chs:Set, hours, msgs }. Pure: no text is ever passed in. */
export function fold(msgs, into = new Map()) {
  for (const m of msgs) {
    if (!m.author || !m.ch || !m.at) continue;
    const t = Date.parse(m.at); if (!Number.isFinite(t)) continue;
    const k = `${m.author}|${dayOf(t)}`, e = into.get(k) ?? { chs: new Set(), hours: 0, msgs: 0 };
    e.chs.add(String(m.ch)); e.hours |= 1 << new Date(t).getUTCHours(); e.msgs++; into.set(k, e);
  }
  return into;
}
async function flush(env, agg) {
  const stmts = [];
  for (const [k, e] of agg) {
    const [user, day] = k.split('|');
    stmts.push(env.DB.prepare(`INSERT INTO engagement_days (user_id, day, chs, hours, msgs) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (user_id, day) DO UPDATE SET hours = hours | excluded.hours, msgs = msgs + excluded.msgs,
        chs = CASE WHEN ',' || chs || ',' LIKE '%,' || ?6 || ',%' THEN chs ELSE (CASE WHEN chs = '' THEN '' ELSE chs || ',' END) || ?6 END`)
      .bind(user, day, [...e.chs][0], e.hours, e.msgs, [...e.chs][0]));
    for (const ch of [...e.chs].slice(1)) stmts.push(env.DB.prepare(`UPDATE engagement_days SET chs = (CASE WHEN chs = '' THEN '' ELSE chs || ',' END) || ? WHERE user_id = ? AND day = ? AND ',' || chs || ',' NOT LIKE '%,' || ? || ',%'`).bind(ch, user, day, ch));
  }
  for (let i = 0; i < stmts.length; i += 80) await env.DB.batch(stmts.slice(i, i + 80));
  return stmts.length;
}

/** one 10-minute run: read a few channels forward from where the last run stopped. Returns a short status. */
export async function pollChannels(env, now = Date.now()) {
  if (!tracking(env) || !env.DISCORD_GUILD_ID || !env.DISCORD_BOT_TOKEN) return { ran: false };
  const h = { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }, g = env.DISCORD_GUILD_ID;
  const st = (await metaGet(env, STATE)) ?? { channels: [], at: 0, cur: {}, next: 0 };
  if (!st.channels.length || now - st.at > CHANNEL_LIST_TTL) {
    const [cr, rr] = await Promise.all([fetch(`${API}/guilds/${g}/channels`, { headers: h }), fetch(`${API}/guilds/${g}/roles`, { headers: h })]);
    if (!cr.ok || !rr.ok) return { ran: false, reason: 'no-access' };
    st.channels = eligibleChannels({ guildId: g, channels: await cr.json(), roles: await rr.json(), purposeOf: await purposeMap(env) }).ok;
    st.at = now;
  }
  const agg = new Map(); let read = 0;
  for (let k = 0; k < Math.min(CHANNELS_PER_RUN, st.channels.length); k++) {
    const id = st.channels[(st.next + k) % st.channels.length], after = st.cur[id] ?? snowflake(now - 600e3); // a new channel starts now: no backfill
    const r = await fetch(`${API}/channels/${id}/messages?limit=100&after=${after}`, { headers: h });
    if (!r.ok) continue; // no access / gone: skipped, nothing from the body is logged
    const batch = (await r.json().catch(() => [])) ?? [];
    let top = BigInt(after);
    const seen = [];
    for (const m of batch) { // ONLY id, author id and timestamp are used from a message: its text is never touched
      if (BigInt(m.id) > top) top = BigInt(m.id);
      if (!m.author?.bot && (m.type === 0 || m.type === 19)) seen.push({ author: m.author?.id, ch: id, at: m.timestamp });
    }
    fold(seen, agg); st.cur[id] = String(top); read++;
  }
  st.next = st.channels.length ? (st.next + CHANNELS_PER_RUN) % st.channels.length : 0;
  for (const id of Object.keys(st.cur)) if (!st.channels.includes(id)) delete st.cur[id];
  await flush(env, agg);
  await metaSet(env, STATE, st);
  return { ran: true, read, members: new Set([...agg.keys()].map((k) => k.split('|')[0])).size };
}

/** a member ran a bot command: one count for today (no command name is kept) */
export async function recordCommand(env, userId, now = Date.now()) {
  if (!tracking(env) || !userId) return;
  await env.DB.prepare('INSERT INTO engagement_days (user_id, day, cmds) VALUES (?, ?, 1) ON CONFLICT (user_id, day) DO UPDATE SET cmds = cmds + 1').bind(String(userId), dayOf(now)).run().catch(() => {});
}

// ---------- paying ----------
/** turn the finished days into points, once per member per day (the ref also guards it), then the weekly streak bonus. Today is never paid: it is not over. */
export async function settle(env, now = Date.now()) {
  if (!paying(env)) return { paid: 0 };
  const rules = await loadRules(env), today = dayOf(now);
  const rows = (await env.DB.prepare('SELECT e.user_id, e.day, e.chs, e.hours, e.msgs, e.cmds FROM engagement_days e JOIN users u ON u.id = e.user_id WHERE e.paid = 0 AND e.day < ? AND e.day >= ? LIMIT 400').bind(today, dayOf(now - 3 * DAY)).all()).results ?? [];
  let paid = 0;
  for (const r of rows) {
    const a = dayPoints(rules, r);
    if (a.delta) paid += await awardPoints(env, r.user_id, 'engagement', a.delta, `Active ${r.day}: ${a.parts.join(', ')}`, `eng:d:${r.day}`);
    await env.DB.prepare('UPDATE engagement_days SET paid = 1 WHERE user_id = ? AND day = ?').bind(r.user_id, r.day).run();
  }
  const bonus = rules.amounts['engagement.streak_week'], wk = weekKey(now) - 1;
  if (bonus > 0 && wk >= 0) {
    const from = dayOf(MON0 + wk * WEEK), to = dayOf(MON0 + (wk + 1) * WEEK - 1);
    const top = (await env.DB.prepare('SELECT e.user_id FROM engagement_days e JOIN users u ON u.id = e.user_id WHERE e.day >= ? AND e.day <= ? AND e.msgs > 0 GROUP BY e.user_id HAVING COUNT(*) >= ?').bind(from, to, STREAK_DAYS).all()).results ?? [];
    for (const r of top) paid += await awardPoints(env, r.user_id, 'engagement', bonus, `Active ${STREAK_DAYS}+ days in the week of ${from}`, `eng:w:${wk}`);
  }
  await env.DB.prepare('DELETE FROM engagement_days WHERE day < ?').bind(dayOf(now - KEEP_DAYS * DAY)).run().catch(() => {});
  return { paid };
}

/** setting availability on the site pays once a week */
export async function availabilityPoint(env, userId, now = Date.now()) {
  if (!paying(env)) return 0;
  const n = (await loadRules(env)).amounts['engagement.availability'];
  return n > 0 ? awardPoints(env, userId, 'engagement', n, 'Set availability', `eng:a:${weekKey(now)}`) : 0;
}
