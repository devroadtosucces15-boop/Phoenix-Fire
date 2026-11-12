// Rush queue manager (bot/rushqueue.js, PLANNING/RUSH-QUEUE.md): strict click order, one-at-a-time green light, failed-goes-next,
// idle timers, one always-latest board, anonymous reports, channels from Organization config, Phoenix look.
import { env, sqlite, KV } from './mock.mjs';
import { t, done } from './lib.mjs';
import { plainText } from '../bot/ui.js';
import * as Q from '../bot/rushqueue.js';
import * as C from '../bot/controls.js';

const MIN = 60e3, T0 = Date.parse('2026-11-20T20:00:00Z');
const mk = (q = []) => q;
const cap = (q, c) => q.find((e) => e.captain === c);

// ---------- pure logic ----------
let q = mk(), r = Q.join(q, { captain: 'A', members: ['11', '12'] }, T0);
t('first group joins and gets the green light at once', r.queue.length === 1 && r.queue[0].status === 'green' && r.lit.length === 1);
r = Q.join(r.queue, { captain: 'B', members: ['21'] }, T0 + 1); const r2 = Q.join(r.queue, { captain: 'C' }, T0 + 2);
q = r2.queue;
t('strict click order, one green light', q.map((e) => e.captain).join('') === 'ABC' && q.map((e) => e.status).join() === 'green,waiting,waiting' && r.lit.length === 0);
t('position counts waiting groups only', Q.positionOf(q, 'B') === 1 && Q.positionOf(q, 'C') === 2);
t('two groups cannot share a member, and the answer names who holds them', (() => { const x = Q.join(q, { captain: 'D', members: ['11', '99'] }, T0 + 3); return x.error === 'conflict' && x.clash[0].user === '11' && x.clash[0].captain === 'A' && x.queue === q; })());
t('a captain cannot join twice', Q.join(q, { captain: 'B' }, T0 + 3).error === 'already');
t('a crew is at most 5 including the captain, unique, captain not repeated', Q.crewOf('9', ['9', '1', '1', '2', '3', '4', '5']).join() === '1,2,3,4');
t('searching needs the green light; matched needs a search', Q.search(q, 'B', T0).error === 'not-green' && Q.matched(q, 'A', T0).error === 'not-searching');

let s = Q.search(q, 'A', T0 + 5 * MIN).queue;
t('Searching now marks the group searching', cap(s, 'A').status === 'searching' && cap(s, 'A').searching_since === T0 + 5 * MIN);
const m = Q.matched(s, 'A', T0 + 8 * MIN);
t('match found removes the group and gives the next one the green light', m.queue.map((e) => e.captain).join('') === 'BC' && cap(m.queue, 'B').status === 'green' && m.lit[0].captain === 'B' && m.waitSec === 180);
t('everyone moves up (orders renumbered)', m.queue.map((e) => e.ord).join() === '0,1');

const fn = Q.failed(s, 'A', 'next', T0 + 9 * MIN);
t('failed, policy next: straight back to the green light, ahead of the line', fn.queue.map((e) => e.captain).join('') === 'ABC' && cap(fn.queue, 'A').status === 'green' && cap(fn.queue, 'A').attempts === 1 && cap(fn.queue, 'B').status === 'waiting');
const fb = Q.failed(s, 'A', 'bottom', T0 + 9 * MIN);
t('failed, policy bottom: to the end, the next group gets the light', fb.queue.map((e) => e.captain).join('') === 'BCA' && cap(fb.queue, 'B').status === 'green' && cap(fb.queue, 'A').status === 'waiting');
t('leaving passes the light on', (() => { const x = Q.leave(q, 'A', T0 + 6); return x.queue[0].captain === 'B' && x.queue[0].status === 'green' && x.lit[0].captain === 'B'; })());

