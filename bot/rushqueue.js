// MB6 – Rush queue manager (PLANNING/RUSH-QUEUE.md). Phoenix Rush groups search EA one at a time, in click order, so two Phoenix
// lobbies never match each other. One board message per queue channel is always the newest message there.
//   pure logic   join / leave / search / matched / failed / pause / sweep over plain row objects (no I/O, tested directly)
//   persistence  rush_queue, rush_crews, rush_queue_stats (D1)
//   channels     Organization config purposes `rush_queue` (the board) and `rush_queue_reports` (anonymous staff reports); none set → say so
//   Discord      buttons, a member select and modals on the Phoenix Rush app; a 1-minute cron keeps the board last and runs the idle timers
// Flag `rushQueue` (default owner). Nothing here names a channel or role; pings go to the group's own members only.
import { can, flagOn } from './roles.js';
import { message, notice, reply, header, text, footer, sep, button, buttons, autoBanner } from './ui.js';
import { orgName, channelsFor } from './orgconfig.js';
import { discord } from './servertools.js';
import { appEnv, appConfigured } from './apps.js';
import { kvOf } from './kv.js';

export const MAX_CREW = 5; // including the captain
export const DEFAULTS = { failedPolicy: 'next', greenWarnMin: 1, greenRemoveMin: 2, searchAskMin: 15, waitDropMin: 90, pauseMin: 10 };
export const RQ_ID = /^pf:rq:[a-z]+(:[a-z]+)?$/;
export const REPORT_LIMIT = 3, REPORT_TTL = 3600;
const MIN = 60e3;
const NEED = { 1: 'needs 1 player', 2: 'needs 2 players', 9: 'needs a keeper' };

// ---------- settings (the owner's two-minute rule and the failed policy are settings, not constants) ----------
const clampN = (v, lo, hi, d) => (Number.isFinite(+v) && v !== '' && v != null ? Math.min(hi, Math.max(lo, Math.round(+v))) : d);
export function settingsOf(raw = {}) {
  const warn = clampN(raw.greenWarnMin, 1, 30, DEFAULTS.greenWarnMin);
  return {
    failedPolicy: raw.failedPolicy === 'bottom' ? 'bottom' : 'next', greenWarnMin: warn,
    greenRemoveMin: Math.max(warn + 1, clampN(raw.greenRemoveMin, 2, 60, DEFAULTS.greenRemoveMin)),
    searchAskMin: clampN(raw.searchAskMin, 5, 120, DEFAULTS.searchAskMin), waitDropMin: clampN(raw.waitDropMin, 10, 600, DEFAULTS.waitDropMin), pauseMin: clampN(raw.pauseMin, 1, 60, DEFAULTS.pauseMin),
  };
}

// ---------- pure logic ----------
const ids = (v) => [...new Set((Array.isArray(v) ? v : []).map((x) => String(x).replace(/\D/g, '')).filter(Boolean))];
// The captain is always in; others are unique and the group is at most MAX_CREW. Returns the OTHER members.
export const crewOf = (captain, others) => ids(others).filter((x) => x !== String(captain)).slice(0, MAX_CREW - 1);
const everyone = (e) => [e.captain, ...e.members];
const byOrd = (q) => [...q].sort((a, b) => a.ord - b.ord);
const renumber = (q) => byOrd(q).map((e, k) => ({ ...e, ord: k }));
const active = (q) => q.find((e) => e.status === 'green' || e.status === 'searching');
const paused = (e, now) => (e.paused_until ?? 0) > now;
export const positionOf = (q, captain) => byOrd(q).filter((e) => e.status === 'waiting').findIndex((e) => e.captain === String(captain)) + 1;

// Members of `members` already in another group: [{ user, captain }]
export function holders(q, members, exceptCaptain) {
  const out = [];
  for (const e of q) if (e.captain !== String(exceptCaptain)) for (const m of everyone(e)) if (members.includes(m)) out.push({ user: m, captain: e.captain });
  return out;
}

// If nobody holds the green light or is searching, the first group that is not paused gets it. lit = groups that just got it.
export function advance(q, now) {
  if (active(q)) return { queue: q, lit: [] };
  const next = byOrd(q).find((e) => e.status === 'waiting' && !paused(e, now));
  if (!next) return { queue: q, lit: [] };
  const queue = q.map((e) => (e === next ? { ...e, status: 'green', green_at: now, warned: 0, paused_until: null } : e));
  return { queue, lit: [queue.find((e) => e.captain === next.captain)] };
}
const without = (q, captain) => renumber(q.filter((e) => e.captain !== String(captain)));
const find = (q, captain) => q.find((e) => e.captain === String(captain));
const fin = (res) => { const a = advance(res.queue, res.now); return { ...res, queue: renumber(a.queue), lit: a.lit }; };

