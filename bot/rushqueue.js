// MB6 – Rush queue manager (PLANNING/RUSH-QUEUE.md). Phoenix Rush groups search EA one at a time, in click order, so two Phoenix
// lobbies never match each other. One board message per queue channel is always the newest message there.
//   pure logic   join / leave / search / matched / failed / pause / sweep over plain row objects (no I/O, tested directly)
//   persistence  rush_queue, rush_crews, rush_queue_stats (D1)
//   channels     Organization config purposes `rush_queue` (the board), `rush_need` ("Need a player" posts, falls back to the queue channel) and
//                `rush_queue_reports` (anonymous staff reports); none set → say so. Who a post pings comes from the Control Center row `auto:rush-need`.
//   who may stop it  managers only (`/queue stop`, `/queue start`, `/queue clear`); members can only join, leave and start it (they never turn it off)
//   Discord      buttons, a member select and modals on the Phoenix Rush app; a 1-minute cron keeps the board last and runs the idle timers
// Flag `rushQueue` (default owner). Nothing here names a channel or role; pings go to the group's own members only.
import { can, flagOn } from './roles.js';
import { audienceOf, gate, postChannels } from './controls.js';
import { message, notice, reply, header, text, facts, footer, sep, button, buttons, autoBanner, cards, bannerUrl } from './ui.js';
import { orgName, channelsFor, channelNotice } from './orgconfig.js';
import { discord, getToolSettings } from './servertools.js';
import { appEnv, appConfigured } from './apps.js';
import { kvOf } from './kv.js';

export const MAX_CREW = 5; // including the captain
export const DEFAULTS = { failedPolicy: 'next', greenWarnMin: 1, greenRemoveMin: 2, searchAskMin: 15, searchMaxMin: 60, waitDropMin: 90, pauseMin: 10, idleCloseMin: 60, joinsPerHour: 8, needMin: 60 };
export const RQ_ID = /^pf:rq:[a-z]+(:[a-z0-9]+)?$/;
export const REPORT_LIMIT = 3, REPORT_TTL = 3600;
const MIN = 60e3;
const NEED = { 1: 'needs 1 player', 2: 'needs 2 players', 9: 'needs a keeper' };
export const POSITIONS = { GK: 'Keeper', CB: 'Centre back', FB: 'Full back', CM: 'Midfield', W: 'Winger', ST: 'Striker', ANY: 'Any position' };

