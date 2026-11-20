// PF-028 – the live "Available for Rush" board (bot/lfgboard.js): /lfg setup, /lfg now and /lfg cancel only work with a board, I'm in opens a position
// dropdown (one or several), the board lists everyone available, stays the newest message (old copy deleted), Make a lobby asks the people on it, and
// nothing is hardcoded (channel and ping role come from the Organization config).
import { env, sqlite, KV } from './mock.mjs';
import { t, done } from './lib.mjs';
import { lfgCommand, lfgButton, lfgTick, syncAvailability, LFG_ID } from '../bot/lfg.js';
import { boardMessage, positionPicker, refreshLfgBoard, lfgBoardTick, BOARD_KEY } from '../bot/lfgboard.js';
import { plainText } from '../bot/ui.js';
import fs from 'node:fs';

const MIN = 60e3, T0 = Date.parse('2026-11-20T20:00:00Z');
env.DISCORD_BOT_TOKEN = 'bot-token'; env.DISCORD_GUILD_ID = 'g-board';
env.FEATURES = JSON.stringify({ ...JSON.parse(env.FEATURES), rushQueue: 'members', rushLfg: 'members' });
for (const [id, n] of [['901', 'Ann'], ['902', 'Bo'], ['903', 'Cy'], ['904', 'Di']]) sqlite.prepare('INSERT OR IGNORE INTO users (id, name, avatar, first_at, last_at) VALUES (?, ?, null, ?, ?)').run(id, n, T0, T0);
const M = (id, n, role = 'member') => ({ u: id, n, a: null, role });
const [ann, bo, cy, di] = [M('901', 'Ann'), M('902', 'Bo'), M('903', 'Cy'), M('904', 'Di')], boss = M('999', 'Boss', 'owner');
sqlite.exec(`INSERT INTO meta (key, value) VALUES ('server_tools', '{"pingRoles":{"match":"7001","rush":"7002"}}') ON CONFLICT (key) DO UPDATE SET value = excluded.value`);
sqlite.prepare("INSERT OR IGNORE INTO discord_servers (guild_id, display_name) VALUES ('g-board', 'Test')").run();
const T = (r) => plainText(r.data ?? r);

// ---------- fake Discord REST ----------
const calls = []; let msgN = 2000000000000000000n; const latest = {};
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (!url.startsWith('https://discord.com/api/v10')) return realFetch(url, init);
  const path = url.slice('https://discord.com/api/v10'.length), method = init.method ?? 'GET', body = init.body ? JSON.parse(init.body) : undefined;
  calls.push({ method, path, body });
  if (method === 'POST' && path === '/users/@me/channels') return Response.json({ id: `dm${body.recipient_id}` });
  if (method === 'POST' && /^\/channels\/\w+\/messages$/.test(path)) { const id = String(++msgN); latest[path.split('/')[2]] = id; return Response.json({ id }); }
  if (method === 'DELETE') return new Response(null, { status: 204 });
  if (method === 'PATCH') return Response.json({ id: path.split('/').pop() });
  if (method === 'GET' && /^\/channels\/\d+$/.test(path)) return Response.json({ id: path.split('/')[2], last_message_id: latest[path.split('/')[2]] ?? null });
  return Response.json({ message: 'unexpected ' + path }, { status: 404 });
};
const posts = (ch) => calls.filter((c) => c.method === 'POST' && c.path === `/channels/${ch}/messages`);
const CH = '710100';
const i = { channel_id: CH, data: {} };
const cmd = (me, sub, o = {}, at = T0) => lfgCommand(i, env, me, me, sub, o, at, null);
const press = (me, id, at = T0, values) => lfgButton({ data: { custom_id: id, ...(values ? { values } : {}) } }, env, me, me, at, null);
const findSel = (m) => { let out; (function walk(c) { if (!c || out) return; if (Array.isArray(c)) return c.forEach(walk); if (c.type === 3 && c.custom_id) out = c; walk(c.components); })(m.data?.components ?? m.components); return out; };
const open = () => sqlite.prepare("SELECT * FROM rush_lfg WHERE status = 'open' ORDER BY id").all();