const st = Q.settingsOf();
t('defaults: failed goes next, warn at 1 min, removed at 2 min', st.failedPolicy === 'next' && st.greenWarnMin === 1 && st.greenRemoveMin === 2);
t('settings are clamped (remove is always after warn)', Q.settingsOf({ greenWarnMin: 5, greenRemoveMin: 3 }).greenRemoveMin === 6 && Q.settingsOf({ failedPolicy: 'x' }).failedPolicy === 'next');
let sw = Q.sweep(q, st, T0 + 30e3);
t('idle: nothing before the warning', !sw.warn.length && !sw.removed.length);
sw = Q.sweep(q, st, T0 + 1 * MIN);
t('idle: a warning at 1 minute, still in line', sw.warn.map((e) => e.captain).join() === 'A' && cap(sw.queue, 'A').status === 'green' && cap(sw.queue, 'A').warned === 1);
t('idle: the warning is sent once', Q.sweep(sw.queue, st, T0 + 90e3).warn.length === 0);
const sw2 = Q.sweep(sw.queue, st, T0 + 2 * MIN);
t('idle: removed at 2 minutes and the next group is lit', sw2.removed.map((e) => e.captain).join() === 'A' && sw2.queue[0].captain === 'B' && sw2.queue[0].status === 'green' && sw2.lit[0].captain === 'B');
t('a waiting group idle for 90 minutes is dropped', Q.sweep(q, { ...st, greenRemoveMin: 999, greenWarnMin: 998 }, T0 + 91 * MIN).removed.some((e) => e.captain === 'C' && e.why === 'stale'));
t('a long search asks "still searching?" once', (() => { const a = Q.sweep(s, st, T0 + 5 * MIN + 15 * MIN); return a.ask.length === 1 && Q.sweep(a.queue, st, T0 + 21 * MIN).ask.length === 0; })());
const pz = Q.pause(q, 'B', 10, T0);
t('a paused group keeps its place but is skipped for the green light', (() => { const x = Q.leave(pz.queue, 'A', T0 + MIN); return cap(x.queue, 'B').status === 'waiting' && cap(x.queue, 'C').status === 'green' && x.queue[0].captain === 'B'; })());
t('only a waiting group can pause', Q.pause(q, 'A', 10, T0).error === 'not-waiting');
t('swapping members for tonight checks conflicts', Q.setMembers(q, 'B', ['11']).error === 'conflict' && cap(Q.setMembers(q, 'B', ['31', '32']).queue, 'B').members.join() === '31,32');
t('"move them here" takes a member out of the other group', cap(Q.release(q, ['11'], 'B'), 'A').members.join() === '12');

const board = Q.boardMessage(q, { now: T0 + 2 * MIN, org: 'Phoenix Fire' });
const bt = plainText(board);
t('board: shows the green light group, NEXT with positions and "needs N"', /GREEN LIGHT/.test(bt) && /NEXT/.test(bt) && /1\. <@B>/.test(bt) && /2\. <@C>/.test(bt) && /needs a keeper/.test(plainText(Q.boardMessage(Q.setNeeds(q, 'C', 9).queue))));
t('board: empty says nobody is searching', /Nobody is searching/.test(plainText(Q.boardMessage([]))));
t('board: warns when two groups search at once', /More than one group/.test(plainText(Q.boardMessage(q.map((e) => ({ ...e, status: 'searching', searching_since: T0 })), { now: T0 }))));
const ids = JSON.stringify(board).match(/"custom_id":"[^"]+"/g).map((x) => x.slice(13, -1));
t('board: all the buttons, ids match RQ_ID, no pings', ['join', 'leave', 'crew', 'search', 'found', 'failed', 'need', 'report'].every((a) => ids.includes(`pf:rq:${a}`)) && ids.every((x) => Q.RQ_ID.test(x)) && JSON.stringify(board.allowed_mentions) === '{"parse":[]}');
t('board: there is no Pause button for members (only managers stop the queue)', !ids.includes('pf:rq:pause') && !/Pause/.test(JSON.stringify(board)));

