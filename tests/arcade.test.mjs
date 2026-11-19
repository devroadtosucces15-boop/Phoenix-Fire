// PF-024 Item 23 – the arcade, first slice (bot/arcade.js, rules in bot/arcadegames.js): four turn-based games, invites, compare-and-set moves, resign, expiry, records, the arcade score and the shared points hook.
// Guardrails: only the two players press buttons, no bots or self, open-game cap, no points for a game under MIN_MOVES, once-only points per game, Phoenix look with no NOREX name, colour or crest.
import fs from 'node:fs';
import { env, sqlite } from './mock.mjs';
import worker from '../bot/worker.js';
import { t, tt, done } from './lib.mjs';
import { plainText } from '../bot/ui.js';
import { COMMANDS, APP_COMMANDS } from '../bot/commanddefs.js';
import { PERMS } from '../bot/roles.js';
import { GAMES } from '../bot/arcadegames.js';
import { arcadeCommand, arcadeButton, view, SEAT, MIN_MOVES, OPEN_CAP, EXPIRE_MS } from '../bot/arcade.js';

env.FEATURES = JSON.stringify({ ...JSON.parse(env.FEATURES), arcade: 'members' });
Object.assign(env, { DISCORD_APP_ID: '100', SITE_URL: 'https://phoenix.test/' });
const A = { u: '1', role: 'member' }, B = { u: '2', role: 'member' }, C = { u: '3', role: 'member' };
const T0 = Date.UTC(2026, 11, 2, 12);
for (const [id, n] of [['1', 'Ash'], ['2', 'Blaze'], ['3', 'Cinder']]) sqlite.prepare('INSERT OR IGNORE INTO users (id, name) VALUES (?, ?)').run(id, n);

// ---------- pure rules ----------
const play = (G, s, seat, m) => { const r = G.play(s, seat, m); if (r.error) throw new Error(r.error); return r.state; };
t('noughts and crosses: a row wins, a taken square and the wrong turn are refused', (() => {
  const G = GAMES.ttt; let s = G.init();
  s = play(G, s, 0, 0); s = play(G, s, 1, 3); s = play(G, s, 0, 1); s = play(G, s, 1, 4);
  const bad = G.play(s, 0, 3).error && G.play(s, 1, 2).error;
  s = play(G, s, 0, 2);
  return !!bad && G.outcome(s)?.winner === 0;
})());
t('noughts and crosses: a full board with no line is a draw', (() => {
  const G = GAMES.ttt; let s = G.init(); const order = [0, 1, 2, 4, 3, 5, 7, 6, 8]; order.forEach((c, k) => { s = play(G, s, k % 2, c); });
  return G.outcome(s)?.winner === null;
})());
t('connect four: four in a column wins, a full column is refused', (() => {
  const G = GAMES.c4; let s = G.init();
  for (let k = 0; k < 3; k++) { s = play(G, s, 0, 0); s = play(G, s, 1, 1); }
  s = play(G, s, 0, 0);
  const win = G.outcome(s)?.winner === 0;
  let f = G.init(); for (let k = 0; k < 6; k++) f = play(G, f, k % 2, 3);
  return win && !!G.play(f, 0, 3).error;
})());
t('connect four: a diagonal wins', (() => {
  const G = GAMES.c4; let s = G.init(); // seat 0 builds 0,1,2,3 on a rising diagonal
  for (const [seat, col] of [[0, 0], [1, 1], [0, 1], [1, 2], [0, 6], [1, 2], [0, 2], [1, 3], [0, 6], [1, 3], [0, 3], [1, 6], [0, 3]]) s = play(G, s, seat, col);
  return G.outcome(s)?.winner === 0;
})());
t('rock paper scissors: picks stay hidden until both are in, draws replay, first to two wins', (() => {
  const G = GAMES.rps; let s = G.init();
  s = play(G, s, 0, 'r'); const hidden = s.log.length === 0 && !!G.play(s, 0, 'p').error;
  s = play(G, s, 1, 'r'); const replay = s.wins[0] === 0 && s.wins[1] === 0 && s.log.length === 1;
  s = play(G, s, 0, 'p'); s = play(G, s, 1, 'r'); s = play(G, s, 1, 's'); s = play(G, s, 0, 'r');
  return hidden && replay && G.outcome(s)?.winner === 0;
})());
t('penalty shootout: a different side is a goal, the same side is a save, five kicks each decide it', (() => {
  const G = GAMES.pens; let s = G.init();
  for (let k = 0; k < 10; k++) { const shooter = k % 2; s = play(G, s, shooter, 'l'); s = play(G, s, 1 - shooter, shooter === 0 ? 'r' : 'l'); }
  return s.score[0] === 5 && s.score[1] === 0 && G.outcome(s)?.winner === 0;
})());
t('penalty shootout: level after ten kicks goes to sudden death', (() => {
  const G = GAMES.pens; let s = G.init();
  for (let k = 0; k < 10; k++) { const sh = k % 2; s = play(G, s, sh, 'l'); s = play(G, s, 1 - sh, 'r'); }
  const level = G.outcome(s) === null && s.score[0] === 5 && s.score[1] === 5;
  s = play(G, s, 0, 'l'); s = play(G, s, 1, 'l'); s = play(G, s, 1, 'l'); s = play(G, s, 0, 'r');
  return level && G.outcome(s)?.winner === 1;
})());

