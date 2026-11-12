// Draft: every Rush queue button and /queue subcommand, drawn the way Discord shows it (private reply + any public post).
// This draft drives the REAL handlers (bot/rushqueue.js) against the test mocks, so it cannot drift from the code:
//   node tools/bot-studio/studio.mjs render tools/bot-studio/drafts/rush-queue-responses.mjs
// Example names only: ids 111-666 are the gallery's example players (Zub, Mike, Jez, Kruger, Rio, Tay); role 90001 is shown as @Rush.
// Needs a built site (node tests/run.mjs builds it) because the mocks read site/api.
import { env, sqlite, KV } from '../../../tests/mock.mjs';
import { plainText } from '../../../bot/ui.js';
import * as Q from '../../../bot/rushqueue.js';
import { resetControlsCache } from '../../../bot/controls.js';

export const meta = { name: 'rush-queue-responses', summary: 'Every Rush queue button and /queue subcommand: the private reply and the public post it triggers.', app: 'rush', trigger: 'pressing a board button or running /queue', destination: 'rush_queue' };

const MIN = 60e3, T0 = Date.now() - 20 * MIN;
const QCH = '1600000000000000001', STAFF = '1600000000000000002', GUILD = '1600000000000000009', ROLE = '90001', RIO = '555';
env.DISCORD_BOT_TOKEN = 'x';
env.FEATURES = JSON.stringify({ ...JSON.parse(env.FEATURES), rushQueue: 'members', rushLfg: 'owner' });
const out = []; let n = 0; const last = {};
const realFetch = globalThis.fetch;
const what = (b) => { const j = JSON.stringify(b); return /pf:rq:needin/.test(j) ? 'the public call' : /pf:rq:join|pf:rq:report/.test(j) && /Rush queue/.test(j) ? 'the board' : /You're up/.test(j) ? 'green-light ping' : /One minute left/.test(j) ? 'one-minute ping' : /removed from the Rush queue/.test(j) ? 'removed ping' : /found a match/.test(j) ? 'the match post' : /Anonymous report/.test(j) ? 'staff post' : /is \*\*in\*\*/.test(j) ? 'captain ping' : 'post'; };
const tidy = (b) => JSON.parse(JSON.stringify(b).replaceAll(`<@&${ROLE}>`, '<@&R1>'));
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (!url.startsWith('https://discord.com/api/v10')) return realFetch(url, init);
  const path = url.slice('https://discord.com/api/v10'.length), method = init.method ?? 'GET', body = init.body ? JSON.parse(init.body) : undefined;
  if (method === 'POST' && /\/messages$/.test(path)) { const id = `m${++n}`; last[path.split('/')[2]] = id; (globalThis.__label && out.push({ label: `${globalThis.__label(body)} → ${what(body)}`, kind: 'channel', dest: path.split('/')[2] === STAFF ? '#rush-queue-reports' : '#rush-queue', body: tidy(body) })); return Response.json({ id }); }
  if (method === 'DELETE') return new Response(null, { status: 204 });
  if (method === 'PATCH') return Response.json({ id: path.split('/').pop() });
  if (method === 'GET') return Response.json({ id: path.split('/')[2], last_message_id: last[path.split('/')[2]] ?? null });
  return Response.json({}, { status: 404 });
};
sqlite.prepare("INSERT OR IGNORE INTO discord_servers (guild_id, display_name) VALUES (?, 'Phoenix Fire')").run(GUILD);
const sid = sqlite.prepare('SELECT id FROM discord_servers WHERE guild_id = ?').get(GUILD).id;
for (const [purpose, ch] of [['rush_queue', QCH], ['rush_queue_reports', STAFF]]) sqlite.prepare("INSERT INTO discord_channels (server_id, channel_id, purpose, scope_type, label, active) VALUES (?, ?, ?, 'org', '', 1)").run(sid, ch, purpose);
sqlite.prepare("INSERT OR REPLACE INTO output_controls (key, enabled, rules) VALUES ('auto:rush-need', 1, ?)").run(JSON.stringify({ allow_roles: [ROLE], allow_members: [RIO] })); resetControlsCache();

const U = (id, name) => ({ u: id, n: name, a: null, role: 'member' });
const [zub, mike, jez, kruger, rio, tay] = [U('111', 'Zub'), U('222', 'Mike'), U('333', 'Jez'), U('444', 'Kruger'), U('555', 'Rio'), U('666', 'Tay')];
const staff = { u: '799', n: 'Coach', a: null, role: 'manager' };
let at = T0;
const tick = (ms = 4000) => (at += ms);
const press = (me, id, extra = {}) => Q.queueInteraction({ type: 3, channel_id: QCH, data: { custom_id: id, ...extra } }, env, me, me, null, tick());
const cmd = (me, sub, o = {}) => Q.queueCommand({ channel_id: QCH, data: {} }, env, null, me, me, sub, o, tick());
const priv = (label, r) => out.push({ label, kind: r?.type === 9 ? 'modal' : 'private', dest: 'only you', body: tidy(r?.data ?? r) });
const label = (name) => { globalThis.__label = () => name; };
const flow = async (name, fn) => { label(name); const r = await fn(); globalThis.__label = null; return r; };
const board = (name) => out.push({ label: name, kind: 'channel', dest: '#rush-queue', body: tidy(Q.boardMessage(Q.__peek ? [] : [], {})) });
const liveBoard = async (name) => { const q = await Q.loadQueue(env); out.push({ label: name, kind: 'channel', dest: '#rush-queue', body: tidy(Q.boardMessage(q, { now: at, org: 'Phoenix Fire', state: await Q.getState(env), st: await Q.getSettings(env) })) }); };