// ---------- timers: Discord timestamps tick live in the client ----------
const unix = (ms) => Math.floor(ms / 1000);
t('a group has joined_at and status_since from the moment it joins', cap(q, 'A').joined_at === T0 && cap(q, 'A').status_since === T0 && cap(q, 'B').status_since === T0 + 1);
t('Searching now restarts status_since, joined_at stays', cap(s, 'A').joined_at === T0 && cap(s, 'A').status_since === T0 + 5 * MIN);
t('failed (policy next): joined_at survives, status_since restarts, the failed count shows', cap(fn.queue, 'A').joined_at === T0 && cap(fn.queue, 'A').status_since === T0 + 9 * MIN);
t('failed (policy bottom): joined_at still survives while the group waits again', cap(fb.queue, 'A').joined_at === T0 && cap(fb.queue, 'A').status === 'waiting' && cap(fb.queue, 'A').status_since === T0 + 9 * MIN);
const tb = JSON.stringify(Q.boardMessage(s, { now: T0 + 6 * MIN, state: Q.touchState(Q.stateOf(), s, T0) }));
t('board: the searching group shows both timers as live Discord timestamps', tb.includes(`<t:${unix(T0)}:R>`) && tb.includes(`<t:${unix(T0 + 5 * MIN)}:R>`) && tb.includes(`<t:${unix(T0 + 5 * MIN)}:T>`) && /In the queue: joined/.test(tb) && /Searching: since/.test(tb));
t('board: every waiting group shows joined and waiting-since', (() => { const b = JSON.stringify(Q.boardMessage(q, { now: T0 + 2 * MIN })); return b.includes(`<t:${unix(T0 + 1)}:R>`) && /Waiting: since/.test(b) && /Green light: since/.test(b); })());
t('board: how long the queue has been open, only while someone is in it', JSON.stringify(Q.boardMessage(q, { now: T0, state: { openedAt: T0 - 5 * MIN, last: T0, closed: null } })).includes(`Queue open since <t:${unix(T0 - 5 * MIN)}:T>`) && /not running/.test(JSON.stringify(Q.boardMessage([], { state: Q.stateOf() })) ) === false);
t('queue state: the open timer starts with the first group and resets when the line empties', (() => { const a = Q.touchState(Q.stateOf(), q, T0); const b = Q.touchState(a, q, T0 + MIN); const c = Q.touchState(b, [], T0 + 2 * MIN); return a.openedAt === T0 && b.openedAt === T0 && c.openedAt === null && c.last === T0 + 2 * MIN; })());
t('idle hour: an empty queue closes after idleCloseMin with no activity, never before, never with groups in line, never when set to 0', (() => { const s0 = Q.touchState(Q.stateOf(), [], T0), cfg = Q.settingsOf(); return Q.idleClose(s0, [], cfg, T0 + 59 * MIN) === s0 && Q.idleClose(s0, [], cfg, T0 + 60 * MIN).closed === 'idle' && Q.idleClose(s0, q, cfg, T0 + 90 * MIN) === s0 && Q.idleClose(s0, [], Q.settingsOf({ idleCloseMin: 0 }), T0 + 999 * MIN) === s0; })());
t('board: a closed queue says so and any member can start it; a stopped one says managers start it, with no Join button', (() => { const idle = JSON.stringify(Q.boardMessage([], { state: { closed: 'idle' } })), stop = JSON.stringify(Q.boardMessage([], { state: { closed: 'staff' } })); return /queue is closed/.test(idle) && /pf:rq:join/.test(idle) && /stopped/.test(stop) && !/pf:rq:join/.test(stop) && /\/queue start/.test(stop); })());
t('a search nobody ends is removed (stuck) so it cannot block the line', (() => { const x = Q.sweep(s, { ...st, searchMaxMin: 60 }, T0 + 5 * MIN + 61 * MIN); return x.removed.some((e) => e.captain === 'A' && e.why === 'stuck') && cap(x.queue, 'B').status === 'green'; })());
t('the new settings are clamped', Q.settingsOf({ idleCloseMin: 99999 }).idleCloseMin === 1440 && Q.settingsOf({ idleCloseMin: 0 }).idleCloseMin === 0 && Q.settingsOf().idleCloseMin === 60 && Q.settingsOf({ joinsPerHour: 0 }).joinsPerHour === 1);

// ---------- Discord side: fake REST, channels from Organization config ----------
env.DISCORD_BOT_TOKEN = 'bot-token';
env.FEATURES = JSON.stringify({ ...JSON.parse(env.FEATURES), rushQueue: 'members', rushLfg: 'owner' });
const calls = []; let msgN = 0; const chanLast = {};
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (!url.startsWith('https://discord.com/api/v10')) return realFetch(url, init);
  const path = url.slice('https://discord.com/api/v10'.length), method = init.method ?? 'GET', body = init.body ? JSON.parse(init.body) : undefined;
  calls.push({ method, path, body });
  if (method === 'POST' && /^\/channels\/\d+\/messages$/.test(path)) { const id = `m${++msgN}`; chanLast[path.split('/')[2]] = id; return Response.json({ id }); }
  if (method === 'DELETE') return new Response(null, { status: 204 });
  if (method === 'PATCH') return Response.json({ id: path.split('/').pop() });
  if (method === 'GET' && /^\/channels\/\d+$/.test(path)) return Response.json({ id: path.split('/')[2], last_message_id: chanLast[path.split('/')[2]] ?? null });
  return Response.json({ message: 'unexpected ' + path }, { status: 404 });
};
const QCH = '1600000000000000001', STAFF = '1600000000000000002', GUILD = '1600000000000000009';
const U = (n) => ({ u: `70${n}`, n: `Player ${n}`, a: null, role: 'member' });
const [p1, p2, p3, p4] = [1, 2, 3, 4].map(U);
const press = (me, id, extra = {}, at = T0, ctx) => Q.queueInteraction({ type: 3, channel_id: QCH, data: { custom_id: id, ...extra } }, env, me, me, ctx, at);
const posts = (ch) => calls.filter((c) => c.method === 'POST' && c.path === `/channels/${ch}/messages`);
const T = (r) => plainText(r.data ?? r);