export function join(q, { captain, members = [], needs = 0 }, now) {
  captain = String(captain);
  if (find(q, captain)) return { queue: q, error: 'already', position: positionOf(q, captain) || 0, lit: [] };
  const crew = crewOf(captain, members);
  const clash = holders(q, [captain, ...crew], captain);
  if (clash.length) return { queue: q, error: 'conflict', clash, lit: [] };
  const entry = { id: null, captain, members: crew, status: 'waiting', ord: q.length, joined_at: now, green_at: null, warned: 0, searching_since: null, attempts: 0, paused_until: null, needs: needs || 0 };
  return fin({ queue: [...q, entry], now, entry });
}
export function leave(q, captain, now) {
  const entry = find(q, captain);
  return entry ? fin({ queue: without(q, captain), now, removed: entry }) : { queue: q, error: 'absent', lit: [] };
}
export function search(q, captain, now) {
  const e = find(q, captain);
  if (!e) return { queue: q, error: 'absent', lit: [] };
  if (e.status !== 'green') return { queue: q, error: 'not-green', lit: [] };
  return { queue: q.map((x) => (x === e ? { ...x, status: 'searching', searching_since: now, warned: 0 } : x)), lit: [], entry: e };
}
export function matched(q, captain, now) {
  const e = find(q, captain);
  if (!e) return { queue: q, error: 'absent', lit: [] };
  if (e.status !== 'searching') return { queue: q, error: 'not-searching', lit: [] };
  return fin({ queue: without(q, captain), now, removed: e, waitSec: Math.max(0, Math.round((now - (e.searching_since ?? now)) / 1000)) });
}
// EA said "match found" but the game did not load. `next`: straight back to the green light (nobody else can be searching, the
// queue searches one group at a time). `bottom`: to the end of the line, the next group gets the light.
export function failed(q, captain, policy, now) {
  const e = find(q, captain);
  if (!e) return { queue: q, error: 'absent', lit: [] };
  if (e.status !== 'searching') return { queue: q, error: 'not-searching', lit: [] };
  const back = policy === 'bottom'
    ? { ...e, status: 'waiting', ord: q.length, searching_since: null, green_at: null, attempts: e.attempts + 1 }
    : { ...e, status: 'green', ord: -1, searching_since: null, green_at: now, warned: 0, attempts: e.attempts + 1 };
  return fin({ queue: q.map((x) => (x === e ? back : x)), now, entry: back });
}
export function pause(q, captain, minutes, now) {
  const e = find(q, captain);
  if (!e) return { queue: q, error: 'absent', lit: [] };
  if (e.status !== 'waiting') return { queue: q, error: 'not-waiting', lit: [] };
  return { queue: q.map((x) => (x === e ? { ...x, paused_until: now + minutes * MIN } : x)), lit: [] };
}
export function setNeeds(q, captain, needs) {
  const e = find(q, captain);
  return e ? { queue: q.map((x) => (x === e ? { ...x, needs: [0, 1, 2, 9].includes(needs) ? needs : 0 } : x)), lit: [] } : { queue: q, error: 'absent', lit: [] };
}
// Change who is in a waiting/green group (the saved crew edit, or tonight's swap). Conflicts are reported, not applied.
export function setMembers(q, captain, members) {
  const e = find(q, captain);
  if (!e) return { queue: q, error: 'absent', lit: [] };
  const crew = crewOf(captain, members);
  const clash = holders(q, [captain, ...crew], captain);
  return clash.length ? { queue: q, error: 'conflict', clash, lit: [] } : { queue: q.map((x) => (x === e ? { ...x, members: crew } : x)), lit: [] };
}
// Take members out of the groups that hold them (the "move them here" answer to a conflict).
export function release(q, users, except) {
  return q.map((e) => (e.captain === String(except) ? e : { ...e, members: e.members.filter((m) => !users.includes(m)) }));
}

