// PF-027 – LFG and queue tools: pass or give up the captain role (queue and /lfg), Take down, +1 hour, the "still here?" DM, calls that stay the newest
// message, Alert me, and Make a lobby as DM requests (nobody is added unless they accept).
import { env, sqlite } from './mock.mjs';
import { t, done } from './lib.mjs';
import * as Q from '../bot/rushqueue.js';
import { lfgCommand, lfgButton, lfgTick, lfgMessage, LFG_ID } from '../bot/lfg.js';
import { createOffers, availablePlayers } from '../bot/rushmatch.js';
import { plainText } from '../bot/ui.js';
import fs from 'node:fs';

const MIN = 60e3, T0 = Date.parse('2026-11-20T20:00:00Z');
env.DISCORD_BOT_TOKEN = 'bot-token';
env.FEATURES = JSON.stringify({ ...JSON.parse(env.FEATURES), rushQueue: 'members', rushLfg: 'members' });
for (const [id, n] of [['701', 'Ann'], ['702', 'Bo'], ['703', 'Cy'], ['704', 'Di'], ['705', 'Ed']]) sqlite.prepare('INSERT OR IGNORE INTO users (id, name, avatar, first_at, last_at) VALUES (?, ?, null, ?, ?)').run(id, n, T0, T0);
const M = (id, n) => ({ u: id, n, a: null, role: 'member' });
const [ann, bo, cy, di, ed] = [M('701', 'Ann'), M('702', 'Bo'), M('703', 'Cy'), M('704', 'Di'), M('705', 'Ed')];
const T = (r) => plainText(r.data ?? r);

// ---------- fake Discord REST ----------
const calls = []; let msgN = 1000000000000000000n, latest = {};
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (!url.startsWith('https://discord.com/api/v10')) return realFetch(url, init);
  const path = url.slice('https://discord.com/api/v10'.length), method = init.method ?? 'GET', body = init.body ? JSON.parse(init.body) : undefined;
  calls.push({ method, path, body });
  if (method === 'POST' && path === '/users/@me/channels') return Response.json({ id: `dm${body.recipient_id}` });
  if (method === 'POST' && /^\/channels\/[\w]+\/messages$/.test(path)) { const id = String(++msgN); latest[path.split('/')[2]] = id; return Response.json({ id }); }
  if (method === 'DELETE') return new Response(null, { status: 204 });
  if (method === 'PATCH') return Response.json({ id: path.split('/').pop() });
  if (method === 'GET' && /^\/channels\/\d+$/.test(path)) return Response.json({ id: path.split('/')[2], last_message_id: latest[path.split('/')[2]] ?? null });
  return Response.json({ message: 'unexpected ' + path }, { status: 404 });
};
const dms = () => calls.filter((c) => c.method === 'POST' && /^\/channels\/dm/.test(c.path));
const CH = '700200';

// ---------- pass the captain role: pure ----------
const base = Q.join(Q.join([], { captain: '701', members: ['702', '703'] }, T0).queue, { captain: '710', members: [] }, T0 + 1).queue;
const pc = Q.passCaptain(base, '701', '702');
const ent = pc.queue.find((e) => e.captain === '702');
t('passCaptain: the chosen member becomes captain, the old captain stays in the crew', !!ent && ent.members.includes('701') && ent.members.includes('703') && !ent.members.includes('702') && !pc.queue.some((e) => e.captain === '701'));
t('passCaptain: place in line, status and timers are untouched', ent.ord === base.find((e) => e.captain === '701').ord && ent.joined_at === T0 && ent.status === base.find((e) => e.captain === '701').status);
t('passCaptain: only a captain can pass, only to someone in the crew, never from a solo group', Q.passCaptain(base, '702', '703').error === 'absent' && Q.passCaptain(base, '701', '999').error === 'not-member' && Q.passCaptain(base, '710', '701').error === 'solo');

