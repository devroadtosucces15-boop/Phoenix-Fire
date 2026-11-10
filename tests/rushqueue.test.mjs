// Rush queue manager (bot/rushqueue.js, PLANNING/RUSH-QUEUE.md): strict click order, one-at-a-time green light, failed-goes-next,
// idle timers, one always-latest board, anonymous reports, channels from Organization config, Phoenix look.
import { env, sqlite, KV } from './mock.mjs';
import { t, done } from './lib.mjs';
import { plainText } from '../bot/ui.js';
import * as Q from '../bot/rushqueue.js';

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
t('board: all the buttons, ids match RQ_ID, no pings', ['join', 'leave', 'crew', 'search', 'found', 'failed', 'need', 'pause', 'report'].every((a) => ids.includes(`pf:rq:${a}`)) && ids.every((x) => Q.RQ_ID.test(x)) && JSON.stringify(board.allowed_mentions) === '{"parse":[]}');

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
  if (method === 'GET' && /^\/channels\/\d+$/.test(path)) return Response.json({ id: path.split('/')[2], last_message_id: chanLast[path.split('/')[2]] ?? null });
  return Response.json({ message: 'unexpected ' + path }, { status: 404 });
};
const QCH = '1600000000000000001', STAFF = '1600000000000000002', GUILD = '1600000000000000009';
const U = (n) => ({ u: `70${n}`, n: `Player ${n}`, a: null, role: 'member' });
const [p1, p2, p3, p4] = [1, 2, 3, 4].map(U);
const press = (me, id, extra = {}, at = T0, ctx) => Q.queueInteraction({ type: 3, channel_id: QCH, data: { custom_id: id, ...extra } }, env, me, me, ctx, at);
const posts = (ch) => calls.filter((c) => c.method === 'POST' && c.path === `/channels/${ch}/messages`);
const T = (r) => plainText(r.data ?? r);

t('no queue channel set → says so and posts nothing', /No queue channel is set/.test(T(await press(p1, 'pf:rq:join'))) && calls.length === 0);
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
await press(p1, 'pf:rq:search', {}, T0 + 3000);
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

// ---------- anonymous report ----------
const modal = (me, group, note = '', at = T0) => Q.queueInteraction({ type: 5, data: { custom_id: 'pf:rq:report', components: [{ type: 1, components: [{ type: 4, custom_id: 'group', value: group }] }, { type: 1, components: [{ type: 4, custom_id: 'note', value: note }] }] } }, env, me, me, null, at);
const open = await press(p2, 'pf:rq:report');
t('the Report button opens a form', open.type === 9 && /group/.test(JSON.stringify(open)));
calls.length = 0;
t('no staff channel set → says so, sends nothing', /No staff channel/.test(T(await modal(p2, 'The Dax lobby'))) && calls.length === 0);
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
const cmd = (me, sub, o = {}) => Q.queueCommand({ channel_id: QCH, data: {} }, env, null, me, me, sub, o, T0 + 40 * MIN);
t('/queue status is for everyone, the rest is managers only', /Nobody is in the queue/.test(T(await cmd(p1, 'status'))) && /Only managers/.test(T(await cmd(p1, 'board'))) && /Only managers/.test(T(await cmd(p1, 'settings', { failed_policy: 'bottom' }))));
t('/queue settings saves the failed policy and the timers', /goes to the bottom/.test(T(await cmd(mgr, 'settings', { failed_policy: 'bottom', warn_minutes: 2, remove_minutes: 4 }))) && (await Q.getSettings(env)).greenRemoveMin === 4);
await cmd(mgr, 'settings', { failed_policy: 'next', warn_minutes: 1, remove_minutes: 2 });
calls.length = 0;
t('/queue board posts a board in the configured channel', /Board posted/.test(T(await cmd(mgr, 'board'))) && boardCalls().length === 1);
await press(p1, 'pf:rq:join', {}, T0 + 41 * MIN);
t('/queue remove takes a member out', /Removed/.test(T(await cmd(mgr, 'remove', { member: p3.u }))) && !JSON.parse(sqlite.prepare('SELECT members FROM rush_queue WHERE captain_id = ?').get(p1.u).members).includes(p3.u));
t('/queue clear empties it', /cleared/i.test(T(await cmd(mgr, 'clear'))) && sqlite.prepare('SELECT COUNT(*) n FROM rush_queue').get().n === 0);

// ---------- Phoenix look: no NOREX name, colour or crest in anything the queue can say ----------
const everything = JSON.stringify([board, calls.map((c) => c.body), plainText(board)]) + [...Object.values(Q)].filter((v) => typeof v === 'string').join();
t('Phoenix only: no NOREX name anywhere in the board, pings or reports', !/norex/i.test(everything) && /phoenix fire/i.test(bt));

done();