// ---------- settings (the owner's two-minute rule and the failed policy are settings, not constants) ----------
const clampN = (v, lo, hi, d) => (Number.isFinite(+v) && v !== '' && v != null ? Math.min(hi, Math.max(lo, Math.round(+v))) : d);
export function settingsOf(raw = {}) {
  const warn = clampN(raw.greenWarnMin, 1, 30, DEFAULTS.greenWarnMin);
  return {
    failedPolicy: raw.failedPolicy === 'bottom' ? 'bottom' : 'next', greenWarnMin: warn,
    greenRemoveMin: Math.max(warn + 1, clampN(raw.greenRemoveMin, 2, 60, DEFAULTS.greenRemoveMin)),
    searchAskMin: clampN(raw.searchAskMin, 5, 120, DEFAULTS.searchAskMin), waitDropMin: clampN(raw.waitDropMin, 10, 600, DEFAULTS.waitDropMin), pauseMin: clampN(raw.pauseMin, 1, 60, DEFAULTS.pauseMin),
    searchMaxMin: Math.max(clampN(raw.searchAskMin, 5, 120, DEFAULTS.searchAskMin) + 5, clampN(raw.searchMaxMin, 10, 240, DEFAULTS.searchMaxMin)), // a search nobody ends is removed (anti-troll)
    idleCloseMin: clampN(raw.idleCloseMin, 0, 1440, DEFAULTS.idleCloseMin), // minutes with no activity before the queue closes itself; 0 = never
    joinsPerHour: clampN(raw.joinsPerHour, 1, 60, DEFAULTS.joinsPerHour), needMin: clampN(raw.needMin, 10, 180, DEFAULTS.needMin),
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
  const queue = q.map((e) => (e === next ? { ...e, status: 'green', green_at: now, status_since: now, warned: 0, paused_until: null } : e));
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
  const entry = { id: null, captain, members: crew, status: 'waiting', ord: q.length, joined_at: now, status_since: now, green_at: null, warned: 0, searching_since: null, attempts: 0, paused_until: null, needs: needs || 0 };
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
  return { queue: q.map((x) => (x === e ? { ...x, status: 'searching', searching_since: now, status_since: now, warned: 0 } : x)), lit: [], entry: e };
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
    ? { ...e, status: 'waiting', ord: q.length, searching_since: null, green_at: null, status_since: now, attempts: e.attempts + 1 }
    : { ...e, status: 'green', ord: -1, searching_since: null, green_at: now, status_since: now, warned: 0, attempts: e.attempts + 1 };
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
    const stuck = e.status === 'searching' && now - e.searching_since >= st.searchMaxMin * MIN; // nobody ended the search: it must not block the line forever
    if (idle || stale || stuck) removed.push({ ...e, why: idle ? 'idle' : stuck ? 'stuck' : 'stale' });
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

// ---------- queue state: when it opened, when anyone last did something, whether it is closed ----------
// closed 'idle' = it closed itself after an hour with nobody in it (any member can start it again with Join queue);
// closed 'staff' = a manager stopped it (only a manager starts it again). Members can never close it.
export const stateOf = (raw) => { const r = raw && typeof raw === 'object' ? raw : {}; return { openedAt: Number(r.openedAt) || null, last: Number(r.last) || null, closed: r.closed === 'idle' || r.closed === 'staff' ? r.closed : null }; };
// After any change to the line: stamp the activity; the open timer starts with the first group and resets when the line empties.
export const touchState = (state, queue, now) => ({ ...state, last: now, openedAt: queue.length ? state.openedAt ?? now : null });
export const reopenState = (state, now) => ({ ...state, closed: null, last: now });
// The idle hour: an empty line with no activity for `idleCloseMin` closes the queue (0 = never).
export const idleClose = (state, queue, st, now) => (!state.closed && !queue.length && st.idleCloseMin > 0 && state.last && now - state.last >= st.idleCloseMin * MIN ? { ...state, closed: 'idle', openedAt: null } : state);

// ---------- the board ----------
const mention = (id) => `<@${id}>`;
const crewText = (e) => [mention(e.captain), ...e.members.map(mention)].join(', ') + (e.needs ? ` · ${NEED[e.needs]}` : '');
// Discord draws <t:UNIX:R> as "4 minutes ago" and keeps it current in the client, and <t:UNIX:T> as a clock time. A picture cannot tick; these do.
const ts = (ms, f) => `<t:${Math.floor(ms / 1000)}:${f}>`;
// Two timers per group: the whole time in the queue (joined_at survives a failed match and going back in line), and the time in this step.
const timers = (e, now) => {
  const since = e.status_since ?? e.joined_at, step = e.status === 'searching' ? 'Searching' : e.status === 'green' ? 'Green light' : 'Waiting';
  return `-# In the queue: joined ${ts(e.joined_at, 'R')} · ${step}: since ${ts(since, 'T')} (${ts(since, 'R')})${e.attempts ? ` · match failed ${e.attempts}×` : ''}`;
};
export function boardMessage(q, { now = Date.now(), org = 'Phoenix Fire', st = settingsOf(), avgSec = 300, poster = null, state = stateOf() } = {}) {
  const sorted = byOrd(q), front = sorted.find((e) => e.status === 'green' || e.status === 'searching');
  const searching = sorted.filter((e) => e.status === 'searching'), waiting = sorted.filter((e) => e.status === 'waiting');
  const lines = [];
  if (state.closed === 'staff' && !sorted.length) lines.push('**The queue is stopped.** A manager stopped it. A manager starts it again with `/queue start`.');
  else if (state.closed === 'idle' && !sorted.length) lines.push(`**The queue is closed** after ${st.idleCloseMin} min with nobody in it. Press **Join queue** to start it again.`);
  else if (front?.status === 'searching') lines.push(`**SEARCHING NOW**  ${crewText(front)}`, timers(front, now));
  else if (front) lines.push(`**GREEN LIGHT**  ${crewText(front)}`, timers(front, now), `-# Press **Searching now** within ${st.greenRemoveMin} min or the next group goes.`);
  else lines.push('**Nobody is searching.** Press **Join queue** to go first.');
  if (searching.length > 1) lines.push('⚠️ **More than one group is searching: they can match each other.** Managers: `/queue clear`.');
  if (waiting.length) lines.push('', '**NEXT**', ...waiting.slice(0, 8).flatMap((e, k) => [`${k + 1}. ${crewText(e)}${(e.paused_until ?? 0) > now ? ' · ⏸ paused' : ''} · ~${Math.max(1, Math.round(((front ? 1 : 0) + k) * avgSec / 60))} min`, timers(e, now)]));
  if (waiting.length > 8) lines.push(`…and ${waiting.length - 8} more`);
  const open = state.openedAt && sorted.length ? `Queue open since ${ts(state.openedAt, 'T')} (${ts(state.openedAt, 'R')})` : 'The queue is not running';
  const stopped = state.closed === 'staff' && !sorted.length;
  return message({
    accent: 'red', mentions: { parse: [] },
    blocks: [
      header({ eyebrow: `${org} · Rush`, title: '🔥 Rush queue', sub: sorted.length ? open : 'One group searches at a time, in click order' }),
      poster ? cards({ url: poster, alt: 'How the queue works: join, wait for the green light, search in EA, then match found or match failed' }) : null,
      sep(), text(lines.join('\n')), sep(),
      footer(`${sorted.length} group${sorted.length === 1 ? '' : 's'} in line · the captain presses the buttons, the rest of the crew waits for the ping · times tick live in Discord`),
      buttons([
        !stopped && { label: 'Join queue', emoji: '➕', id: 'pf:rq:join', style: 'ok' }, !stopped && { label: 'Leave', emoji: '🚪', id: 'pf:rq:leave' }, !stopped && { label: 'Edit my crew', emoji: '👥', id: 'pf:rq:crew' },
        !stopped && { label: 'Searching now', emoji: '🔎', id: 'pf:rq:search', style: 'brand' }, !stopped && { label: 'Match found', emoji: '✅', id: 'pf:rq:found', style: 'ok' },
        !stopped && { label: 'Match failed', emoji: '⚠️', id: 'pf:rq:failed' }, !stopped && { label: 'Need a player', emoji: '🙋', id: 'pf:rq:need' }, { label: 'Report', emoji: '📢', id: 'pf:rq:report', style: 'no' },
      ]),
    ],
  });
}

// "Need a player": the public post. Pings only what a manager set for it in the Control Center (roles and members), never @everyone.
// answers = [{ user, answer }]; open until `expires`, then the post closes itself.
export function needMessage(e, { positions = [], answers = [], roleIds = [], userIds = [], now = Date.now(), expires = now + DEFAULTS.needMin * MIN, closed = false, org = 'Phoenix Fire', queuePos = 0, status = 'waiting', mode = 'Rush · 5v5' } = {}) {
  const lobby = [e.captain, ...e.members], size = lobby.length, want = e.needs === 9 ? 1 : e.needs || 1;
  const open = !closed && expires > now;
  const pos = positions.length ? positions.map((p) => POSITIONS[p] ?? p).join(', ') : e.needs === 9 ? POSITIONS.GK : POSITIONS.ANY;
  const ins = answers.filter((a) => a.answer === 'in'), later = answers.filter((a) => a.answer === 'later');
  const ping = open && (roleIds.length || userIds.length) ? [...roleIds.map((r) => `<@&${r}>`), ...userIds.map(mention)].join(' ') : null;
  return message({
    accent: open ? 'red' : 'steel', ping, mentions: open ? { parse: [], roles: roleIds.map(String), users: userIds.map(String) } : { parse: [] },
    blocks: [
      header({ eyebrow: `${org} · Rush`, title: `🙋 ${open ? 'A Rush lobby needs' : 'Closed: it needed'} ${e.needs === 9 ? 'a keeper' : `${want} player${want === 1 ? '' : 's'}`}`, sub: open ? `Closes ${ts(expires, 'R')}` : 'This call is closed' }),
      sep(),
      facts([
        ['In the lobby', `${lobby.map(mention).join(', ')} (${size} of ${MAX_CREW})`],
        ['Players needed', e.needs === 9 ? 'a keeper (1)' : String(want)],
        ['Positions', pos],
        ['Mode', mode],
        ['Queue', status === 'searching' ? 'searching now' : status === 'green' ? 'at the green light' : queuePos ? `waiting, position ${queuePos}` : 'in line'],
        ['In', ins.length ? ins.map((a) => mention(a.user)).join(', ') : 'nobody yet'],
        later.length ? ['Later', later.map((a) => mention(a.user)).join(', ')] : null,
      ].filter(Boolean)),
      sep(), footer(`Press I'm in and the captain <@${e.captain}> is told. only the audience a manager set in the Control Center is pinged, never @everyone.`),
      open ? buttons([{ label: "I'm in", emoji: '🙋', id: `pf:rq:needin:${e.captain}`, style: 'ok' }, { label: 'Later', emoji: '⏳', id: `pf:rq:needlater:${e.captain}` }]) : null,
    ],
  });
}

// ---------- persistence ----------
const rows = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).all().then((r) => r.results);
const one = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).first();
const toEntry = (r) => ({ status_since: r.status_since ?? r.searching_since ?? r.green_at ?? r.joined_at, id: r.id, captain: r.captain_id, members: JSON.parse(r.members || '[]'), status: r.status, ord: r.ord, joined_at: r.joined_at, green_at: r.green_at, warned: r.warned, searching_since: r.searching_since, attempts: r.attempts, paused_until: r.paused_until, needs: r.needs });
export const loadQueue = async (env) => (await rows(env, 'SELECT * FROM rush_queue ORDER BY ord')).map(toEntry);
export async function saveQueue(env, before, after) {
  const keep = new Set(after.map((e) => e.captain));
  const stmts = before.filter((e) => !keep.has(e.captain)).map((e) => env.DB.prepare('DELETE FROM rush_queue WHERE captain_id = ?').bind(e.captain));
  for (const e of after) {
    stmts.push(env.DB.prepare(`INSERT INTO rush_queue (captain_id, members, status, ord, joined_at, status_since, green_at, warned, searching_since, attempts, paused_until, needs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (captain_id) DO UPDATE SET members = excluded.members, status = excluded.status, ord = excluded.ord, status_since = excluded.status_since, green_at = excluded.green_at, warned = excluded.warned, searching_since = excluded.searching_since, attempts = excluded.attempts, paused_until = excluded.paused_until, needs = excluded.needs`)
      .bind(e.captain, JSON.stringify(e.members), e.status, e.ord, e.joined_at, e.status_since ?? e.joined_at, e.green_at ?? null, e.warned ?? 0, e.searching_since ?? null, e.attempts ?? 0, e.paused_until ?? null, e.needs ?? 0));
  }
  if (stmts.length) await env.DB.batch(stmts);
}
export async function getState(env) {
  const r = await one(env, "SELECT value FROM meta WHERE key = 'rush_queue_state'").catch(() => null);
  try { return stateOf(JSON.parse(r?.value || '{}')); } catch { return stateOf(); }
}
export const saveState = (env, s) => env.DB.prepare("INSERT INTO meta (key, value) VALUES ('rush_queue_state', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").bind(JSON.stringify(s)).run();
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
// "No channel set" replies come from the Organization config (channelNotice: which purpose, where a manager sets it), never from a hand-written string.
const noChannel = async (env, purpose) => reply(await channelNotice(env, purpose));
const rushEnv = (env) => (appConfigured(env, 'rush') && env.BOT_APP !== 'rush' ? appEnv(env, 'rush') : env); // buttons only work on messages the Rush app posted
const BOARD_KEY = 'rq:board:';