// ---------- command and records ----------
const press = (who, id, verb, arg, now = T0) => arcadeButton({ member: { user: { id: who.u, username: 'x' } }, data: { custom_id: `pf:arc:${verb}:${id}${arg === undefined ? '' : ':' + arg}` } }, env, who, now);
const start = (who, game, opp = '2', now = T0, extra = {}) => arcadeCommand({ member: { user: { id: who.u, username: 'Ash' } }, channel_id: 'c1', data: { name: 'arcade', options: [{ name: 'play', type: 1, options: [{ name: 'game', value: game }, { name: 'opponent', value: opp }] }],
  resolved: { users: { [opp]: { id: opp, username: opp === '2' ? 'Blaze' : 'Cinder', ...extra } } } } }, env, who, now);
const rowOf = (id) => sqlite.prepare('SELECT * FROM arcade_games WHERE id = ?').get(id);
const pts = (u) => sqlite.prepare('SELECT COALESCE(SUM(delta), 0) n FROM points_log WHERE user_id = ?').get(u).n;

let r = await start(A, 'ttt');
const gid = Number(sqlite.prepare('SELECT MAX(id) m FROM arcade_games').get().m);
t('/arcade play posts a public invite that pings the invited member', r.type === 4 && !(r.data.flags & 64) && /<@2>/.test(plainText(r.data)) && JSON.stringify(r.data.allowed_mentions) === '{"users":["2"]}' && rowOf(gid).status === 'invited');
t('a stranger cannot press Accept, the starter cannot accept for the invited member', /not your game/i.test(plainText((await press(C, gid, 'acc')).data)) && /Only the invited member/.test(plainText((await press(A, gid, 'acc')).data)) && rowOf(gid).status === 'invited');
t('moves before the invite is accepted are refused', /Not started/.test(plainText((await press(A, gid, 'mv', 0)).data)));
r = await press(B, gid, 'acc');
t('Accept starts the game and updates the same message (type 7)', r.type === 7 && rowOf(gid).status === 'playing');
t('a move out of turn is refused and changes nothing', /Not your turn/.test(plainText((await press(B, gid, 'mv', 0)).data)) && rowOf(gid).moves === 0);
await press(A, gid, 'mv', 0); await press(B, gid, 'mv', 3); await press(A, gid, 'mv', 1); await press(B, gid, 'mv', 4);
const before = pts('1') + pts('2');
r = await press(A, gid, 'mv', 2, T0 + 1000);
const g1 = rowOf(gid);
t('three in a row ends the game: winner stored, message shows the result, controls switched off', g1.status === 'done' && g1.winner === 0 && g1.ended_by === 'finish' && /wins/.test(plainText(r.data)) && !JSON.stringify(r.data).includes('"disabled":false'));
t('arcade score: win 4, loss 1; shared points: played for both, won for the winner, once only', (() => {
  const sa = sqlite.prepare('SELECT * FROM arcade_scores WHERE user_id = ?').get('1'), sb = sqlite.prepare('SELECT * FROM arcade_scores WHERE user_id = ?').get('2');
  return sa.score === 4 && sa.wins === 1 && sb.score === 1 && sb.losses === 1 && pts('1') - 0 > pts('2') && pts('1') + pts('2') > before;
})());
const afterPts = pts('1');
await press(A, gid, 'mv', 5); await press(A, gid, 'res', undefined);
t('a finished game cannot be changed or settled twice', rowOf(gid).moves === 5 && pts('1') === afterPts && sqlite.prepare('SELECT COUNT(*) n FROM arcade_scores WHERE played > 1').get().n === 0);