// ---- Join queue ----
priv('Join queue, first time: who is in your lobby? (private)', await press(zub, 'pf:rq:join'));
priv('…picks the crew: joined, first in line (private)', await flow('Join queue: the green light ping, then the board', () => press(zub, 'pf:rq:crew:first', { values: [mike.u, jez.u] })));
priv('Join queue again with a saved crew (private, a second group)', await flow('Second group joins: the board again', () => press(kruger, 'pf:rq:crew:first', { values: [rio.u] })));
priv('Join queue when already in the queue (private)', await press(zub, 'pf:rq:join'));
priv('Join queue when a member is in another group (private, with the move button)', await press(tay, 'pf:rq:crew:first', { values: [mike.u] }));
priv('Edit my crew (private)', await press(zub, 'pf:rq:crew'));
priv('Edit my crew, saved (private)', await press(zub, 'pf:rq:crew:edit', { values: [mike.u, jez.u, tay.u] }));
// ---- Leave / Searching / Found / Failed ----
priv('Searching now before the green light (private)', await press(kruger, 'pf:rq:search'));
priv('Searching now (private)', await flow('Searching now: the board shows SEARCHING NOW with both timers', () => press(zub, 'pf:rq:search')));
priv('Match failed, default policy: back at the green light (private)', await flow('Match failed: the group keeps its turn', () => press(zub, 'pf:rq:failed')));
await press(zub, 'pf:rq:search');
priv('Match found (private)', await flow('Match found: "Phoenix found a match", then the next group is pinged with the green light', () => press(zub, 'pf:rq:found')));
priv('Match found when not searching (private)', await press(zub, 'pf:rq:found'));
// ---- Need a player ----
priv('Need a player: how many? (private)', await press(kruger, 'pf:rq:need'));
priv('Need a player: which positions? (private)', await press(kruger, 'pf:rq:need:pick', { values: ['1'] }));
priv('Need a player: posted, the audience is pinged (private)', await flow('Need a player (pings the Control Center audience: a role and members, never everyone)', () => press(kruger, 'pf:rq:need:pos', { values: ['CB', 'ST'] })));
priv('Need a keeper: posted directly with the keeper position (private)', await flow('Need a keeper: the public call', async () => { await press(kruger, 'pf:rq:need:pick', { values: ['9'] }); return press(kruger, 'pf:rq:need:pick', { values: ['9'] }); }));
priv('"I\'m in" on the call (private, the answerer)', await flow('"I\'m in": the captain is told in the channel (the call post is edited to list the answer)', () => press(tay, `pf:rq:needin:${kruger.u}`)));
priv('"Later" on the call (private)', await press(zub, `pf:rq:needlater:${kruger.u}`));
priv('Answering your own lobby (private)', await press(kruger, `pf:rq:needin:${kruger.u}`));
// ---- Pause, Report ----
priv('Pause (private, the button is gone from the board; an old board gets this answer)', await press(kruger, 'pf:rq:pause'));
priv('Report: the form (opens a pop-up)', await press(mike, 'pf:rq:report'));
const modal = (me, group, note) => Q.queueInteraction({ type: 5, data: { custom_id: 'pf:rq:report', components: [{ type: 1, components: [{ type: 4, custom_id: 'group', value: group }] }, { type: 1, components: [{ type: 4, custom_id: 'note', value: note }] }] } }, env, me, me, null, tick());
priv('Report, sent (private)', await flow('Report: the anonymous staff post (no reporter)', () => modal(mike, 'The Dax lobby', 'searching and not posting')));
// ---- Leave ----
priv('Leave (private)', await flow('Leave: the board again, the next group goes', () => press(kruger, 'pf:rq:leave')));
// ---- /queue ----
priv('/queue status (everyone)', await cmd(zub, 'status'));
priv('/queue board (managers)', await cmd(staff, 'board'));
priv('/queue remove (managers)', await cmd(staff, 'remove', { member: mike.u }));
priv('/queue settings (managers)', await cmd(staff, 'settings', { idle_minutes: 60 }));
priv('/queue clear (managers)', await flow('/queue clear: a fresh board', () => cmd(staff, 'clear')));
priv('/queue stop (managers)', await flow('/queue stop: the stopped board (no Join button)', () => cmd(staff, 'stop')));
priv('Join queue while stopped (private, a member cannot start it)', await press(zub, 'pf:rq:join'));
priv('/queue start (managers)', await flow('/queue start: the board is open again', () => cmd(staff, 'start')));
priv('A member tries /queue stop (private)', await cmd(zub, 'stop'));
priv('A member tries /queue clear (private)', await cmd(zub, 'clear'));
await Q.saveState(env, { openedAt: null, last: at - 61 * MIN, closed: 'idle' });
await liveBoard('Board after an idle hour (any member can start it with Join queue)');
// ---- the timed pings the cron sends ----
await press(zub, 'pf:rq:join'); await press(kruger, 'pf:rq:crew:first', { values: [rio.u] });
label('The tick: one minute at the green light'); await Q.queueTick(env, at + 61e3); label('The tick: removed after 2 minutes (a ping to the captain only), the next group lit'); await Q.queueTick(env, at + 121e3); globalThis.__label = null;
await liveBoard('Board with one group at the green light and one waiting (the live timers)');

export default out;
