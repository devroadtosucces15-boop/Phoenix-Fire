// DJ bridge routes (PF-022 step 5): the PC pushes snapshots and polls commands over the shared key; the site reads rooms and queues commands.
import { W, call, env, login, sqlite } from './mock.mjs';
import { t, tt, done } from './lib.mjs';
import { cleanRooms, STALE_MS } from '../bot/music.js';

env.FEATURES = JSON.stringify({ ...JSON.parse(env.FEATURES), music: 'members' });
env.MUSIC_SEARCH_WAIT_MS = '3000'; env.MUSIC_POLL_MS = '20';
const KEY = 'test-music-key-0123456789';
const dj = (path, body, key = KEY) => W('/api/music/bridge/' + path, { method: body ? 'POST' : 'GET', headers: { 'X-Phoenix-Key': key, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ s: r.status, d: await r.json().catch(() => null) }));
const room = { id: 'PHX-001', name: 'Phoenix Lounge', paused: false, listeners: 3, volume: 70, nowPlaying: { id: 'n1', title: 'Rise', artist: 'Fire', duration: 200, startedAt: Math.floor(Date.now() / 1000) - 20, thumb: 'http://evil/x.png' },
  queue: [{ id: 'q1', title: 'Burn', artist: 'Fire', duration: 180, by: { id: '701', name: 'Alice' } }, { id: 'q2', title: 'Repeat', artist: 'Fire', duration: 190 }] };

// ---------- the key ----------
t('bridge says "not set up" until the Worker has a key', (await dj('commands')).s === 503);
env.MUSIC_SHARED_KEY = KEY;
t('bridge rejects a wrong key', (await dj('commands', null, 'nope')).s === 403);
t('bridge rejects no key at all', (await W('/api/music/bridge/commands')).status === 403);
t('the old X-Norex-Key header still works (dual-read)', (await W('/api/music/bridge/commands', { headers: { 'X-Norex-Key': KEY } })).status === 200);

// ---------- cleaning ----------
const c = cleanRooms([room, null, { id: 'x', queue: 'bad', nowPlaying: { title: 5 } }])[0];
t('snapshot rows are cleaned: non-https art dropped, by kept, shape fixed', c.nowPlaying.thumb === '' && c.queue[0].by.name === 'Alice' && c.queue[1].by.id === '' && cleanRooms([room, null, { id: 'x' }]).length === 2);

// ---------- site side ----------
const alice = await login('701', [], 'Alice'), mike = await login('702', ['mgr'], 'Mike');
t('site gets [] before the DJ ever pushed (page keeps its SAMPLE rooms)', (await call(alice, '/api/music/rooms')).d?.length === 0);
t('the site needs a login', (await call(null, '/api/music/rooms')).s === 401);

// ---------- push → rooms ----------
t('push stores the snapshot', (await dj('push', { rooms: [room] })).d?.rooms === 1);
const rooms = await call(alice, '/api/music/rooms');
t('site reads the live snapshot', rooms.s === 200 && rooms.d[0].id === 'PHX-001' && rooms.d[0].queue.length === 2 && rooms.d[0].nowPlaying.title === 'Rise');
t('a flag that is off hides the routes', await (async () => { env.FEATURES = JSON.stringify({ ...JSON.parse(env.FEATURES), music: 'owner' }); const r = await call(alice, '/api/music/rooms'); env.FEATURES = JSON.stringify({ ...JSON.parse(env.FEATURES), music: 'members' }); return r.s === 404; })());