// ---------- no board: /lfg now and /lfg cancel refuse ----------
t('/lfg now without a board says to ask a manager for /lfg setup', /no Rush board/i.test(T(await cmd(ann, 'now', { position: 'ST' }))) && open().length === 0);
t('/lfg cancel without a board refuses too', /no Rush board/i.test(T(await cmd(ann, 'cancel'))));
t('the I’m in button without a board refuses', /no Rush board/i.test(T(await press(ann, 'pf:lfg:board:in'))));
t('/lfg list still works without a board', /Nobody is available/.test(T(await cmd(ann, 'list'))));

// ---------- /lfg setup: managers only, saves the channel as the Organization purpose, posts the board ----------
t('a member cannot run /lfg setup', /Only managers/.test(T(await cmd(ann, 'setup'))) && posts(CH).length === 0);
calls.length = 0;
let r = await cmd(boss, 'setup');
const row = sqlite.prepare("SELECT channel_id FROM discord_channels WHERE purpose = 'rush_lfg' AND active = 1").get();
t('/lfg setup saves this channel as the rush_lfg purpose and posts the board there', /board is live/i.test(T(r)) && row?.channel_id === CH && posts(CH).length === 1);
const board1 = posts(CH)[0].body, boardJson = JSON.stringify(board1);
t('the board carries the Phoenix look and the Rush picture, no loose pings', /PHOENIX FIRE/.test(plainText(board1)) && board1.allowed_mentions.parse.length === 0 && !/<@&/.test(boardJson) && !/NOREX/i.test(boardJson));
const ids = boardJson.match(/"custom_id":"[^"]+"/g).map((x) => x.slice(13, -1));
t('the board has I’m in, Make a lobby, +1 hour, Take me off and Alert me, all matching LFG_ID', ['pf:lfg:board:in', 'pf:lfg:board:lobby', 'pf:lfg:board:plus', 'pf:lfg:board:off', 'pf:lfg:alert'].every((x) => ids.includes(x)) && ids.every((x) => LFG_ID.test(x)) && /🔔/.test(boardJson));
const kvBoard = JSON.parse(KV.store?.get?.(BOARD_KEY + CH) ?? (await KV.get(BOARD_KEY + CH)) ?? 'null');
t('the board message id is remembered (KV) so it can be replaced', !!kvBoard?.id);
t('with no one available the board says so', /Nobody is available yet/.test(plainText(board1)));

// ---------- I'm in: a position dropdown, any number of positions, profile not used ----------
sqlite.exec("INSERT OR REPLACE INTO profiles (user_id, rush_positions, updated) VALUES ('901', '[\"GK\"]', 1)");
r = await press(ann, 'pf:lfg:board:in');
const sel = findSel(r);
t('I’m in opens a private dropdown with the four positions and Any, several allowed, nothing pre-picked from the profile', (r.data.flags & 64) !== 0 && sel?.type === 3 && sel.options.length === 5 && sel.max_values === 5 && sel.min_values === 1 && sel.options.every((o) => !o.default) && LFG_ID.test(sel.custom_id));
calls.length = 0;
r = await press(ann, sel.custom_id, T0, ['ST', 'W']);
let mine = open();
t('picking Striker and Winger puts them on the list with both positions (not the profile one)', mine.length === 1 && JSON.parse(mine[0].positions).join() === 'ST,W' && /on the list/.test(T(r)) && mine[0].expires - mine[0].at === 30 * MIN && mine[0].msg_id == null);
t('the board is posted again at the bottom with the role ping (new call), old copy deleted', posts(CH).length === 2 && /<@&7002>/.test(JSON.stringify(posts(CH)[0].body)) && calls.some((c) => c.method === 'DELETE' && c.path === `/channels/${CH}/messages/${kvBoard.id}`));
t('the refreshed board lists the player with both positions', /Ann/.test(plainText(posts(CH)[0].body)) && /Striker \/ Winger/.test(plainText(posts(CH)[0].body)) && /Available for Rush \(1\)/.test(plainText(posts(CH)[0].body)));
const k2 = JSON.parse(await KV.get(BOARD_KEY + CH));
t('the new board id replaced the old one in KV', k2.id !== kvBoard.id);
const a1 = posts(CH)[1].body, annKv = JSON.parse(await KV.get('lfg:ann:' + CH));
t('a second message under the board tags @here and names the newest player and position', /^@here /.test(a1.content) && /Ann/.test(a1.content) && /Striker \/ Winger/.test(a1.content) && a1.allowed_mentions.parse.join() === 'everyone' && !/NOREX/i.test(a1.content));
t('with nobody else listed it has no "also on the list" line, and it is remembered (KV) as the newest message', !/Also on the list/.test(a1.content) && !!annKv?.id && annKv.uid === '901');