// The idle timers. warn = green-light groups past the warning, removed = idle green or stale waiting groups, ask = long searches.
export function sweep(q, st, now) {
  const warn = [], ask = [], removed = [];
  let queue = q.map((e) => {
    if (e.status === 'green' && !e.warned && now - e.green_at >= st.greenWarnMin * MIN) { warn.push(e); return { ...e, warned: 1 }; }
    if (e.status === 'searching' && !e.warned && now - e.searching_since >= st.searchAskMin * MIN) { ask.push(e); return { ...e, warned: 1 }; }
    return e;
  });
  for (const e of queue) {
    const idle = e.status === 'green' && now - e.green_at >= st.greenRemoveMin * MIN;
    const stale = e.status === 'waiting' && now - e.joined_at >= st.waitDropMin * MIN;
    if (idle || stale) removed.push({ ...e, why: idle ? 'idle' : 'stale' });
  }
  if (removed.length) queue = renumber(queue.filter((e) => !removed.some((r) => r.captain === e.captain)));
  const a = advance(queue, now);
  return { queue: renumber(a.queue), warn, ask, removed, lit: a.lit };
}

export const weekOf = (now) => { const d = new Date(now); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
export const etaSeconds = (q, captain, avgSec = 300) => {
  const e = find(q, captain);
  if (!e || e.status === 'searching') return 0;
  return (byOrd(q).filter((x) => x.status !== 'waiting' || x.ord < e.ord).length) * avgSec;
};

// ---------- the board ----------
const mention = (id) => `<@${id}>`;
const crewText = (e) => [mention(e.captain), ...e.members.map(mention)].join(', ') + (e.needs ? ` · ${NEED[e.needs]}` : '');
const clock = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
export function boardMessage(q, { now = Date.now(), org = 'Phoenix Fire', st = settingsOf(), avgSec = 300 } = {}) {
  const sorted = byOrd(q), front = sorted.find((e) => e.status === 'green' || e.status === 'searching');
  const searching = sorted.filter((e) => e.status === 'searching'), waiting = sorted.filter((e) => e.status === 'waiting');
  const lines = [];
  if (front?.status === 'searching') lines.push(`**SEARCHING NOW**  ${crewText(front)}  · since ${clock(now - front.searching_since)}`);
  else if (front) lines.push(`**GREEN LIGHT**  ${crewText(front)}  · press **Searching now** within ${st.greenRemoveMin} min`);
  else lines.push('**Nobody is searching.** Press **Join queue** to go first.');
  if (searching.length > 1) lines.push('⚠️ **More than one group is searching: they can match each other.** Staff: `/queue clear`.');
  if (waiting.length) lines.push('', '**NEXT**', ...waiting.slice(0, 8).map((e, k) => `${k + 1}. ${crewText(e)}${(e.paused_until ?? 0) > now ? ' · ⏸ paused' : ''} · ~${Math.max(1, Math.round(((front ? 1 : 0) + k) * avgSec / 60))} min`));
  if (waiting.length > 8) lines.push(`…and ${waiting.length - 8} more`);
  return message({
    accent: 'red', mentions: { parse: [] },
    blocks: [
      header({ eyebrow: `${org} · Rush`, title: '🔥 Rush queue', sub: 'One group searches at a time, in click order' }),
      sep(), text(lines.join('\n')), sep(),
      footer(`${sorted.length} group${sorted.length === 1 ? '' : 's'} in line · captain presses the buttons, the rest of the crew just waits for the ping`),
      buttons([
        { label: 'Join queue', emoji: '➕', id: 'pf:rq:join', style: 'ok' }, { label: 'Leave', emoji: '🚪', id: 'pf:rq:leave' }, { label: 'Edit my crew', emoji: '👥', id: 'pf:rq:crew' },
        { label: 'Searching now', emoji: '🔎', id: 'pf:rq:search', style: 'brand' }, { label: 'Match found', emoji: '✅', id: 'pf:rq:found', style: 'ok' },
        { label: 'Match failed', emoji: '⚠️', id: 'pf:rq:failed' }, { label: 'Need a player', emoji: '🙋', id: 'pf:rq:need' }, { label: 'Pause', emoji: '⏸', id: 'pf:rq:pause' }, { label: 'Report', emoji: '📢', id: 'pf:rq:report', style: 'no' },
      ]),
    ],
  });
}

// ---------- persistence ----------
const rows = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).all().then((r) => r.results);
const one = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).first();
const toEntry = (r) => ({ id: r.id, captain: r.captain_id, members: JSON.parse(r.members || '[]'), status: r.status, ord: r.ord, joined_at: r.joined_at, green_at: r.green_at, warned: r.warned, searching_since: r.searching_since, attempts: r.attempts, paused_until: r.paused_until, needs: r.needs });
export const loadQueue = async (env) => (await rows(env, 'SELECT * FROM rush_queue ORDER BY ord')).map(toEntry);
export async function saveQueue(env, before, after) {
  const keep = new Set(after.map((e) => e.captain));
  const stmts = before.filter((e) => !keep.has(e.captain)).map((e) => env.DB.prepare('DELETE FROM rush_queue WHERE captain_id = ?').bind(e.captain));
  for (const e of after) {
    stmts.push(env.DB.prepare(`INSERT INTO rush_queue (captain_id, members, status, ord, joined_at, green_at, warned, searching_since, attempts, paused_until, needs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (captain_id) DO UPDATE SET members = excluded.members, status = excluded.status, ord = excluded.ord, green_at = excluded.green_at, warned = excluded.warned, searching_since = excluded.searching_since, attempts = excluded.attempts, paused_until = excluded.paused_until, needs = excluded.needs`)
      .bind(e.captain, JSON.stringify(e.members), e.status, e.ord, e.joined_at, e.green_at ?? null, e.warned ?? 0, e.searching_since ?? null, e.attempts ?? 0, e.paused_until ?? null, e.needs ?? 0));
  }
  if (stmts.length) await env.DB.batch(stmts);
}
export const savedCrew = async (env, captain) => { const r = await one(env, 'SELECT members FROM rush_crews WHERE captain_id = ?', String(captain)); return r ? JSON.parse(r.members || '[]') : null; };
export const saveCrew = (env, captain, members, now) => env.DB.prepare('INSERT INTO rush_crews (captain_id, members, updated_at) VALUES (?, ?, ?) ON CONFLICT (captain_id) DO UPDATE SET members = excluded.members, updated_at = excluded.updated_at')
  .bind(String(captain), JSON.stringify(crewOf(captain, members)), now).run();