// ---------- pass the captain role: /queue captain and /lfg captain ----------
await Q.saveQueue(env, [], base);
await Q.saveCrew(env, '701', ['702', '703'], T0);
let r = await Q.queueCommand({}, env, null, ann, ann, 'captain', { member: '702' }, T0 + 5 * MIN);
const row = sqlite.prepare("SELECT * FROM rush_queue WHERE captain_id = '702'").get();
t('/queue captain: the crew is re-keyed to the new captain and the old row is gone', /Captain passed/.test(T(r)) && !!row && !sqlite.prepare("SELECT 1 FROM rush_queue WHERE captain_id = '701'").get() && JSON.parse(row.members).sort().join() === '701,703');
t('the new captain gets a saved crew so Join queue works for them', JSON.parse(sqlite.prepare("SELECT members FROM rush_crews WHERE captain_id = '702'").get().members).sort().join() === '701,703');
t('a member who is not a captain is told so', /not a captain/.test(T(await Q.queueCommand({}, env, null, cy, cy, 'captain', { member: '701' }, T0))));
t('a captain cannot pass it to someone outside the crew', /not in your crew/.test(T(await Q.queueCommand({}, env, null, bo, bo, 'captain', { member: '705' }, T0))));
t('a solo group cannot pass it (Leave instead)', /Nobody to pass it to/.test(T(await Q.queueCommand({}, env, null, M('710', 'Solo'), M('710', 'Solo'), 'captain', {}, T0))));
r = await lfgCommand({ channel_id: CH, data: {} }, env, bo, bo, 'captain', {}, T0 + 6 * MIN); // give up with no name: the first in the crew
t('/lfg captain with no name gives it to the first person in the crew', /Captain passed/.test(T(r)) && !!sqlite.prepare("SELECT 1 FROM rush_queue WHERE captain_id = '703'").get() && !sqlite.prepare("SELECT 1 FROM rush_queue WHERE captain_id = '702'").get());
const board = JSON.stringify(Q.boardMessage(await Q.loadQueue(env), { now: T0 }));
t('the board has a Pass captain button (member picker, no pings)', /pf:rq:pass"/.test(board) && Q.RQ_ID.test('pf:rq:pass') && Q.RQ_ID.test('pf:rq:pass:pick'));
t('passing moves an open Need a player call: the old one closes, offers expire', await (async () => {
  sqlite.exec("DELETE FROM rush_queue; DELETE FROM rush_needs;");
  const q0 = Q.join([], { captain: '701', members: ['702'] }, T0).queue; await Q.saveQueue(env, [], q0);
  sqlite.prepare("INSERT INTO rush_needs (captain_id, positions, count, status, created_at, expires) VALUES ('701', '[]', 1, 'open', ?, ?)").run(T0, T0 + 60 * MIN);
  sqlite.prepare("INSERT INTO rush_need_offers (need_id, user_id, position, kind, created_at, status) VALUES ((SELECT id FROM rush_needs WHERE captain_id = '701'), '703', 'ST', 'exact', ?, 'open')").run(T0);
  await Q.passCaptainTo(env, null, await Q.loadQueue(env), '701', '702', T0 + MIN);
  return !sqlite.prepare("SELECT 1 FROM rush_needs WHERE captain_id = '701' AND status = 'open'").get() && sqlite.prepare("SELECT status FROM rush_need_offers WHERE user_id = '703'").get().status === 'expired';
})());
sqlite.exec("DELETE FROM rush_queue; DELETE FROM rush_needs; DELETE FROM rush_need_offers;");

// ---------- the LFG post: sent by the app, five buttons ----------
const i = { channel_id: CH, data: {} };
calls.length = 0;
r = await lfgCommand(i, env, ann, ann, 'now', { note: 'keeper please' }, T0);
const post = sqlite.prepare('SELECT * FROM rush_lfg ORDER BY id DESC').get();
t('/lfg now: the Rush app posts it in the channel, only you see the confirmation', calls.some((c) => c.method === 'POST' && c.path === `/channels/${CH}/messages`) && /posted/i.test(T(r)) && (r.data.flags & 64) !== 0 && !!post.msg_id);
t('the default call is 30 minutes', post.expires - post.at === 30 * MIN);
const ids = JSON.stringify(lfgMessage(post, [], { now: T0 })).match(/"custom_id":"[^"]+"/g).map((x) => x.slice(13, -1));
t('the post has I\u2019m in, Make a lobby, +1 hour, Take down and Alert me, all matching LFG_ID', ['in', 'lobby', 'plus', 'down'].every((a) => ids.includes(`pf:lfg:${post.id}:${a}`)) && ids.includes('pf:lfg:alert') && ids.every((x) => LFG_ID.test(x)) && ids.length === 5);
t('the I\u2019m in refresh never pings', !/<@&/.test(JSON.stringify(lfgMessage(post, [], { roleId: '', now: T0 }))));

// ---------- Take down and +1 hour: the poster only ----------
const press = (me, id, at = T0 + MIN) => lfgButton({ data: { custom_id: id } }, env, me, me, at, null);
t('someone else cannot take down or extend your call', /Only the poster/.test(T(await press(bo, `pf:lfg:${post.id}:down`))) && /Only the poster/.test(T(await press(bo, `pf:lfg:${post.id}:plus`))));
r = await press(ann, `pf:lfg:${post.id}:plus`);
t('+1 hour adds an hour on the post itself', r.type === 7 && sqlite.prepare('SELECT expires FROM rush_lfg WHERE id = ?').get(post.id).expires === post.expires + 60 * MIN);
for (let k = 0; k < 8; k++) await press(ann, `pf:lfg:${post.id}:plus`);
t('a call can never run longer than 6 hours in total', sqlite.prepare('SELECT expires FROM rush_lfg WHERE id = ?').get(post.id).expires === post.at + 360 * MIN && /longest a call/.test(T(await press(ann, `pf:lfg:${post.id}:plus`))));
calls.length = 0;
t('Take down: the call is cancelled and its message is edited into the "over" card', /Taken down/.test(T(await press(ann, `pf:lfg:${post.id}:down`))) && sqlite.prepare('SELECT status, msg_id FROM rush_lfg WHERE id = ?').get(post.id).status === 'cancelled' && calls.some((c) => c.method === 'PATCH') && sqlite.prepare('SELECT msg_id FROM rush_lfg WHERE id = ?').get(post.id).msg_id === null);

// ---------- the "still here?" DM, once ----------
sqlite.exec("DELETE FROM rush_lfg; DELETE FROM rush_lfg_answers;");
await lfgCommand(i, env, ann, ann, 'now', { minutes: 15 }, T0);
const p2 = sqlite.prepare('SELECT * FROM rush_lfg ORDER BY id DESC').get();
calls.length = 0;
await lfgTick(env, T0 + 6 * MIN); // 9 minutes left: inside the 10-minute window
const dm1 = dms();
t('shortly before the end the poster gets ONE DM with Keep it up and I\u2019m done', dm1.some((c) => /dm701/.test(c.path) && /:keep/.test(JSON.stringify(c.body)) && /:done/.test(JSON.stringify(c.body))) && sqlite.prepare('SELECT asked FROM rush_lfg WHERE id = ?').get(p2.id).asked === 1);
calls.length = 0; await lfgTick(env, T0 + 7 * MIN);
t('...and only once', dms().length === 0);
r = await press(ann, `pf:lfg:${p2.id}:keep`, T0 + 8 * MIN);
t('Keep it up from the DM adds an hour and asks again later', /Added an hour/.test(T(r)) && sqlite.prepare('SELECT expires, asked FROM rush_lfg WHERE id = ?').get(p2.id).expires === p2.expires + 60 * MIN && sqlite.prepare('SELECT asked FROM rush_lfg WHERE id = ?').get(p2.id).asked === 0);

// ---------- ended calls close their message; open calls stay the newest message ----------
sqlite.exec("DELETE FROM rush_lfg; DELETE FROM rush_lfg_answers;");
await lfgCommand(i, env, ann, ann, 'now', { minutes: 30 }, T0);
const p3 = sqlite.prepare('SELECT * FROM rush_lfg ORDER BY id DESC').get();
calls.length = 0;
await lfgTick(env, T0 + 31 * MIN);
t('when a call ends its message is edited into the "over" card, once', calls.filter((c) => c.method === 'PATCH').length === 1 && sqlite.prepare('SELECT status FROM rush_lfg WHERE id = ?').get(p3.id).status === 'expired' && sqlite.prepare('SELECT msg_id FROM rush_lfg WHERE id = ?').get(p3.id).msg_id === null);
sqlite.exec("DELETE FROM rush_lfg;");
await lfgCommand(i, env, ann, ann, 'now', { minutes: 120 }, T0);
const p4 = sqlite.prepare('SELECT * FROM rush_lfg ORDER BY id DESC').get();
calls.length = 0;
await lfgTick(env, T0 + 5 * MIN);
t('when the post is already the newest message nothing is re-sent', !calls.some((c) => c.method === 'POST') && !calls.some((c) => c.method === 'DELETE'));
latest[CH] = String(msgN + 5n); // someone else posted below it
sqlite.prepare('UPDATE rush_lfg SET posted_at = ? WHERE id = ?').run(T0 + 3.5 * MIN, p4.id);
calls.length = 0; await lfgTick(env, T0 + 4 * MIN);
t('...but not within a minute and a half of the last send (no churn)', !calls.some((c) => c.method === 'POST'));
await lfgTick(env, T0 + 6 * MIN);
const np = calls.filter((c) => c.method === 'POST' && c.path === `/channels/${CH}/messages`), del = calls.filter((c) => c.method === 'DELETE');
t('when someone else posts below it, it is sent again at the bottom and the old one is deleted', np.length === 1 && del.length === 1 && del[0].path.endsWith(`/${p4.msg_id}`) && sqlite.prepare('SELECT msg_id FROM rush_lfg WHERE id = ?').get(p4.id).msg_id !== p4.msg_id);
t('the re-sent post never pings again', !/<@&/.test(JSON.stringify(np[0].body)) && !np[0].body.content);

// ---------- Alert me ----------
sqlite.exec("DELETE FROM rush_lfg; DELETE FROM rush_lfg_alerts;");
t('Alert me turns alerts on, then off again', /Alerts on/.test(T(await press(cy, 'pf:lfg:alert'))) && !!sqlite.prepare("SELECT 1 FROM rush_lfg_alerts WHERE user_id = '703'").get() && /Alerts off/.test(T(await press(cy, 'pf:lfg:alert'))) && !sqlite.prepare("SELECT 1 FROM rush_lfg_alerts WHERE user_id = '703'").get());
await press(cy, 'pf:lfg:alert');
t('a subscriber counts as available for a lobby that needs a player (a DM offer, never an automatic add)', (await availablePlayers(env, T0, [])).some((p) => String(p.user_id) === '703') && (await createOffers(env, { id: 9, captain: '701', positions: [] }, T0)).some((o) => o.user_id === '703'));
sqlite.exec("DELETE FROM rush_lfg_alerts; DELETE FROM rush_need_offers;");

// ---------- Make a lobby: requests, not automatic adds ----------
sqlite.exec("DELETE FROM rush_lfg; DELETE FROM rush_lfg_answers; DELETE FROM rush_queue; DELETE FROM rush_lobby_asks;");
await lfgCommand(i, env, ann, ann, 'now', { minutes: 60 }, T0);
const lp = sqlite.prepare('SELECT * FROM rush_lfg ORDER BY id DESC').get();
await press(bo, `pf:lfg:${lp.id}:in`, T0 + MIN); await press(cy, `pf:lfg:${lp.id}:in`, T0 + MIN);
t('Make a lobby: someone who has not tapped I\u2019m in cannot start one', /Tap I.m in first/.test(T(await press(di, `pf:lfg:${lp.id}:lobby`, T0 + 2 * MIN))));
calls.length = 0;
r = await press(bo, `pf:lfg:${lp.id}:lobby`, T0 + 2 * MIN);
const asks = sqlite.prepare("SELECT * FROM rush_lobby_asks WHERE captain_id = '702' ORDER BY user_id").all();
t('Bo presses it: requests go to Ann and Cy by DM, nobody is added', /2 requests sent/.test(T(r)) && asks.map((a) => a.user_id).join() === '701,703' && dms().length === 2 && (await Q.loadQueue(env)).length === 0);
t('the request DM says Accept / No thanks and nobody joins unless they accept', dms().every((c) => /pf:lfg:ask:y:/.test(JSON.stringify(c.body)) && /pf:lfg:ask:n:/.test(JSON.stringify(c.body)) && /Nobody is added unless you accept/.test(JSON.stringify(c.body))) && LFG_ID.test(`pf:lfg:ask:y:${asks[0].id}`));
t('asking again right away does not send the same request twice', /already sent/i.test(T(await press(bo, `pf:lfg:${lp.id}:lobby`, T0 + 3 * MIN))) && sqlite.prepare("SELECT COUNT(*) AS n FROM rush_lobby_asks WHERE captain_id = '702'").get().n === 2);
t('somebody else cannot answer your request', /not yours/.test(T(await press(di, `pf:lfg:ask:y:${asks[0].id}`, T0 + 4 * MIN))));
r = await press(ann, `pf:lfg:ask:y:${asks[0].id}`, T0 + 4 * MIN);
const lobby = (await Q.loadQueue(env)).find((e) => e.captain === '702');
t('Ann accepts: Bo\u2019s lobby goes on the board with Ann in the crew, her call turns into "in a lobby"', /in the lobby/.test(T(r)) && !!lobby && lobby.members.join() === '701' && sqlite.prepare("SELECT status FROM rush_lfg WHERE user_id = '701'").get().status === 'matched');
r = await press(cy, `pf:lfg:ask:n:${asks[1].id}`, T0 + 5 * MIN);
t('Cy says no thanks: nothing changes, Bo is not told who declined', /Noted/.test(T(r)) && (await Q.loadQueue(env)).find((e) => e.captain === '702').members.join() === '701' && sqlite.prepare("SELECT status FROM rush_lobby_asks WHERE id = ?").get(asks[1].id).status === 'declined');
t('an answered request cannot be answered again', /over/.test(T(await press(cy, `pf:lfg:ask:y:${asks[1].id}`, T0 + 6 * MIN))));
sqlite.prepare("INSERT INTO rush_lobby_asks (captain_id, user_id, lfg_id, created_at) VALUES ('702', '703', ?, ?)").run(lp.id, T0);
t('a request runs out after 15 minutes', /ran out/.test(T(await press(cy, `pf:lfg:ask:y:${sqlite.prepare('SELECT MAX(id) AS id FROM rush_lobby_asks').get().id}`, T0 + 20 * MIN))));
t('a full crew (5) refuses more', await (async () => {
  sqlite.exec("DELETE FROM rush_queue"); const q5 = Q.join([], { captain: '702', members: ['701', '703', '704', '705'] }, T0).queue; await Q.saveQueue(env, [], q5);
  sqlite.prepare("INSERT INTO rush_lobby_asks (captain_id, user_id, lfg_id, created_at) VALUES ('702', '710', ?, ?)").run(lp.id, T0 + 29 * MIN);
  sqlite.prepare('INSERT OR IGNORE INTO users (id, name, avatar, first_at, last_at) VALUES (?, ?, null, ?, ?)').run('710', 'Solo', T0, T0);
  return /full/.test(T(await press(M('710', 'Solo'), `pf:lfg:ask:y:${sqlite.prepare('SELECT MAX(id) AS id FROM rush_lobby_asks').get().id}`, T0 + 30 * MIN)));
})());

// ---------- code rules ----------
const src = fs.readFileSync(new URL('../bot/lfg.js', import.meta.url), 'utf8');
t('no channel, role or user ID is hardcoded and no NOREX name appears in the LFG code', !/\b\d{17,20}\b/.test(src) && !/norex/i.test(src));
t('the LFG tick runs on the 1-minute job (calls close, the DM, the re-send)', /lfgTick/.test(fs.readFileSync(new URL('../bot/worker.js', import.meta.url), 'utf8')));
globalThis.fetch = realFetch;
done();