// Delete the old board in each queue channel and post a fresh one at the bottom. `pings` = messages posted first (green light, warnings).
// Debounce (Discord allows about 5 posts per 5 seconds in a channel): a second refresh inside BOARD_GAP_MS with nothing to ping edits the
// board in place instead of deleting and posting again; the next click or the minute tick puts it back at the bottom.
export const BOARD_GAP_MS = 1500;
export async function refreshBoards(env, { now = Date.now(), pings = [], force = false } = {}) {
  const channels = await postChannels(env, 'auto:rush-board', 'rush_queue');
  if (!channels.length) return { channels: 0 };
  const e = rushEnv(env), kv = kvOf(env);
  const q = await loadQueue(env), st = await getSettings(env), avgSec = await avgSearchSeconds(env), state = await getState(env);
  const msg = autoBanner(env, boardMessage(q, { now, org: orgName(env), st, avgSec, state, poster: bannerUrl(env, 'queueflow') }), 'queue');
  let edited = 0;
  for (const ch of channels) {
    const old = await kv?.get(BOARD_KEY + ch, 'json').catch(() => null);
    if (old?.id && !force && !pings.length && now - (old.at ?? 0) < BOARD_GAP_MS && now >= (old.at ?? 0)) {
      const ok = await discord(e, 'PATCH', `/channels/${ch}/messages/${old.id}`, { flags: msg.flags, components: msg.components, allowed_mentions: msg.allowed_mentions }).catch(() => null);
      if (ok) { edited++; continue; }
    }
    if (old?.id) await discord(e, 'DELETE', `/channels/${ch}/messages/${old.id}`).catch(() => null);
    for (const p of pings) await discord(e, 'POST', `/channels/${ch}/messages`, p).catch((err) => console.log('rush queue ping failed', err.message));
    const sent = await discord(e, 'POST', `/channels/${ch}/messages`, msg).catch((err) => { console.log('rush queue board failed', err.message); return null; });
    if (sent?.id) await kv?.put(BOARD_KEY + ch, JSON.stringify({ id: sent.id, at: now }));
  }
  return { channels: channels.length, edited };
}
// A short ping: the mentions sit above a small steel panel (the only text allowed outside a panel), only those members can be notified.
const ping = (users, line, accent = 'steel') => message({ accent, ping: users.map(mention).join(' '), mentions: { parse: [], users: users.map(String) }, blocks: [text(line)] });
const greenPing = (e, st) => ping(everyone(e), `**You're up.** Start searching in EA, then press **Searching now** (you have ${st.greenRemoveMin} min before the next group goes).`, 'win');