async function bump(env, captain, field, now, waitSec = 0) {
  await env.DB.prepare(`INSERT INTO rush_queue_stats (week, captain_id, ${field}, wait_seconds) VALUES (?, ?, 1, ?) ON CONFLICT (week, captain_id) DO UPDATE SET ${field} = ${field} + 1, wait_seconds = wait_seconds + excluded.wait_seconds`)
    .bind(weekOf(now), String(captain), waitSec).run();
}
export async function avgSearchSeconds(env) {
  const r = await one(env, 'SELECT SUM(wait_seconds) AS w, SUM(matched) AS m FROM rush_queue_stats WHERE week >= ?', weekOf(Date.now() - 28 * 864e5)).catch(() => null);
  return r?.m ? Math.max(60, Math.round(r.w / r.m)) : 300;
}
export async function getSettings(env) {
  const r = await one(env, "SELECT value FROM meta WHERE key = 'rush_queue_settings'").catch(() => null);
  try { return settingsOf(JSON.parse(r?.value || '{}')); } catch { return settingsOf(); }
}
export const saveSettings = (env, st) => env.DB.prepare("INSERT INTO meta (key, value) VALUES ('rush_queue_settings', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").bind(JSON.stringify(st)).run();

// ---------- Discord side ----------
const say = (title, body = '', accent) => reply(notice(title, body, accent ? { accent } : {}));
const NO_CHANNEL = 'No queue channel is set. A manager runs `/setup channel purpose:rush_queue` in the channel that should hold the board (or sets it under Boardroom → Organization).';
const rushEnv = (env) => (appConfigured(env, 'rush') && env.BOT_APP !== 'rush' ? appEnv(env, 'rush') : env); // buttons only work on messages the Rush app posted
const BOARD_KEY = 'rq:board:';