r = await start(A, 'rps');
const rid = Number(sqlite.prepare('SELECT MAX(id) m FROM arcade_games').get().m);
await press(B, rid, 'acc');
const p0 = pts('1') + pts('2');
await press(A, rid, 'res', undefined, T0 + 5);
t('resigning before MIN_MOVES ends the game and pays nothing', rowOf(rid).status === 'done' && rowOf(rid).winner === 1 && rowOf(rid).ended_by === 'resign' && pts('1') + pts('2') === p0 && MIN_MOVES >= 2);

r = await start(A, 'c4');
const cid = Number(sqlite.prepare('SELECT MAX(id) m FROM arcade_games').get().m);
r = await press(B, cid, 'dec');
t('the invited member can decline: the game is closed and says so', rowOf(cid).status === 'declined' && /declined/.test(plainText(r.data)));

r = await start(A, 'pens');
const pid = Number(sqlite.prepare('SELECT MAX(id) m FROM arcade_games').get().m);
await press(B, pid, 'acc');
await press(A, pid, 'mv', 'l'); const h = await press(A, pid, 'mv', 'r');
t('a simultaneous pick is hidden and a second pick by the same player is refused', /already picked/.test(plainText(h.data)) && !/⬅️ vs/.test(plainText((await press(B, pid, 'mv', 'x')).data)));

r = await start(A, 'ttt');
const eid = Number(sqlite.prepare('SELECT MAX(id) m FROM arcade_games').get().m);
await press(B, eid, 'acc');
r = await press(A, eid, 'mv', 0, T0 + EXPIRE_MS + 10);
t('a game with no move for a day expires', rowOf(eid).status === 'expired' && /timed out/.test(plainText(r.data)));

// guardrails on starting
t('cannot play yourself or a bot', /someone else/i.test(plainText((await start(A, 'ttt', '1')).data)) && /Bots/.test(plainText((await start(A, 'ttt', '3', T0, { bot: true })).data)));
let open = 0; for (let k = 0; k < OPEN_CAP + 1; k++) { const x = await start(B, 'ttt', '3', T0 + 100 + k); if (/Too many/.test(plainText(x.data))) open++; }
t('the open-game cap stops a fourth open game', open === 1);
t('unknown game name is refused with the list', /Pick a game/.test(plainText((await start(A, 'nope')).data)));

// leaderboard and record
const top = await arcadeCommand({ member: { user: { id: '1', username: 'Ash' } }, data: { name: 'arcade', options: [{ name: 'top', type: 1 }] } }, env, A);
const me = await arcadeCommand({ member: { user: { id: '1', username: 'Ash' } }, data: { name: 'arcade', options: [{ name: 'me', type: 1 }] } }, env, A);
t('top and me are private and show the record', (top.data.flags & 64) && /Ash/.test(plainText(top.data)) && (me.data.flags & 64) && /4\*\* arcade points/.test(plainText(me.data)));