// Cron, every minute: idle timers, the idle hour, then make sure the board is the newest message (one REST read per channel, skipped when the
// queue is empty and nothing changed). A Worker has no Gateway, so chat from people and other bots is only noticed here: within a minute.
export async function queueTick(env, now = Date.now()) {
  if (!env.DB || !flagOn(env, { role: 'owner' }, 'rushQueue')) return { skipped: true };
  const before = await loadQueue(env), state0 = await getState(env), st = await getSettings(env);
  const closedNow = idleClose(state0, before, st, now);
  if (closedNow !== state0) await saveState(env, closedNow);
  if (!before.length && closedNow === state0) return { skipped: true }; // an empty line costs no REST calls
  const sw = sweep(before, st, now);
  if (sw.queue !== before) await saveQueue(env, before, sw.queue);
  if (sw.removed.length) await Promise.all(sw.removed.map((e) => closeNeed(env, e.captain)));
  const gone = { idle: 'You were removed from the Rush queue (no answer at the green light). Press **Join queue** to come back.', stuck: `Your search ran past ${st.searchMaxMin} min, so the queue let the next group go. Press **Join queue** to come back.`, stale: 'You were dropped from the Rush queue after a long wait. Press **Join queue** to come back.' };
  const pings = [
    ...sw.warn.map((e) => ping(everyone(e), `**One minute left**: press **Searching now** or the next group goes.`)),
    ...sw.removed.map((e) => ping([e.captain], gone[e.why])),
    ...sw.lit.map((e) => greenPing(e, st)),
    ...sw.ask.map((e) => ping([e.captain], `Still searching? Press **Match found**, **Match failed** or **Leave**.`)),
  ];
  const channels = await postChannels(env, 'auto:rush-board', 'rush_queue');
  if (!channels.length) return { skipped: true, noChannel: true };
  let stale = pings.length > 0 || closedNow !== state0;
  if (!stale) {
    const kv = kvOf(env);
    for (const ch of channels) {
      const have = await kv?.get(BOARD_KEY + ch, 'json').catch(() => null);
      const last = await discord(rushEnv(env), 'GET', `/channels/${ch}`).catch(() => null);
      if (!have?.id || (last?.last_message_id && last.last_message_id !== have.id)) { stale = true; break; }
    }
  }
  if (stale) await refreshBoards(env, { now, pings });
  return { reposted: stale, warned: sw.warn.length, removed: sw.removed.length, closed: closedNow.closed };
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
  await saveState(env, touchState(await getState(env), res.queue, now)); // activity + the open timer (reset when the line empties)
  const st = await getSettings(env);
  for (const e of before) if (e.needs && !res.queue.some((x) => x.captain === e.captain && x.needs)) await closeNeed(env, e.captain); // its "Need a player" post closes with the need
  const pings = [...extra, ...(res.lit ?? []).map((e) => greenPing(e, st))];
  await after(env, ctx, () => refreshBoards(env, { now, pings }));
}
const reasons = { already: 'You are already in the queue.', absent: 'Your group is not in the queue.', 'not-green': 'Wait for the green light first.', 'not-searching': 'Your group is not searching.', 'not-waiting': 'Only a waiting group can pause.' };