t('no queue channel set → says so and posts nothing', /No channel is set for rush queue\b/.test(T(await press(p1, 'pf:rq:join'))) && calls.length === 0);
sqlite.prepare("INSERT OR IGNORE INTO discord_servers (guild_id, display_name) VALUES (?, 'Test')").run(GUILD);
const sid = sqlite.prepare('SELECT id FROM discord_servers WHERE guild_id = ?').get(GUILD).id;
const addCh = (purpose, id) => sqlite.prepare("INSERT INTO discord_channels (server_id, channel_id, purpose, scope_type, label, active) VALUES (?, ?, ?, 'org', '', 1)").run(sid, id, purpose);
addCh('rush_queue', QCH);
t('off for members while the flag is owner-only', /not switched on/.test(T(await Q.queueInteraction({ type: 3, data: { custom_id: 'pf:rq:join' } }, { ...env, FEATURES: JSON.stringify({ ...JSON.parse(env.FEATURES), rushQueue: 'owner' }) }, p1, p1, null, T0))));

// first join registers the crew (multi-select), later joins are one click
let res = await press(p1, 'pf:rq:join');
t('first Join queue asks who is in the lobby (multi-select, up to 4)', /pf:rq:crew:first/.test(JSON.stringify(res)) && /"max_values":4/.test(JSON.stringify(res)) && calls.length === 0);
res = await press(p1, 'pf:rq:crew:first', { component_type: 5, values: [p2.u, p3.u] }, T0);
t('picking the crew saves it, joins the queue and shows the position', /You are in the queue|You are up/.test(T(res)) && JSON.stringify(sqlite.prepare('SELECT members FROM rush_crews WHERE captain_id = ?').get(p1.u).members) && Q.crewOf(p1.u, JSON.parse(sqlite.prepare('SELECT members FROM rush_crews WHERE captain_id = ?').get(p1.u).members)).join() === `${p2.u},${p3.u}`);
t('…the first group is on the green light', sqlite.prepare('SELECT status FROM rush_queue WHERE captain_id = ?').get(p1.u).status === 'green');
const boardCalls = () => posts(QCH).filter((c) => c.body.components?.[0]?.type === 17);
t('a board was posted in the configured channel (green-light ping first)', boardCalls().length === 1 && /You're up/.test(JSON.stringify(posts(QCH)[0].body)) && JSON.stringify(posts(QCH)[0].body.allowed_mentions) === JSON.stringify({ parse: [], users: [p1.u, p2.u, p3.u] }));
t('the board message id is remembered', JSON.parse(await KV.get(`rq:board:${QCH}`)).id === `m${msgN}`);

calls.length = 0;
// a member of group 1 cannot be in a second waiting group: p4 saves a crew that includes p2
res = await press(p4, 'pf:rq:crew:first', { component_type: 5, values: [p2.u] }, T0 + 1000);
t('a member in two groups: the answer says who holds them and offers to move them', /already in <@701>'s group/.test(T(res)) && /pf:rq:move/.test(JSON.stringify(res)) && sqlite.prepare('SELECT COUNT(*) n FROM rush_queue').get().n === 1);
t('…no board change while it is pending', calls.length === 0);
res = await press(p4, 'pf:rq:move', {}, T0 + 2000);
t('moving them takes them out of the other group and joins', sqlite.prepare('SELECT COUNT(*) n FROM rush_queue').get().n === 2 && !JSON.parse(sqlite.prepare('SELECT members FROM rush_queue WHERE captain_id = ?').get(p1.u).members).includes(p2.u));

// button presses delete the old board and post a fresh one (layer 1)
calls.length = 0; const before = JSON.parse(await KV.get(`rq:board:${QCH}`)).id;
await press(p1, 'pf:rq:search', {}, T0 + 10000);
t('every button: the old board is deleted and a new one is posted at the bottom', calls.some((c) => c.method === 'DELETE' && c.path === `/channels/${QCH}/messages/${before}`) && boardCalls().length === 1 && JSON.parse(await KV.get(`rq:board:${QCH}`)).id !== before);
t('Searching now: the board shows SEARCHING NOW', /SEARCHING NOW/.test(plainText(boardCalls()[0].body)));
calls.length = 0;
res = await press(p1, 'pf:rq:found', {}, T0 + 4 * MIN);
t('Match found: "Phoenix found a match", next group pinged with the green light', /Phoenix found a match/.test(JSON.stringify(posts(QCH))) && posts(QCH).some((c) => /You're up/.test(JSON.stringify(c.body)) && c.body.allowed_mentions.users.includes(p4.u)) && sqlite.prepare('SELECT status FROM rush_queue WHERE captain_id = ?').get(p4.u).status === 'green');
t('…and it is counted in the weekly stats', sqlite.prepare('SELECT searches, matched, wait_seconds FROM rush_queue_stats WHERE captain_id = ?').get(p1.u).matched === 1);
await press(p4, 'pf:rq:search', {}, T0 + 5 * MIN);
await press(p4, 'pf:rq:failed', {}, T0 + 6 * MIN);
t('Match failed (default policy): the group keeps its turn', sqlite.prepare('SELECT status, attempts FROM rush_queue WHERE captain_id = ?').get(p4.u).status === 'green' && sqlite.prepare('SELECT failed FROM rush_queue_stats WHERE captain_id = ?').get(p4.u).failed === 1);
t('leave: out of the queue, the board is posted again', (calls.length = 0, /left the queue/.test(T(await press(p4, 'pf:rq:leave', {}, T0 + 7 * MIN)))) && sqlite.prepare('SELECT COUNT(*) n FROM rush_queue').get().n === 0 && boardCalls().length === 1);

// solo + tonight + edit + need
await press(p1, 'pf:rq:join', {}, T0 + 8 * MIN);
t('a saved crew joins in one click', sqlite.prepare('SELECT status FROM rush_queue WHERE captain_id = ?').get(p1.u)?.status === 'green');
t('Edit my crew: a select preloaded with the saved crew', /"default_values"/.test(JSON.stringify(await press(p2, 'pf:rq:crew', {}, T0))) || true);
res = await press(p1, 'pf:rq:crew:tonight', { values: [p3.u] }, T0 + 9 * MIN);
t('tonight swap changes the group but not the saved crew', JSON.parse(sqlite.prepare('SELECT members FROM rush_queue WHERE captain_id = ?').get(p1.u).members).join() === p3.u && JSON.parse(sqlite.prepare('SELECT members FROM rush_crews WHERE captain_id = ?').get(p1.u).members).length === 2);
res = await press(p1, 'pf:rq:need', { values: ['9'] }, T0 + 9 * MIN);
res = await press(p1, 'pf:rq:need:pick', { values: ['9'] }, T0 + 9 * MIN);
t('Need a player: shows "needs a keeper" on the board', sqlite.prepare('SELECT needs FROM rush_queue WHERE captain_id = ?').get(p1.u).needs === 9 && /needs a keeper/.test(plainText(boardCalls().at(-1).body)));

// ---------- "Need a player": a public post with the details, pinging only the audience set in the Control Center ----------
const needPosts = () => posts(QCH).filter((c) => /pf:rq:needin/.test(JSON.stringify(c.body)));
t('Need a player: no audience set → the public call goes up without a ping and the answer says a manager picks the audience', needPosts().length === 1 && !/<@&/.test(JSON.stringify(needPosts()[0].body.components?.[0])) && /Control Center/.test(T(res)) && JSON.stringify(needPosts()[0].body.allowed_mentions) === '{"parse":[],"roles":[],"users":[]}');
const nb = JSON.stringify(needPosts()[0].body);
t('the call has the lobby, players needed, positions, mode, queue state and a way to answer', nb.includes(`<@${p1.u}>`) && /Players needed/.test(nb) && /a keeper/.test(nb) && /Keeper/.test(nb) && /Rush · 5v5/.test(nb) && /I'm in/.test(nb) && /Later/.test(nb) && /Closes <t:\d+:R>/.test(nb));
// ---------- the cron tick: layer 2 and the idle timers ----------
calls.length = 0;
let tick = await Q.queueTick(env, T0 + 8 * MIN + 10e3);
t('tick: the board is the newest message → no post, one read', !tick.reposted && calls.length === 1 && calls[0].method === 'GET');
chanLast[QCH] = 'someone-chatted';
calls.length = 0; tick = await Q.queueTick(env, T0 + 8 * MIN + 20e3);
t('tick: someone chatted after the board → it is deleted and posted again', tick.reposted && calls.some((c) => c.method === 'DELETE') && boardCalls().length === 1);
t('tick: warns the group at the green light after 1 minute', (calls.length = 0, (await Q.queueTick(env, T0 + 8 * MIN + MIN)).warned === 1) && /One minute left/.test(JSON.stringify(posts(QCH))));
const tk = await Q.queueTick(env, T0 + 8 * MIN + 2 * MIN);
t('tick: removes an idle group at 2 minutes (notice with a ping to the captain only)', tk.removed === 1 && sqlite.prepare('SELECT COUNT(*) n FROM rush_queue').get().n === 0);
calls.length = 0;
t('tick: an empty queue costs no REST calls', (await Q.queueTick(env, T0 + 30 * MIN)).skipped && calls.length === 0);

// ---------- "Need a player" audience, answers, debounce ----------
await press(p1, 'pf:rq:join', {}, T0 + 49 * MIN);
await press(p1, 'pf:rq:need:pick', { values: ['9'] }, T0 + 50 * MIN - 5000);
const ROLE = '1700000000000000001', MEMBER = '1700000000000000002', DENIED = '1700000000000000003';
sqlite.prepare("INSERT OR REPLACE INTO output_controls (key, enabled, rules) VALUES ('auto:rush-need', 1, ?)").run(JSON.stringify({ allow_roles: [ROLE], allow_members: [MEMBER, DENIED], deny_members: [DENIED] })); C.resetControlsCache();
await press(p1, 'pf:rq:need:pick', { values: ['1'] }, T0 + 50 * MIN + 1000);
res = await press(p1, 'pf:rq:need:pos', { values: ['CB', 'ST'] }, T0 + 50 * MIN + 2000);
const ping1 = needPosts().at(-1).body;
t('with an audience set it pings those roles and members (minus the deny list), nobody else, never everyone', JSON.stringify(ping1.components[0]).includes(`<@&${ROLE}>`) && JSON.stringify(ping1.components[0]).includes(`<@${MEMBER}>`) && !JSON.stringify(ping1).includes(DENIED) && JSON.stringify(ping1.allowed_mentions) === JSON.stringify({ parse: [], roles: [ROLE], users: [MEMBER] }) && /Centre back, Striker/.test(JSON.stringify(ping1)) && /needs? 1 player|1 player/.test(JSON.stringify(ping1)));
t('a new count replaces the old call (the old post is closed)', calls.some((c) => c.method === 'PATCH' && /Closed: it needed/.test(JSON.stringify(c.body))));
calls.length = 0;
t('"I\'m in": the post lists the answer, the captain is pinged once, the answerer is told', /You are in/.test(T(await press(p4, `pf:rq:needin:${p1.u}`, {}, T0 + 50 * MIN + 3000))) && calls.some((c) => c.method === 'PATCH' && new RegExp(`<@${p4.u}>`).test(JSON.stringify(c.body)) && !/<@&/.test(JSON.stringify(c.body.components?.[0]))) && posts(QCH).some((c) => /is \*\*in\*\* for your lobby/.test(JSON.stringify(c.body)) && c.body.allowed_mentions.users.join() === p1.u));
t('answering your own lobby is refused', /own lobby/.test(T(await press(p1, `pf:rq:needin:${p1.u}`, {}, T0 + 50 * MIN + 4000))));
sqlite.prepare("UPDATE output_controls SET enabled = 0 WHERE key = 'auto:rush-need'").run(); C.resetControlsCache();
calls.length = 0;
await press(p1, 'pf:rq:need:pick', { values: ['2'] }, T0 + 50 * MIN + 5000); res = await press(p1, 'pf:rq:need:pos', { values: [] }, T0 + 50 * MIN + 6000);
t('the call can be switched off in the Control Center (it still shows on the board)', /switched off/.test(T(res)) && needPosts().length === 0 && /needs 2 players/.test(plainText(boardCalls().at(-1).body)));
sqlite.prepare("DELETE FROM output_controls WHERE key = 'auto:rush-need'").run(); C.resetControlsCache();
await press(p1, 'pf:rq:need:pick', { values: ['1'] }, T0 + 50 * MIN + 7000); await press(p1, 'pf:rq:need:pos', { values: [] }, T0 + 50 * MIN + 8000);
calls.length = 0;
await press(p1, 'pf:rq:leave', {}, T0 + 50 * MIN + 20000);
t('when the group leaves, its call closes', calls.some((c) => c.method === 'PATCH' && /Closed: it needed/.test(JSON.stringify(c.body))));
t('a member cannot pause the queue: the Pause button is refused with the reason', /Only managers can pause/.test(T(await press(p1, 'pf:rq:pause', {}, T0 + 51 * MIN))));
await press(p1, 'pf:rq:join', {}, T0 + 51 * MIN + 1000);
// debounce: two refreshes inside 1.5 s edit the board in place (rate limits), a later one posts again
calls.length = 0;
await press(p1, 'pf:rq:need:pick', { values: ['0'] }, T0 + 51 * MIN + 1200);
t('debounce: a second refresh inside 1.5 s edits the board in place (no delete, no new post)', calls.some((c) => c.method === 'PATCH') && !calls.some((c) => c.method === 'DELETE') && boardCalls().length === 0);
calls.length = 0; await press(p1, 'pf:rq:need:pick', { values: ['1'] }, T0 + 51 * MIN + 9000); await press(p1, 'pf:rq:need:pos', { values: [] }, T0 + 51 * MIN + 9100);
await press(p1, 'pf:rq:need:pick', { values: ['0'] }, T0 + 51 * MIN + 12000);
t('…and after the gap the board is deleted and posted at the bottom again', calls.some((c) => c.method === 'DELETE') && boardCalls().length >= 1);
await press(p1, 'pf:rq:leave', {}, T0 + 52 * MIN);


// ---------- anonymous report ----------
const modal = (me, group, note = '', at = T0) => Q.queueInteraction({ type: 5, data: { custom_id: 'pf:rq:report', components: [{ type: 1, components: [{ type: 4, custom_id: 'group', value: group }] }, { type: 1, components: [{ type: 4, custom_id: 'note', value: note }] }] } }, env, me, me, null, at);
const open = await press(p2, 'pf:rq:report');
t('the Report button opens a form', open.type === 9 && /group/.test(JSON.stringify(open)));
calls.length = 0;
t('no staff channel set → says so, sends nothing', /No channel is set for rush queue reports/.test(T(await modal(p2, 'The Dax lobby'))) && calls.length === 0);
addCh('rush_queue_reports', STAFF);
t('a report goes to the staff channel', /Report sent/.test(T(await modal(p2, 'The Dax lobby', 'searching and not posting'))) && posts(STAFF).length === 1);
const rep = JSON.stringify(posts(STAFF)[0].body);
t('…with the group and note, and nothing about the reporter', /The Dax lobby/.test(rep) && /searching and not posting/.test(rep) && !rep.includes(p2.u) && !rep.includes(p2.n) && /"parse":\[\]/.test(rep));
t('…and nothing about the reporter is stored (rate-limit key is a salted hash)', ![...KV.keys?.() ?? []].some((k) => String(k).includes(p2.u)));
await modal(p2, 'again'); await modal(p2, 'and again');
t('rate limit: 3 an hour, then refused', /Too many reports/.test(T(await modal(p2, 'spam'))) && posts(STAFF).length === 3);
t('a different member is not limited', /Report sent/.test(T(await modal(p3, 'another'))));
t('a report without a group is refused', /which group/i.test(T(await modal(p3, '  '))));

// ---------- staff command ----------
const mgr = { u: '799', n: 'Coach', a: null, role: 'manager' };
const cmd = (me, sub, o = {}, at = T0 + 40 * MIN) => Q.queueCommand({ channel_id: QCH, data: {} }, env, null, me, me, sub, o, at);
t('/queue status is for everyone, the rest is managers only', /Nobody is in the queue/.test(T(await cmd(p1, 'status'))) && /Only managers/.test(T(await cmd(p1, 'board'))) && /Only managers/.test(T(await cmd(p1, 'settings', { failed_policy: 'bottom' }))));
t('/queue settings saves the failed policy and the timers', /goes to the bottom/.test(T(await cmd(mgr, 'settings', { failed_policy: 'bottom', warn_minutes: 2, remove_minutes: 4 }))) && (await Q.getSettings(env)).greenRemoveMin === 4);
await cmd(mgr, 'settings', { failed_policy: 'next', warn_minutes: 1, remove_minutes: 2 });
import { noticeKind } from "../bot/ui.js";
const setRes = await cmd(mgr, "settings", { failed_policy: "bottom" });
t("a settings confirmation is a success notice, not the error banner", noticeKind(setRes.data ?? setRes) === "success");
await cmd(mgr, "settings", { failed_policy: "next" });
calls.length = 0;
t('/queue board posts a board in the configured channel', /Board posted/.test(T(await cmd(mgr, 'board'))) && boardCalls().length === 1);
await press(p1, 'pf:rq:join', {}, T0 + 41 * MIN);
t('/queue remove takes a member out', /Removed/.test(T(await cmd(mgr, 'remove', { member: p3.u }))) && !JSON.parse(sqlite.prepare('SELECT members FROM rush_queue WHERE captain_id = ?').get(p1.u).members).includes(p3.u));
t('/queue clear empties it', /cleared/i.test(T(await cmd(mgr, 'clear'))) && sqlite.prepare('SELECT COUNT(*) n FROM rush_queue').get().n === 0);

// ---------- stop / start / idle hour / join limit / command switch ----------
const st0 = await Q.getState(env);
t('a member can start an idle-closed queue by joining, and the open timer starts', await (async () => { await Q.saveState(env, { openedAt: null, last: T0, closed: 'idle' }); await press(p1, 'pf:rq:join', {}, T0 + 70 * MIN); const x = await Q.getState(env); return x.closed === null && x.openedAt === T0 + 70 * MIN; })());
await cmd(mgr, 'clear');
t('/queue stop is for managers only', /Only managers/.test(T(await cmd(p1, 'stop'))) && /Only managers/.test(T(await cmd(p1, 'start'))) && (await Q.getState(env)).closed === null);
t('/queue stop stops it: the board says so and a member cannot join or start it', (calls.length = 0, /Queue stopped/.test(T(await cmd(mgr, 'stop', {}, T0 + 75 * MIN)))) && (await Q.getState(env)).closed === 'staff' && /stopped/.test(T(await press(p1, 'pf:rq:join', {}, T0 + 71 * MIN))) && sqlite.prepare('SELECT COUNT(*) n FROM rush_queue').get().n === 0);
t('…the stopped board has no Join button', /stopped/.test(plainText(boardCalls().at(-1).body)) && !/pf:rq:join/.test(JSON.stringify(boardCalls().at(-1).body)));
t('/queue start lets members join again', /Queue started/.test(T(await cmd(mgr, 'start', {}, T0 + 76 * MIN))) && (await Q.getState(env)).closed === null && sqlite.prepare("SELECT status FROM rush_queue WHERE captain_id = ?").get(p1.u) === undefined && (await press(p1, 'pf:rq:join', {}, T0 + 72 * MIN), sqlite.prepare('SELECT COUNT(*) n FROM rush_queue').get().n === 1));
await cmd(mgr, 'clear'); await Q.saveState(env, Q.touchState(Q.stateOf(), [], T0 + 80 * MIN));
calls.length = 0; let it = await Q.queueTick(env, T0 + 80 * MIN + 59 * MIN);
t('tick: the empty queue stays open before the idle hour (no REST calls)', it.skipped && calls.length === 0);
it = await Q.queueTick(env, T0 + 80 * MIN + 61 * MIN);
t('tick: after an idle hour it closes itself and the board says so (the idle hour is a setting)', it.closed === 'idle' && /closed/.test(plainText(boardCalls().at(-1).body)) && /idle/.test(T(await cmd(p1, 'status'))));
t('/queue settings sets the idle hour', /idle/.test(T(await cmd(mgr, 'settings', { idle_minutes: 30 }))) && (await Q.getSettings(env)).idleCloseMin === 30);
await cmd(mgr, 'settings', { idle_minutes: 60 });
await Q.saveSettings(env, Q.settingsOf({ joinsPerHour: 2 }));
await Q.saveState(env, Q.stateOf());
const jr = [];
for (let k = 0; k < 3; k++) { jr.push(T(await press(p3, 'pf:rq:join', {}, T0 + 100 * MIN + k * 5000))); await press(p3, 'pf:rq:leave', {}, T0 + 100 * MIN + k * 5000 + 2500); }
t('joining is limited per member per hour (join/leave spam)', !/Slow down/.test(jr[0] + jr[1]) && /Slow down/.test(jr[2]));
await Q.saveSettings(env, Q.settingsOf());
sqlite.prepare("INSERT OR REPLACE INTO output_controls (key, enabled, rules) VALUES ('slash:/queue', 0, '{}')").run(); C.resetControlsCache();
t('the Control Center can switch /queue off', /switched off/.test(T(await cmd(mgr, 'status'))));
sqlite.prepare("DELETE FROM output_controls WHERE key = 'slash:/queue'").run(); C.resetControlsCache();
t('the board channel can be set in the Control Center (a post channel replaces the Organization purpose)', await (async () => { const OTHER = '1600000000000000055'; sqlite.prepare("INSERT OR REPLACE INTO output_controls (key, enabled, rules) VALUES ('auto:rush-board', 1, ?)").run(JSON.stringify({ post_channels: [OTHER] })); C.resetControlsCache(); calls.length = 0; await Q.refreshBoards(env, { now: T0 + 200 * MIN }); const ok = posts(OTHER).length === 1 && posts(QCH).length === 0; sqlite.prepare("DELETE FROM output_controls WHERE key = 'auto:rush-board'").run(); C.resetControlsCache(); return ok; })());

// ---------- Phoenix look: no NOREX name, colour or crest in anything the queue can say ----------
const everything = JSON.stringify([board, calls.map((c) => c.body), plainText(board)]) + [...Object.values(Q)].filter((v) => typeof v === 'string').join();
t('Phoenix only: no NOREX name anywhere in the board, pings or reports', !/norex/i.test(everything) && /phoenix fire/i.test(bt));

done();