// Delete the old board in each queue channel and post a fresh one at the bottom. `pings` = messages posted first (green light, warnings).
export async function refreshBoards(env, { now = Date.now(), pings = [] } = {}) {
  const channels = await channelsFor(env, 'rush_queue');
  if (!channels.length) return { channels: 0 };
  const e = rushEnv(env), kv = kvOf(env);
  const q = await loadQueue(env), st = await getSettings(env), avgSec = await avgSearchSeconds(env);
  const msg = autoBanner(env, boardMessage(q, { now, org: orgName(env), st, avgSec }), 'queue');
  for (const ch of channels) {
    const old = await kv?.get(BOARD_KEY + ch, 'json').catch(() => null);
    if (old?.id) await discord(e, 'DELETE', `/channels/${ch}/messages/${old.id}`).catch(() => null);
    for (const p of pings) await discord(e, 'POST', `/channels/${ch}/messages`, p).catch((err) => console.log('rush queue ping failed', err.message));
    const sent = await discord(e, 'POST', `/channels/${ch}/messages`, msg).catch((err) => { console.log('rush queue board failed', err.message); return null; });
    if (sent?.id) await kv?.put(BOARD_KEY + ch, JSON.stringify({ id: sent.id, at: now }));
  }
  return { channels: channels.length };
}
const ping = (users, line) => ({ content: `${users.map(mention).join(' ')} ${line}`, allowed_mentions: { parse: [], users: users.map(String) } });
const greenPing = (e, st) => ping(everyone(e), `**You're up.** Start searching in EA, then press **Searching now** (you have ${st.greenRemoveMin} min before the next group goes).`);

// Cron, every minute: idle timers, then make sure the board is the newest message (one REST read per channel, skipped when the queue is empty).
export async function queueTick(env, now = Date.now()) {
  if (!env.DB || !flagOn(env, { role: 'owner' }, 'rushQueue')) return { skipped: true };
  const before = await loadQueue(env);
  if (!before.length) return { skipped: true };
  const st = await getSettings(env);
  const sw = sweep(before, st, now);
  if (sw.queue !== before) await saveQueue(env, before, sw.queue);
  const pings = [
    ...sw.warn.map((e) => ping(everyone(e), `**One minute left**: press **Searching now** or the next group goes.`)),
    ...sw.removed.map((e) => ping([e.captain], e.why === 'idle' ? 'You were removed from the Rush queue (no answer at the green light). Press **Join queue** to come back.' : 'You were dropped from the Rush queue after a long wait. Press **Join queue** to come back.')),
    ...sw.lit.map((e) => greenPing(e, st)),
    ...sw.ask.map((e) => ping([e.captain], `Still searching? Press **Match found**, **Match failed** or **Leave**.`)),
  ];
  const changed = pings.length > 0;
  const channels = await channelsFor(env, 'rush_queue');
  if (!channels.length) return { skipped: true, noChannel: true };
  let stale = changed;
  if (!stale) {
    const kv = kvOf(env);
    for (const ch of channels) {
      const have = await kv?.get(BOARD_KEY + ch, 'json').catch(() => null);
      const last = await discord(rushEnv(env), 'GET', `/channels/${ch}`).catch(() => null);
      if (!have?.id || (last?.last_message_id && last.last_message_id !== have.id)) { stale = true; break; }
    }
  }
  if (stale) await refreshBoards(env, { now, pings });
  return { reposted: stale, warned: sw.warn.length, removed: sw.removed.length };
}

// ---------- interactions ----------
const flat = (cs = []) => cs.flatMap((c) => (c.components ? flat(c.components) : [c]));
const select = (id, placeholder, { min = 0, max = 4, defaults = [] } = {}) => ({ type: 1, components: [{ type: 5, custom_id: id, placeholder, min_values: min, max_values: max, default_values: defaults.map((x) => ({ id: String(x), type: 'user' })) }] });
const crewPrompt = (mode, title, defaults = []) => reply(message({ ephemeral: true, accent: 'steel', blocks: [
  header({ eyebrow: 'Rush queue', title, sub: 'Pick up to 4 members; you are added automatically' }),
  select(`pf:rq:crew:${mode}`, 'Who is in your lobby?', { defaults }),
  buttons([{ label: 'Just me (solo)', id: `pf:rq:solo:${mode}` }]),
].flat().filter(Boolean) }));
const conflictNote = (clash) => `${[...new Set(clash.map((c) => `<@${c.user}> is already in <@${c.captain}>'s group`))].join('; ')}.`;

async function after(env, ctx, work) { const p = work().catch((e) => console.log('rush queue board failed', e.message)); if (ctx?.waitUntil) ctx.waitUntil(p); else await p; }

// Apply a queue change, persist it, and put the green light + a fresh board at the bottom.
async function commit(env, ctx, before, res, now, extra = []) {
  await saveQueue(env, before, res.queue);
  const st = await getSettings(env);
  const pings = [...extra, ...(res.lit ?? []).map((e) => greenPing(e, st))];
  await after(env, ctx, () => refreshBoards(env, { now, pings }));
}
const reasons = { already: 'You are already in the queue.', absent: 'Your group is not in the queue.', 'not-green': 'Wait for the green light first.', 'not-searching': 'Your group is not searching.', 'not-waiting': 'Only a waiting group can pause.' };