export async function queueInteraction(i, env, me, who, ctx, now = Date.now()) {
  if (!env.DB) return say('The member database is not connected');
  if (!flagOn(env, who, 'rushQueue')) return say('The Rush queue is not switched on for you yet', 'Ask a manager.');
  if (!can(who, 'events.rsvp')) return say('Members only', 'Join the Phoenix Fire server and link your account first.');
  if (!(await channelsFor(env, 'rush_queue')).length) return noChannel(env, 'rush_queue');
  const id = String(i.data?.custom_id ?? ''), [, , action, mode] = id.split(':');
  const uid = String(me.u), picked = (i.data?.values ?? []).map(String);
  const q = await loadQueue(env), st = await getSettings(env);

  if (i.type === 5) return report(i, env, me, now); // modal submit
  if (action === 'report') return { type: 9, data: { custom_id: 'pf:rq:report', title: 'Report a lobby (anonymous)', components: [
    { type: 1, components: [{ type: 4, custom_id: 'group', style: 1, label: 'Which group or lobby?', required: true, max_length: 100, placeholder: q.length ? q.slice(0, 3).map((e) => `captain ${e.captain}`).join(' / ') : 'Name or what you saw' }] },
    { type: 1, components: [{ type: 4, custom_id: 'note', style: 2, label: 'Anything staff should know (optional)', required: false, max_length: 300 }] },
  ] } };

  const state = await getState(env);
  if (state.closed === 'staff' && ['join', 'search', 'found', 'failed', 'need', 'needin', 'needlater'].includes(action) && !q.length) return say('The queue is stopped', 'A manager stopped it and only a manager can start it again (`/queue start`).');
  if (action === 'needin' || action === 'needlater') return needAnswer(env, ctx, mode, uid, action === 'needin' ? 'in' : 'later', q, now);

  if (action === 'join') {
    if (!find(q, uid) && !(await joinAllowed(env, uid, st, now))) return say('Slow down a little', `You can join ${st.joinsPerHour} times an hour. Staff can see the queue is busy, not blocked.`);
    if (state.closed === 'idle') await saveState(env, reopenState(state, now)); // any member may start an idle-closed queue
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
    await commit(env, ctx, q, res, now, [message({ accent: 'win', blocks: [text('🔥 **Phoenix found a match**\n-# The next group has the green light.')] })]);
    return say('✅ Match found', 'You are out of the queue and the next group has the green light. Log the game with `/rush log` when it is over.', 'win');
  }
  if (action === 'failed') {
    const res = failed(q, uid, st.failedPolicy, now); if (res.error) return say(reasons[res.error]);
    await bump(env, uid, 'failed', now);
    await commit(env, ctx, q, res, now);
    return say('Match failed', st.failedPolicy === 'bottom' ? 'You went to the back of the line; the next group has the green light.' : 'You keep your turn: you are back at the green light.', 'steel');
  }
  if (action === 'pause') return say('Only managers can pause the queue', 'Members can join, leave and start it, never turn it off. Press **Leave** to step out; you can join again any time.'); // anti-troll: no member pause
  if (action === 'need') {
    const cur = find(q, uid);
    if (!cur) return say(reasons.absent, 'Join the queue first.');
    if (mode === 'pick') {
      const n = Number(picked[0]) || 0, res = setNeeds(q, uid, n);
      if (!n) { await commit(env, ctx, q, res, now); return say('Cleared', 'The call is closed.', 'win'); }
      await closeNeed(env, uid); // a new count replaces the old call
      await saveQueue(env, q, res.queue); // the need is on the board at once; the post waits for the positions
      if (n === 9) return finishNeed(env, ctx, res.queue, uid, ['GK'], now);
      return reply(message({ ephemeral: true, accent: 'steel', blocks: [header({ eyebrow: 'Rush queue', title: 'Which positions?', sub: 'Optional. Skip to say any position.' }),
        { type: 1, components: [{ type: 3, custom_id: 'pf:rq:need:pos', placeholder: 'Pick up to 3 positions', min_values: 0, max_values: 3, options: Object.entries(POSITIONS).filter(([k]) => k !== 'GK').map(([value, label]) => ({ label, value })) }] }] }));
    }
    if (mode === 'pos') return finishNeed(env, ctx, q, uid, picked.filter((x) => POSITIONS[x]), now);
    return reply(message({ ephemeral: true, accent: 'steel', blocks: [header({ eyebrow: 'Rush queue', title: 'Need a player?', sub: 'Posts a call, pings the people a manager chose, and shows on the board' }),
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
// ---------- "Need a player": the public call ----------
const NEED_KEY = 'rq:need:';
const joinKey = (uid) => `rq:jl:${uid}`;
// Members join at most `joinsPerHour` times an hour (anti-troll: join/leave spam would repost the board forever).
async function joinAllowed(env, uid, st, now) {
  const kv = kvOf(env); if (!kv) return true;
  const used = Number(await kv.get(joinKey(uid)).catch(() => 0)) || 0;
  if (used >= st.joinsPerHour) return false;
  await kv.put(joinKey(uid), String(used + 1), { expirationTtl: 3600 }).catch(() => null);
  return true;
}
// Who the call pings: the Control Center row `auto:rush-need` (roles and members, minus the deny lists); with none set it falls back to the Rush ping role
// of the older tool settings, and with neither it pings nobody and says so (never a guessed role).
export async function needAudience(env) {
  const a = await audienceOf(env, 'auto:rush-need');
  let roles = a.roles, users = a.members, legacy = false;
  if (!roles.length && !users.length) { const r = String((await getToolSettings(env).catch(() => ({}))).pingRoles?.rush ?? '').replace(/\D/g, ''); if (r) { roles = [r]; legacy = true; } }
  return { enabled: a.enabled, roles: roles.filter((r) => !a.denyRoles.includes(r)), users: users.filter((u) => !a.denyMembers.includes(u)), legacy };
}
async function finishNeed(env, ctx, q, uid, positions, now) {
  const e = find(q, uid), st = await getSettings(env);
  if (!e) return say(reasons.absent);
  const aud = await needAudience(env), channels = await postChannels(env, 'auto:rush-need', 'rush_need');
  await commit(env, ctx, q, { queue: q, lit: [] }, now); // the board shows the need either way
  if (!aud.enabled) return say(`🙋 ${NEED[e.needs]}`, 'It shows on the board. The public call is switched off in the Control Center.', 'win');
  if (!channels.length) return say(`🙋 ${NEED[e.needs]}`, 'It shows on the board. No channel is set for the Rush calls: a manager adds one in the Control Center.', 'steel');
  const expires = now + st.needMin * MIN, post = needMessage(e, { positions, roleIds: aud.roles, userIds: aud.users, now, expires, org: orgName(env), queuePos: positionOf(q, uid), status: e.status });
  const sent = [];
  for (const ch of channels) {
    const m = await discord(rushEnv(env), 'POST', `/channels/${ch}/messages`, autoBanner(env, post, 'queue')).catch((err) => { console.log('rush need post failed', err.message); return null; });
    if (m?.id) sent.push({ ch, id: m.id });
  }
  await kvOf(env)?.put(NEED_KEY + uid, JSON.stringify({ posts: sent, positions, answers: [], expires, lobby: e.members, needs: e.needs }), { expirationTtl: st.needMin * 60 + 600 });
  await after(env, ctx, () => refreshBoards(env, { now, force: true })); // the call is posted first, then the board goes back to the bottom
  const who = aud.roles.length + aud.users.length;
  return say(`🙋 ${NEED[e.needs]}`, sent.length ? `Posted${who ? `, ${who} ${who === 1 ? 'audience' : 'audiences'} pinged` : ', nobody is set to be pinged (a manager picks the audience in the Control Center)'}. It closes in ${st.needMin} min.` : 'It shows on the board, but the post failed.', 'win');
}
// "I'm in" / "Later" on the call: the post lists the answer, the captain is pinged once, the answerer gets a private note.
async function needAnswer(env, ctx, captain, uid, answer, q, now) {
  const kv = kvOf(env), need = await kv?.get(NEED_KEY + captain, 'json').catch(() => null), e = find(q, captain);
  if (!need || !e || need.expires <= now) return say('This call is closed', 'The group already filled the spot or it ran out of time.');
  if (uid === captain || everyone(e).includes(uid)) return say('That is your own lobby', 'Wait for someone else to answer.');
  const mine = find(q, uid) || q.find((x) => everyone(x).includes(uid));
  if (answer === 'in' && mine) return say('You are in a queue group already', `Leave your group first, then press **I'm in**.`);
  need.answers = [...need.answers.filter((a) => a.user !== uid), { user: uid, answer }];
  await kv.put(NEED_KEY + captain, JSON.stringify(need), { expirationTtl: 3600 });
  const st = await getSettings(env), post = needMessage(e, { positions: need.positions, answers: need.answers, now, expires: need.expires, org: orgName(env), queuePos: positionOf(q, captain), status: e.status, roleIds: [], userIds: [] });
  const quiet = { ...post, components: post.components.filter((c) => c.type !== 10) }; // an edit never pings again
  for (const p of need.posts) await discord(rushEnv(env), 'PATCH', `/channels/${p.ch}/messages/${p.id}`, quiet).catch(() => null);
  if (answer === 'in') await after(env, ctx, () => refreshBoards(env, { now, pings: [ping([captain], `<@${uid}> is **in** for your lobby. Add them in **Edit my crew**, then search.`)] }));
  return say(answer === 'in' ? '🙋 You are in' : '⏳ Noted', answer === 'in' ? `<@${captain}> was told. They add you to the crew.` : `<@${captain}> sees you as "later".`, 'win');
}
export async function closeNeed(env, captain) {
  const kv = kvOf(env), need = await kv?.get(NEED_KEY + captain, 'json').catch(() => null);
  if (!need) return;
  await kv.delete(NEED_KEY + captain).catch(() => null);
  const stub = { captain, members: need.lobby ?? [], needs: need.needs ?? 1 };
  for (const p of need.posts ?? []) await discord(rushEnv(env), 'PATCH', `/channels/${p.ch}/messages/${p.id}`, needMessage(stub, { closed: true, answers: need.answers ?? [], org: orgName(env) })).catch(() => null);
}

// Anonymous report: no reporter id is stored or posted. The rate limit keys on a salted hash that expires after an hour.
async function sha(s) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24); }
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>@`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
export async function report(i, env, me, now) {
  const fields = Object.fromEntries(flat(i.data?.components).filter((c) => c.custom_id).map((c) => [c.custom_id, c.value]));
  const group = clean(fields.group, 100), note = clean(fields.note, 300);
  if (!group) return say('Tell us which group', 'Name the group or what you saw.');
  const targets = await channelsFor(env, 'rush_queue_reports');
  if (!targets.length) return noChannel(env, 'rush_queue_reports');
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
  const staff = can(who, 'servertools.setup'); // managers, admins and the owner (roles mapped in the Organization config); never plain members
  const gated = await gate(env, 'slash:/queue', { userId: me.u, roleIds: i?.member?.roles ?? [], channelId: i?.channel_id, now });
  if (!gated.ok) return say('That command is switched off for you here', 'A manager sets who can use it in the Control Center.');
  const q = await loadQueue(env), st = await getSettings(env), state = await getState(env);
  if (sub === 'status') {
    const head = state.closed === 'staff' ? 'The queue is stopped by a manager.' : state.closed === 'idle' ? `The queue closed after ${st.idleCloseMin} idle min. Press **Join queue** to start it.` : '';
    if (!q.length) return say('Nobody is in the queue', head || 'Press **Join queue** on the board to go first.');
    return say(`🔥 ${q.length} group${q.length === 1 ? '' : 's'} in line`, `${state.openedAt ? `Open since ${ts(state.openedAt, 'T')} (${ts(state.openedAt, 'R')})\n` : ''}${byOrd(q).map((e) => `${e.status === 'waiting' ? `${positionOf(q, e.captain)}.` : e.status === 'searching' ? '🔎' : '🟢'} ${crewText(e)}\n-# joined ${ts(e.joined_at, 'R')} · ${e.status === 'searching' ? 'searching' : e.status === 'green' ? 'green light' : 'waiting'} since ${ts(e.status_since ?? e.joined_at, 'T')}`).join('\n')}`);
  }
  if (!staff) return say('Only managers can use that', '`/queue status` shows the line for everyone.');
  if (sub === 'board') {
    const r = await refreshBoards(env, { now });
    return r.channels ? say('✅ Board posted', `${r.channels} channel${r.channels === 1 ? '' : 's'}.`, 'win') : noChannel(env, 'rush_queue');
  }
  if (sub === 'stop') {
    await saveState(env, { ...touchState(state, [], now), closed: 'staff' });
    await Promise.all(q.map((e) => closeNeed(env, e.captain)));
    await saveQueue(env, q, []); await after(env, ctx, () => refreshBoards(env, { now }));
    return say('⏹ Queue stopped', 'Everyone in line was cleared. Members cannot start it again: use `/queue start`.', 'win');
  }
  if (sub === 'start') { await saveState(env, reopenState(state, now)); await after(env, ctx, () => refreshBoards(env, { now })); return say('▶️ Queue started', 'Members can join again.', 'win'); }
  if (sub === 'clear') { await Promise.all(q.map((e) => closeNeed(env, e.captain))); await saveQueue(env, q, []); await after(env, ctx, () => refreshBoards(env, { now })); return say('🧹 Queue cleared', 'Everyone presses **Join queue** again.', 'win'); }
  if (sub === 'remove') {
    const target = String(o.member ?? ''), e = q.find((x) => everyone(x).includes(target));
    if (!e) return say('That member is not in the queue');
    const res = e.captain === target ? leave(q, target, now) : setMembers(q, e.captain, e.members.filter((m) => m !== target));
    await commit(env, ctx, q, res, now);
    return say('✅ Removed', `<@${target}> is out of the queue.`, 'win');
  }
  if (sub === 'settings') {
    const next = settingsOf({ ...st, ...(o.failed_policy ? { failedPolicy: o.failed_policy } : {}), ...(o.warn_minutes != null ? { greenWarnMin: o.warn_minutes } : {}), ...(o.remove_minutes != null ? { greenRemoveMin: o.remove_minutes } : {}), ...(o.idle_minutes != null ? { idleCloseMin: o.idle_minutes } : {}) });
    const changed = !!(o.failed_policy || o.warn_minutes != null || o.remove_minutes != null || o.idle_minutes != null);
    if (changed) await saveSettings(env, next);
    return say(changed ? 'Queue settings saved' : 'Queue settings', `A match that falls through: **${next.failedPolicy === 'next' ? 'goes next' : 'goes to the bottom'}**\nGreen light warning: **${next.greenWarnMin} min**, removed after **${next.greenRemoveMin} min**\nThe empty queue closes after **${next.idleCloseMin ? `${next.idleCloseMin} min idle` : 'never'}**`, changed ? 'win' : undefined);
  }
  return say('Unknown queue command');
}