// flag, permission, registration
t('the arcade is off for a member until the owner opens it', (() => { const save = env.FEATURES; env.FEATURES = JSON.stringify({ ...JSON.parse(save), arcade: 'owner' }); return arcadeCommand({ member: { user: { id: '1' } }, data: { name: 'arcade', options: [{ name: 'top' }] } }, env, A).then((x) => { env.FEATURES = save; return /Not switched on/.test(plainText(x.data)); }); })());
t('the arcade is not switched on for members by default in config.json (owner first)', JSON.parse(fs.readFileSync('config.json', 'utf8')).features.arcade === 'owner');
t('/arcade is defined (play, top, me), lives in the matchday app and needs the member permission', (() => { const c = COMMANDS.find((x) => x.name === 'arcade'); return c && c.options.map((o) => o.name).join() === 'play,top,me' && APP_COMMANDS.matchday.includes('arcade') && PERMS['arcade.play'] === 'member'; })());

// Worker round trip
const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
env.DISCORD_PUBLIC_KEY = Buffer.from(await crypto.subtle.exportKey('raw', kp.publicKey)).toString('hex');
const send = async (payload) => { const body = JSON.stringify(payload), ts = String(Date.now()); const sig = Buffer.from(await crypto.subtle.sign('Ed25519', kp.privateKey, new TextEncoder().encode(ts + body))).toString('hex');
  const res = await worker.fetch(new Request('https://w.test/interactions', { method: 'POST', headers: { 'X-Signature-Ed25519': sig, 'X-Signature-Timestamp': ts }, body }), env, { waitUntil() {} }); return { s: res.status, d: await res.json().catch(() => null) }; };
await tt('the Worker routes /arcade play and the Accept button', async () => {
  sqlite.exec("DELETE FROM arcade_games WHERE status IN ('invited','playing')");
  const w1 = await send({ type: 2, member: { user: { id: '1', username: 'Ash' }, roles: [] }, channel_id: 'c1', token: 't', data: { name: 'arcade', options: [{ name: 'play', type: 1, options: [{ name: 'game', value: 'c4' }, { name: 'opponent', value: '2' }] }], resolved: { users: { 2: { id: '2', username: 'Blaze' } } } } });
  const id = sqlite.prepare('SELECT MAX(id) m FROM arcade_games').get().m;
  const w2 = await send({ type: 3, member: { user: { id: '2', username: 'Blaze' }, roles: [] }, channel_id: 'c1', token: 't', message: { id: 'm1' }, data: { custom_id: `pf:arc:acc:${id}`, component_type: 2 } });
  return w1.d?.type === 4 && w2.d?.type === 7 && rowOf(id).status === 'playing';
});

// Phoenix look: no NOREX name, red or crest in any game message
const g = rowOf(gid), out = JSON.stringify(view(g, env)) + JSON.stringify(view({ ...g, status: 'invited' }, env)) + JSON.stringify(view({ ...g, game: 'c4', state: JSON.stringify(GAMES.c4.init()), status: 'playing' }, env));
t('game messages are Phoenix themed: Phoenix name and motto, orange panel, no NOREX name, red or crest', /Phoenix Fire/i.test(out) && /Rise\. Burn\. Repeat\./.test(out) && !/norex|c8352c|0xc8352c|13112620/i.test(out.replace(/pf:arc/g, '')) && SEAT.length === 2);
t('the arcade source reads no channel or role id: the game is played where it was started', !/\b\d{17,20}\b/.test(fs.readFileSync('bot/arcade.js', 'utf8')) && !/channelFor|CHANNEL_PURPOSES/.test(fs.readFileSync('bot/arcade.js', 'utf8')));
done();