export async function queueInteraction(i, env, me, who, ctx, now = Date.now()) {
  if (!env.DB) return say('The member database is not connected');
  if (!flagOn(env, who, 'rushQueue')) return say('The Rush queue is not switched on for you yet', 'Ask a manager.');
  if (!can(who, 'events.rsvp')) return say('Members only', 'Join the Phoenix Fire server and link your account first.');
  if (!(await channelsFor(env, 'rush_queue')).length) return say('No queue channel is set', NO_CHANNEL);
  const id = String(i.data?.custom_id ?? ''), [, , action, mode] = id.split(':');
  const uid = String(me.u), picked = (i.data?.values ?? []).map(String);
  const q = await loadQueue(env), st = await getSettings(env);

  if (i.type === 5) return report(i, env, me, now); // modal submit
  if (action === 'report') return { type: 9, data: { custom_id: 'pf:rq:report', title: 'Report a lobby (anonymous)', components: [
    { type: 1, components: [{ type: 4, custom_id: 'group', style: 1, label: 'Which group or lobby?', required: true, max_length: 100, placeholder: q.length ? q.slice(0, 3).map((e) => `captain ${e.captain}`).join(' / ') : 'Name or what you saw' }] },
    { type: 1, components: [{ type: 4, custom_id: 'note', style: 2, label: 'Anything staff should know (optional)', required: false, max_length: 300 }] },
  ] } };

  if (action === 'join') {
    const crew = await savedCrew(env, uid);
    if (crew === null) return crewPrompt('first', 'Who is in your lobby?'); // first time: register the crew
    const res = join(q, { captain: uid, members: crew }, now);
    return joined(env, ctx, q, res, now, uid);
  }
  if (action === 'crew' && !mode) return crewPrompt('edit', 'Edit my crew', (await savedCrew(env, uid)) ?? []);
  if (action === 'solo' || (action === 'crew' && mode)) { // the select (values) or "just me" button, for first / edit / tonight / move
    const members = action === 'solo' ? [] : picked;
    if (mode === 'tonight') {
      const res = setMembers(q, uid, members);
      if (res.error === 'conflict') return conflictPrompt(env, res.clash, members, 'tonight', uid, now);
      if (res.error) return say(reasons[res.error] ?? 'Not possible');
      await commit(env, ctx, q, res, now);
      return say('✅ Crew swapped for tonight', 'Your saved crew is unchanged.', 'win');
    }
    await saveCrew(env, uid, members, now);
    if (mode === 'edit') {
      const cur = find(q, uid);
      if (cur) { const res = setMembers(q, uid, members); if (!res.error) { await commit(env, ctx, q, res, now); return say('✅ Crew saved', 'Your group in the queue has the new crew.', 'win'); } return conflictPrompt(env, res.clash, members, 'edit', uid, now); }
      return say('✅ Crew saved', 'Press **Join queue** whenever you are ready.', 'win');
    }
    return joined(env, ctx, q, join(q, { captain: uid, members }, now), now, uid, members);
  }
  if (action === 'move') { // "move them here" after a conflict: take the members out of the other groups
    const kv = kvOf(env), pend = await kv?.get(`rq:pend:${uid}`, 'json').catch(() => null);
    if (!pend) return say('That offer has expired', 'Press **Join queue** again.');
    await kv.delete(`rq:pend:${uid}`).catch(() => null);
    let moved = release(q, pend.members, uid);
    const res = find(moved, uid) ? setMembers(moved, uid, pend.members) : join(moved, { captain: uid, members: pend.members }, now);
    if (res.error && res.error !== 'conflict') return say(reasons[res.error] ?? 'Not possible');
    await commit(env, ctx, q, { ...res, queue: res.queue }, now);
    if (pend.mode !== 'tonight') await saveCrew(env, uid, pend.members, now);
    return say('✅ Done', 'They were moved into your group.', 'win');
  }
  if (action === 'leave') { const res = leave(q, uid, now); if (res.error) return say(reasons[res.error]); await commit(env, ctx, q, res, now); return say('You left the queue', 'The next group has been given the green light.', 'win'); }
  if (action === 'search') { const res = search(q, uid, now); if (res.error) return say(reasons[res.error]); await bump(env, uid, 'searches', now); await commit(env, ctx, q, res, now); return say('🔎 Searching', 'Good luck. Press **Match found** when EA finds one, or **Match failed** if it does not load.', 'win'); }
  if (action === 'found') {
    const res = matched(q, uid, now); if (res.error) return say(reasons[res.error]);
    await bump(env, uid, 'matched', now, res.waitSec);
    await commit(env, ctx, q, res, now, [{ content: '🔥 **Phoenix found a match**', allowed_mentions: { parse: [] } }]);
    return say('✅ Match found', 'You are out of the queue and the next group has the green light. Log the game with `/rush log` when it is over.', 'win');
  }
  if (action === 'failed') {
    const res = failed(q, uid, st.failedPolicy, now); if (res.error) return say(reasons[res.error]);
    await bump(env, uid, 'failed', now);
    await commit(env, ctx, q, res, now);
    return say('Match failed', st.failedPolicy === 'bottom' ? 'You went to the back of the line; the next group has the green light.' : 'You keep your turn: you are back at the green light.', 'steel');
  }
  if (action === 'pause') { const res = pause(q, uid, st.pauseMin, now); if (res.error) return say(reasons[res.error]); await commit(env, ctx, q, res, now); return say(`⏸ Paused for ${st.pauseMin} min`, 'You keep your place; the next group can go first.', 'steel'); }
  if (action === 'need') {
    if (!find(q, uid)) return say(reasons.absent, 'Join the queue first.');
    if (mode === 'pick') {
      const n = Number(picked[0]) || 0, res = setNeeds(q, uid, n);
      await commit(env, ctx, q, res, now);
      const lfg = n ? await postNeed(i, env, me, who, n, now) : '';
      return say(n ? `🙋 ${NEED[n]}` : 'Cleared', lfg || 'It shows on the board.', 'win');
    }
    return reply(message({ ephemeral: true, accent: 'steel', blocks: [header({ eyebrow: 'Rush queue', title: 'Need a player?', sub: 'Shows on the board and calls the Rush role' }),
      { type: 1, components: [{ type: 3, custom_id: 'pf:rq:need:pick', placeholder: 'How many?', options: [{ label: 'Need 1 player', value: '1' }, { label: 'Need 2 players', value: '2' }, { label: 'Need a keeper', value: '9' }, { label: 'Nobody (clear)', value: '0' }] }] }] }));
  }
  return say('Unknown queue button');
}