// changing the position later updates the same call, no new ping
calls.length = 0; latest[CH] = k2.id; // the board is the newest message: edited in place
await press(ann, 'pf:lfg:pos:30', T0 + MIN, ['GK']);
t('picking again changes the positions on the same call (no second row) and edits the board in place, no ping', open().length === 1 && JSON.parse(open()[0].positions).join() === 'GK' && posts(CH).length === 0 && calls.some((c) => c.method === 'PATCH' && c.path.endsWith(`/messages/${k2.id}`)) && !/<@&/.test(JSON.stringify(calls.find((c) => c.method === 'PATCH')?.body)));
r = await press(ann, 'pf:lfg:board:in', T0 + 2 * MIN);
const sel2 = findSel(r);
t('opening I’m in again pre-selects what they have now', sel2.options.filter((o) => o.default).map((o) => o.value).join() === 'GK');
t('Any position replaces the others', (await press(bo, 'pf:lfg:pos:30', T0 + 3 * MIN, ['ANY', 'ST']), JSON.parse(open().find((p) => p.user_id === '902').positions).join() === 'ANY'));

// ---------- /lfg now: same dropdown, or a direct position ----------
r = await cmd(cy, 'now', {}, T0 + 4 * MIN);
const sel3 = findSel(r);
t('/lfg now with no position shows the dropdown (minutes carried in its id)', sel3?.type === 3 && /pf:lfg:pos:30/.test(sel3.custom_id) && open().length === 2);
await cmd(cy, 'now', { position: 'CB', minutes: 45 }, T0 + 4 * MIN);
const cyRow = open().find((p) => p.user_id === '903');
t('/lfg now with a position puts them on the list directly for the minutes asked', JSON.parse(cyRow.positions).join() === 'CB' && cyRow.expires - cyRow.at === 45 * MIN);
t('the cooldown still stops a quick second call after one ended', (await cmd(cy, 'cancel', {}, T0 + 5 * MIN), /Slow down/.test(T(await cmd(cy, 'now', { position: 'CB' }, T0 + 6 * MIN)))));

// ---------- +1 hour, Take me off ----------
const annRow = () => sqlite.prepare("SELECT * FROM rush_lfg WHERE user_id = '901' ORDER BY id DESC").get();
const e0 = annRow().expires;
t('+1 hour on the board adds an hour to your own call', /Added an hour/.test(T(await press(ann, 'pf:lfg:board:plus', T0 + 7 * MIN))) && annRow().expires === e0 + 60 * MIN);
t('+1 hour without being on the list says to tap I’m in first', /not on the list/.test(T(await press(di, 'pf:lfg:board:plus', T0 + 7 * MIN))));
t('Take me off cancels your call and the board refreshes', /Taken down/.test(T(await press(bo, 'pf:lfg:board:off', T0 + 8 * MIN))) && sqlite.prepare("SELECT status FROM rush_lfg WHERE user_id = '902' ORDER BY id DESC").get().status === 'cancelled');