// ---------- commands: queue → claim once → ack ----------
const pause = await call(alice, '/api/music/rooms/PHX-001/pause', {});
t('pause is queued', pause.s === 200 && pause.d.ok && Number.isInteger(pause.d.command));
t('unknown room is refused', (await call(alice, '/api/music/rooms/NOPE/pause', {})).s === 404);
t('volume is clamped to 0-100 and must be a number', (await call(alice, '/api/music/rooms/PHX-001/volume', { v: 'loud' })).s === 400 && (await call(alice, '/api/music/rooms/PHX-001/volume', { v: 500 })).s === 200);
t('add needs a song id, remove needs a track id', (await call(alice, '/api/music/rooms/PHX-001/add', { track: {} })).s === 400 && (await call(alice, '/api/music/rooms/PHX-001/remove', {})).s === 400);
t('add and remove by id are queued', (await call(alice, '/api/music/rooms/PHX-001/add', { track: { id: 'https://youtu.be/abc', title: 'T' } })).s === 200 && (await call(alice, '/api/music/rooms/PHX-001/remove', { id: 'q1' })).s === 200);
t('an unknown command is a 404', (await call(alice, '/api/music/rooms/PHX-001/explode', {})).s === 404);

const polled = await dj('commands');
t('the DJ claims the queue in order with who asked', polled.d.commands.map((x) => x.type).join() === 'pause,volume,add,remove' && polled.d.commands[0].by.name === 'Alice' && polled.d.commands[1].arg.v === 100 && polled.d.commands[3].arg.id === 'q1');
t('claimed commands are never handed out twice (a skip must not run twice)', (await dj('commands')).d.commands.length === 0);
t('ack marks them done or failed', (await dj('ack', { done: [{ id: polled.d.commands[0].id, ok: true }, { id: polled.d.commands[1].id, ok: false, error: 'Room is gone' }, { id: 99999, ok: true }] })).d.saved === 3
  && sqlite.prepare("SELECT status FROM music_commands WHERE id = ?").get(polled.d.commands[1].id).status === 'failed');

// ---------- search round trip ----------
await tt('search is queued, the DJ answers on its poll, the site gets tracks', async () => {
  const ask = call(alice, '/api/music/search?q=' + encodeURIComponent('phoenix rise'));
  let cmd; for (let i = 0; i < 100 && !cmd; i++) { await new Promise((r) => setTimeout(r, 20)); cmd = (await dj('commands')).d.commands.find((x) => x.type === 'search'); }
  await dj('ack', { done: [{ id: cmd.id, ok: true, result: [{ id: 'https://youtu.be/zzz', title: 'Phoenix Rise', artist: 'Fire', duration: 200 }] }] });
  const r = await ask; return cmd.arg.q === 'phoenix rise' && r.s === 200 && r.d[0].title === 'Phoenix Rise';
});
t('a one-letter search is empty without asking the DJ', (await call(alice, '/api/music/search?q=a')).d?.length === 0);
t('a search nobody answers times out with 504', await (async () => { env.MUSIC_SEARCH_WAIT_MS = '120'; const r = await call(alice, '/api/music/search?q=silence'); env.MUSIC_SEARCH_WAIT_MS = '3000'; return r.s === 504; })());

// ---------- limits, expiry, offline ----------
await tt('at most 20 open commands per room', async () => { let last; for (let i = 0; i < 25; i++) last = await call(alice, '/api/music/rooms/PHX-001/skip', {}); return last.s === 429; });
sqlite.exec("UPDATE music_commands SET created_at = created_at - 200000 WHERE status = 'queued'");
t('old queued commands expire instead of running late', (await dj('commands')).d.commands.length === 0 && sqlite.prepare("SELECT COUNT(*) AS n FROM music_commands WHERE status = 'expired'").get().n > 0);
const status = await call(mike, '/api/music/status');
t('managers see the bridge status; members do not', status.s === 200 && status.d.online === true && status.d.rooms === 1 && Array.isArray(status.d.recent) && (await call(alice, '/api/music/status')).s === 403);
sqlite.exec(`UPDATE music_snapshot SET pushed_at = pushed_at - ${STALE_MS + 1000}`);
t('a quiet DJ (90 s) is offline: rooms 503, commands refused, status says offline', (await call(alice, '/api/music/rooms')).s === 503 && (await call(alice, '/api/music/rooms/PHX-001/skip', {})).s === 503 && (await call(mike, '/api/music/status')).d.online === false);
t('oversized pushes are refused', (await dj('push', { rooms: [{ id: 'x', name: 'y'.repeat(250000) }] })).s === 413);
done();