async function joined(env, ctx, q, res, now, uid, members) {
  if (res.error === 'conflict') return conflictPrompt(env, res.clash, members ?? await savedCrew(env, uid) ?? [], 'join', uid, now);
  if (res.error === 'already') return say('You are already in the queue', res.position ? `Position ${res.position}.` : 'You hold the green light or are searching.');
  await commit(env, ctx, q, res, now);
  const pos = positionOf(res.queue, uid);
  return say('✅ You are in the queue', pos ? `Position **${pos}**. You get a ping when it is your turn.` : '**You are up.** Start searching in EA, then press **Searching now**.', 'win');
}
async function conflictPrompt(env, clash, members, mode, uid, now) {
  await kvOf(env)?.put(`rq:pend:${uid}`, JSON.stringify({ members, mode }), { expirationTtl: 300 });
  return reply(message({ ephemeral: true, accent: 'steel', blocks: [header({ eyebrow: 'Rush queue', title: 'Someone is already in another group' }), text(conflictNote(clash)), buttons([{ label: 'Move them to my group', id: 'pf:rq:move', style: 'brand' }])] }));
}
// "Need a player" also posts the Rush LFG marker when that feature is on for this member; the board line is always set.
async function postNeed(i, env, me, who, n, now) {
  try {
    if (!flagOn(env, who, 'rushLfg')) return 'It shows on the board.';
    const { lfgCommand } = await import('./lfg.js');
    const out = await lfgCommand(i, env, me, who, 'now', { note: `Rush queue: ${NEED[n]}`, minutes: 60 }, now);
    const ch = (await channelsFor(env, 'rush_queue'))[0];
    if (out?.data?.components?.length && ch) { await discord(rushEnv(env), 'POST', `/channels/${ch}/messages`, { ...out.data, flags: out.data.flags & ~64 }); return 'Posted to the Rush role as well.'; }
  } catch (e) { console.log('need-a-player post failed', e.message); }
  return 'It shows on the board.';
}