// ---------- the 1-minute check: the board stays the newest message ----------
calls.length = 0;
await refreshLfgBoard(env, { now: T0 + 9 * MIN, force: true });
const fresh = JSON.parse(await KV.get(BOARD_KEY + CH)); latest[CH] = fresh.id; calls.length = 0;
t('when the board is the newest message the tick does nothing', (await lfgBoardTick(env, T0 + 10 * MIN)).refreshed === false && calls.every((c) => c.method === 'GET'));
latest[CH] = '9999999999999999999'; calls.length = 0; // somebody wrote under it
await lfgBoardTick(env, T0 + 11 * MIN);
t('when someone writes under it, the board is sent again at the bottom and the old one deleted (no ping)', posts(CH).length === 1 && calls.some((c) => c.method === 'DELETE' && c.path.endsWith(`/messages/${fresh.id}`)) && !/<@&/.test(JSON.stringify(posts(CH)[0].body)));
const fresh2 = JSON.parse(await KV.get(BOARD_KEY + CH)); latest[CH] = fresh2.id; calls.length = 0;
await lfgTick(env, T0 + 12 * MIN);
t('the 1-minute job runs the board check', calls.some((c) => c.method === 'GET' && c.path === `/channels/${CH}`));
const endAt = annRow().expires + MIN; calls.length = 0;
await lfgTick(env, endAt);
t('a call that ends leaves the board', open().every((p) => p.user_id !== '901') && calls.some((c) => (c.method === 'PATCH' || c.method === 'POST') && /\/messages/.test(c.path) && CH === c.path.split('/')[2]));

// ---------- Make a lobby from the board: requests to everyone on the list ----------
sqlite.exec("DELETE FROM rush_queue; DELETE FROM rush_lobby_asks; DELETE FROM rush_lfg; DELETE FROM rush_lfg_alerts;");
await cmd(ann, 'now', { position: 'ST', minutes: 60 }, T0 + 20 * MIN);
await cmd(bo, 'now', { position: 'CB', minutes: 60 }, T0 + 20 * MIN);
await cmd(cy, 'now', { position: 'W', minutes: 60 }, T0 + 20 * MIN);
calls.length = 0;
r = await press(ann, 'pf:lfg:board:lobby', T0 + 21 * MIN);
const dms = calls.filter((c) => c.method === 'POST' && /^\/channels\/dm/.test(c.path));
t('Make a lobby from the board asks everyone else on the list by DM; nobody is added', /2 requests sent/.test(T(r)) && dms.length === 2 && sqlite.prepare('SELECT COUNT(*) n FROM rush_queue').get().n === 0 && sqlite.prepare("SELECT COUNT(*) n FROM rush_lobby_asks WHERE captain_id = '901'").get().n === 2);
t('someone who is not on the list cannot make a lobby', /Tap I’m in first/.test(T(await press(di, 'pf:lfg:board:lobby', T0 + 21 * MIN))));
sqlite.exec("INSERT INTO rush_queue (captain_id, members, status, joined_at, ord, status_since) VALUES ('904', '[]', 'waiting', 1, 1, 1)");
t('a member who is in a lobby cannot go available', /You are in a lobby/.test(T(await press(di, 'pf:lfg:board:in', T0 + 22 * MIN))) && /You are in a lobby/.test(T(await cmd(di, 'now', { position: 'ST' }, T0 + 22 * MIN))));
sqlite.exec('DELETE FROM rush_queue');