// Anonymous report: no reporter id is stored or posted. The rate limit keys on a salted hash that expires after an hour.
async function sha(s) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24); }
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>@`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
export async function report(i, env, me, now) {
  const fields = Object.fromEntries(flat(i.data?.components).filter((c) => c.custom_id).map((c) => [c.custom_id, c.value]));
  const group = clean(fields.group, 100), note = clean(fields.note, 300);
  if (!group) return say('Tell us which group', 'Name the group or what you saw.');
  const targets = await channelsFor(env, 'rush_queue_reports');
  if (!targets.length) return say('No staff channel is set for reports', 'A manager runs `/setup channel purpose:rush_queue_reports` in the staff channel (or sets it under Boardroom → Organization).');
  const kv = kvOf(env), key = `rq:rl:${await sha(`${env.RUSH_REPORT_SALT || env.DISCORD_PUBLIC_KEY || 'phoenix'}:${me.u}`)}`;
  const used = Number(await kv?.get(key).catch(() => 0)) || 0;
  if (used >= REPORT_LIMIT) return say('Too many reports', `You can send ${REPORT_LIMIT} an hour. Staff have seen yours.`);
  await kv?.put(key, String(used + 1), { expirationTtl: REPORT_TTL });
  const msg = autoBanner(env, message({ accent: 'gold', mentions: { parse: [] }, blocks: [header({ eyebrow: `${orgName(env)} · Rush queue`, title: '📢 Anonymous report', sub: `<t:${Math.floor(now / 1000)}:f>` }), text(`**Group:** ${group}${note ? `\n**Note:** ${note}` : ''}`), footer('Sent anonymously. Staff can message the group.')] }), 'queue');
  for (const ch of targets) await discord(rushEnv(env), 'POST', `/channels/${ch}/messages`, msg).catch((e) => console.log('rush report post failed', e.message));
  return say('✅ Report sent', 'Staff got it. Your name is not attached.', 'win');
}

// /queue board | status | clear | remove | settings
export async function queueCommand(i, env, ctx, me, who, sub, o = {}, now = Date.now()) {
  if (!env.DB) return say('The member database is not connected');
  if (!flagOn(env, who, 'rushQueue')) return say('The Rush queue is not switched on for you yet', 'Ask a manager.');
  const staff = can(who, 'servertools.setup');
  const q = await loadQueue(env), st = await getSettings(env);
  if (sub === 'status') {
    if (!q.length) return say('Nobody is in the queue', 'Press **Join queue** on the board to go first.');
    return say(`🔥 ${q.length} group${q.length === 1 ? '' : 's'} in line`, byOrd(q).map((e) => `${e.status === 'waiting' ? `${positionOf(q, e.captain)}.` : e.status === 'searching' ? '🔎' : '🟢'} ${crewText(e)}`).join('\n'));
  }
  if (!staff) return say('Only managers can use that', '`/queue status` shows the line for everyone.');
  if (sub === 'board') {
    const r = await refreshBoards(env, { now });
    return r.channels ? say('✅ Board posted', `${r.channels} channel${r.channels === 1 ? '' : 's'}.`, 'win') : say('No queue channel is set', NO_CHANNEL);
  }
  if (sub === 'clear') { await saveQueue(env, q, []); await after(env, ctx, () => refreshBoards(env, { now })); return say('🧹 Queue cleared', 'Everyone presses **Join queue** again.', 'win'); }
  if (sub === 'remove') {
    const target = String(o.member ?? ''), e = q.find((x) => everyone(x).includes(target));
    if (!e) return say('That member is not in the queue');
    const res = e.captain === target ? leave(q, target, now) : setMembers(q, e.captain, e.members.filter((m) => m !== target));
    await commit(env, ctx, q, res, now);
    return say('✅ Removed', `<@${target}> is out of the queue.`, 'win');
  }
  if (sub === 'settings') {
    const next = settingsOf({ ...st, ...(o.failed_policy ? { failedPolicy: o.failed_policy } : {}), ...(o.warn_minutes != null ? { greenWarnMin: o.warn_minutes } : {}), ...(o.remove_minutes != null ? { greenRemoveMin: o.remove_minutes } : {}) });
    if (o.failed_policy || o.warn_minutes != null || o.remove_minutes != null) await saveSettings(env, next);
    return say('Queue settings', `Failed match: **${next.failedPolicy === 'next' ? 'goes next' : 'goes to the bottom'}**\nGreen light warning: **${next.greenWarnMin} min**, removed after **${next.greenRemoveMin} min**`);
  }
  return say('Unknown queue command');
}