// ---------- the @here announcement under the board ----------
t('earlier calls each announced themselves', (await KV.get('lfg:ann:' + CH)) != null);
const prev = JSON.parse(await KV.get('lfg:ann:' + CH)); calls.length = 0;
await press(di, 'pf:lfg:pos:30', T0 + 23 * MIN, ['GK']);
const an = posts(CH).find((c) => c.body.content)?.body, anKv = JSON.parse(await KV.get('lfg:ann:' + CH));
t('the fourth player is announced alone to @here with his position; the rest are only a count', /^@here /.test(an?.content) && /Di/.test(an.content) && /Goalkeeper/.test(an.content) && !/Ann|\bBo\b|Cy/.test(an.content) && /Also on the list with 3 others\./.test(an.content) && an.allowed_mentions.parse.join() === 'everyone');
t('it comes after the board (second message) and the previous announcement is deleted', posts(CH).findIndex((c) => c.body.content) === posts(CH).findIndex((c) => c.body.components) + 1 && calls.some((c) => c.method === 'DELETE' && c.path.endsWith(`/messages/${prev.id}`)) && anKv.id !== prev.id);
calls.length = 0; latest[CH] = anKv.id; // the announcement is the newest message: the board is not "buried", nothing is re-posted
t('with the announcement newest the 1-minute check does nothing', (await lfgBoardTick(env, T0 + 24 * MIN)).refreshed === false && calls.every((c) => c.method === 'GET'));
calls.length = 0; await press(di, 'pf:lfg:pos:30', T0 + 24 * MIN, ['GK', 'W']);
t('changing positions on an existing call posts no new announcement and no ping', posts(CH).length === 0 && !calls.some((c) => c.body?.content));
latest[CH] = '9999999999999999999'; calls.length = 0; await lfgBoardTick(env, T0 + 25 * MIN);
const re = posts(CH).find((c) => c.body.content)?.body;
t('when the board has to move, the announcement comes back under it quietly (no @here again)', !!re && !/@here/.test(re.content) && re.allowed_mentions.parse.length === 0 && /Di/.test(re.content));
await press(di, 'pf:lfg:board:off', T0 + 26 * MIN); calls.length = 0;
await refreshLfgBoard(env, { now: T0 + 26 * MIN, force: true });
t('when the announced player goes off the list the announcement is removed', !posts(CH).some((c) => c.body.content) && !JSON.parse((await KV.get('lfg:ann:' + CH)) ?? 'null')?.id);

// ---------- a queue click only corrects the list in place: no second message ----------
await press(di, 'pf:lfg:pos:30', T0 + 40 * MIN, ['GK']); latest[CH] = JSON.parse(await KV.get(BOARD_KEY + CH)).id; calls.length = 0;
await syncAvailability(env, [], [{ captain: '905', members: [], status: 'waiting' }], {}, T0 + 41 * MIN);
t('when the queue takes a player off the list, the board is edited in place: nothing posted, nothing deleted', posts(CH).length === 0 && !calls.some((c) => c.method === 'DELETE') && calls.some((c) => c.method === 'PATCH' && /\/messages\//.test(c.path)));

// ---------- nothing hardcoded ----------
const src = fs.readFileSync(new URL('../bot/lfgboard.js', import.meta.url), 'utf8') + fs.readFileSync(new URL('../bot/lfg.js', import.meta.url), 'utf8');
t('the board channel and ping role are read from the Organization config (purpose rush_lfg, group ping_rush), no ids in code', /channelsFor\(env, 'rush_lfg'\)/.test(src) && /pingRoleFor\(env, 'ping_rush'\)/.test(src) && !/\b\d{17,20}\b/.test(src));
t('no NOREX name, colour or crest in the board code', !/norex|c8352c|080b11/i.test(fs.readFileSync(new URL('../bot/lfgboard.js', import.meta.url), 'utf8')));
t('the board is built from config for another org name', /rise club/i.test(plainText(boardMessage([], { now: T0, org: 'Rise Club' }))) && /rise club/i.test(plainText(positionPicker([], 30, 'Rise Club'))));
done();
