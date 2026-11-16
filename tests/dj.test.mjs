// Phoenix DJ (dj/): every name, colour and picture the music bot shows must be Phoenix, never NOREX (CLAUDE.md rule 5).
import fs from 'node:fs'; import path from 'node:path'; import { t, done } from './lib.mjs';

const ROOT = new URL('../dj/', import.meta.url).pathname;
const files = (d) => fs.readdirSync(path.join(ROOT, d)).filter((f) => f.endsWith('.js')).map((f) => path.join(d, f));
const src = [...files('src'), 'package.json', '.env.example', 'DEPLOY.md', 'phoenix-dj.service', 'pc-install.sh'];
for (const f of src) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  // The PC shares the home audio engine, so its real paths/unit names may appear (they are infrastructure, never shown in Discord).
  const shown = s.replace(/norex-dj-home|norex-lavalink\.service|norex-heal\.(?:service|timer)/g, '');
  t(`dj/${f}: no NOREX name`, !/norex/i.test(shown));
  t(`dj/${f}: no NOREX colour`, !/#?(c8352c|080b11|e0493f)\b|0xc8352c|0x6b7785/i.test(s));
  t(`dj/${f}: no NOREX server or role IDs`, !/1371311947894489299|1371389857649393684|1451571867579322422/.test(s));
}
const brand = await import('../dj/src/brand.js');
const cfg = JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url), 'utf8')).brand;
t('brand accent comes from config.json', brand.ACCENT === cfg.red && brand.COLORS.accent === parseInt(cfg.red.slice(1), 16));
t('bot name is Phoenix DJ, rooms category is PHOENIX ROOMS', brand.BOT === 'Phoenix DJ' && brand.ROOMS === 'PHOENIX ROOMS');
const crest = fs.readFileSync(path.join(ROOT, 'assets/crest.png')), phoenix = fs.readFileSync(new URL('../phoenix/overlay/crest.png', import.meta.url));
t('panel crest is the Phoenix crest (not the NOREX one)', crest.length > 0 && crest.length !== 60713 && phoenix.length > 0);
t('six rooms: Phoenix DJ + DJ 1..5', /MAX_ROOMS = 6/.test(fs.readFileSync(path.join(ROOT, 'src/index.js'), 'utf8')));
const bubbles = fs.readFileSync(path.join(ROOT, 'src/bubbles.js'), 'utf8'), icons = fs.readFileSync(path.join(ROOT, 'src/icons.js'), 'utf8');
t('room codes use the Phoenix prefix (PHX-001), not NRX', brand.ROOM_CODE === 'PHX' && /\$\{ROOM_CODE\}-/.test(bubbles) && !/NRX-/.test(bubbles));
t('rooms open in ROOMS_CATEGORY_ID when it is a category, else fall back to the named one', /ROOMS_CATEGORY_ID/.test(bubbles) && /ChannelType\.GuildCategory\) return set/.test(bubbles));
t('.env.example points rooms at the Phoenix voice category', /^ROOMS_CATEGORY_ID=1328821938243637385$/m.test(fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8')));
t('empty rooms auto-delete (45 s grace, 3 min if nobody joins)', /EMPTY_GRACE_MS = 45_000, NEVER_USED_MS = 3 \* 60_000/.test(bubbles) && /remove\(id, 'empty'\)/.test(bubbles));
t('new app emoji are uploaded as px_, old ones still recognised', /name: `\$\{EMOJI_PREFIX\}\$\{name\}`/.test(icons) && brand.EMOJI_PREFIX === 'px_');

// ---------- DJ bridge client (PF-022): pushes snapshots, polls commands, over the shared key, against the real Worker routes ----------
const { createBridge, snapshot, workerUrl, searchTracks, KEY_HEADER } = await import('../dj/src/bridge.js');
const { W, env, login, call } = await import('./mock.mjs');
env.FEATURES = JSON.stringify({ ...JSON.parse(env.FEATURES), music: 'members' }); env.MUSIC_SHARED_KEY = 'dj-test-key-0123456789'; env.MUSIC_SEARCH_WAIT_MS = '3000'; env.MUSIC_POLL_MS = '20';
t('bridge header is the Phoenix key name', KEY_HEADER === 'X-Phoenix-Key');
t('Worker host comes from config.json when WORKER_URL is empty, and WORKER_URL wins', workerUrl({}) === new URL(JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url), 'utf8')).members.api).origin && workerUrl({ WORKER_URL: 'https://x.example/' }) === 'https://x.example');
t('index.js starts the bridge only when the key is set, and /play records who asked', /MUSIC_SHARED_KEY && workerUrl\(env\)/.test(fs.readFileSync(path.join(ROOT, 'src/index.js'), 'utf8')) && /tr\.by = \{ id: i\.user\.id/.test(fs.readFileSync(path.join(ROOT, 'src/index.js'), 'utf8')));
const mk = (title, by) => ({ info: { title, author: 'Artist', length: 200000, artworkUrl: 'https://img/x.png', uri: 'https://youtu.be/' + title }, by });
const calls = [];
const fake = { dead: false, guildId: 'g', channelId: 'v', binding: { textId: 'T1' }, helper: { name: 'Phoenix DJ 1', client: { guilds: { cache: new Map([['g', { channels: { cache: new Map([['v', { name: 'Lounge' }]]) } }]]) } } },
  settings: { volume: 55 }, current: mk('Now', { id: '701', name: 'Alice' }), queue: [mk('A'), mk('B')], player: { paused: false, position: 20000 },
  memberIds: () => ['1', '2'], changed() { calls.push('changed'); },
  pause: async (p) => { fake.player.paused = p; calls.push('pause:' + p); }, skip: async () => calls.push('skip'), setVolume: async (v) => { fake.settings.volume = v; calls.push('vol:' + v); },
  add: async (tr) => { fake.queue.push(...tr); calls.push('add:' + tr[0].by?.name); } };
const snap = snapshot([fake, { dead: true, queue: [] }], 1_000_000);
t('snapshot: Phoenix room name, listeners, volume, progress, ids for remove, who asked', snap.length === 1 && snap[0].id === 'T1' && snap[0].name === 'Phoenix DJ 1 · Lounge' && snap[0].listeners === 2 && snap[0].volume === 55
  && snap[0].nowPlaying.position === 20 && snap[0].nowPlaying.startedAt === 980 && snap[0].nowPlaying.by.name === 'Alice' && snap[0].queue.length === 2 && snap[0].queue[0].id !== snap[0].queue[1].id && snap[0].queue[0].duration === 200);
t('snapshot ids stay the same between pushes (remove-by-id is stable)', snapshot([fake])[0].queue[0].id === snap[0].queue[0].id);
const viaWorker = (path, init = {}) => W(path.replace(/^https?:\/\/[^/]+/, ''), init);
const bridge = createBridge({ url: 'https://worker.test', key: env.MUSIC_SHARED_KEY, pushEvery: 60_000, minGap: 0, log: { log() {} },
  fetchImpl: (u, init) => viaWorker(u, init),
  ctx: { rooms: () => [fake], find: (id) => (id === 'T1' ? fake : undefined), resolve: async (q) => (q.includes('bad') ? null : { tracks: [mk('Added')] }), search: async (q) => [{ id: 'https://youtu.be/s', title: 'Found ' + q, artist: 'X', thumb: '', duration: 100 }] } });
t('push sends the snapshot to the Worker', await bridge.push(true) === true);
const alice = await login('701', [], 'Alice');
t('the site now reads the live room the PC pushed', (await call(alice, '/api/music/rooms')).d?.[0]?.name === 'Phoenix DJ 1 · Lounge');
t('an identical snapshot is not re-pushed within the heartbeat window', await bridge.push() === false);
await call(alice, '/api/music/rooms/T1/pause', {}); await call(alice, '/api/music/rooms/T1/volume', { v: 30 });
await call(alice, '/api/music/rooms/T1/skip', {}); await call(alice, '/api/music/rooms/T1/add', { track: { id: 'https://youtu.be/ok' } });
await call(alice, '/api/music/rooms/T1/add', { track: { id: 'bad' } });
const rid = snap[0].queue[0].id;
await call(alice, '/api/music/rooms/T1/remove', { id: rid }); await call(alice, '/api/music/rooms/T1/remove', { id: 'gone' });
await bridge.poll(); bridge.stop();
t('polled commands run on the room in order and the requester is recorded on added songs', calls.filter((c) => c !== 'changed').join() === 'pause:true,vol:30,skip,add:Alice' && fake.queue.length === 2 + 1 - 1 && !fake.queue.some((q) => q.qid === rid));
const { sqlite } = await import('./mock.mjs');
t('every command is acked: failures carry a reason', JSON.stringify(sqlite.prepare("SELECT status FROM music_commands ORDER BY id").all().map((r) => r.status)) === JSON.stringify(['done', 'done', 'done', 'done', 'failed', 'done', 'failed']));
t('unknown room is acked as failed, not thrown', (await createBridge({ url: 'u', key: 'k', ctx: { rooms: () => [], find: () => undefined }, fetchImpl: async () => new Response('{}'), log: { log() {} } }).exec({ type: 'skip', room: 'zzz' })).ok === false);
const quiet = []; const dead = createBridge({ url: 'https://worker.test', key: 'k', pushEvery: 60_000, log: { log: (m) => quiet.push(m) }, ctx: { rooms: () => [fake], find: () => fake }, fetchImpl: async () => { throw new Error('ENOTFOUND'); } });
t('a dead network never throws and logs once', await dead.push(true) === false && await dead.push(true) === false && quiet.length === 1 && dead.down === true);
t('search uses the first source and returns playable links', (await searchTracks({ rest: { resolve: async () => ({ loadType: 'search', data: [{ info: { title: 'T', author: 'A', uri: 'https://youtu.be/z', length: 90000 } }, { info: { title: 'no uri' } }] }) } }, 'q'))[0].id === 'https://youtu.be/z');

// ---------- Control Center registry block (kind dj) ----------
const { DJ_REGISTRY, DJ_APPS } = await import('../bot/djregistry.js');
const cmdSrc = fs.readFileSync(path.join(ROOT, 'src/commands.js'), 'utf8') + fs.readFileSync(path.join(ROOT, 'src/playlistcmd.js'), 'utf8');
const slash = DJ_REGISTRY.filter((r) => r.key.startsWith('dj:slash:')).map((r) => r.trigger.slice(1));
t('registry lists every DJ slash command in commands.js (nothing missing, nothing invented)', slash.length >= 17 && slash.every((n) => new RegExp(`setName\\('${n}'\\)`).test(cmdSrc))
  && [...fs.readFileSync(path.join(ROOT, 'src/commands.js'), 'utf8').matchAll(/^\s{2}new SlashCommandBuilder\(\)\.setName\('([a-z]+)'\)/gm)].every((m) => slash.includes(m[1])));
t('registry has every site command and output, all kind dj with unique keys and the music flag', ['pause', 'resume', 'skip', 'volume', 'add', 'remove', 'search'].every((n) => DJ_REGISTRY.some((r) => r.key === 'dj:site:' + n))
  && DJ_REGISTRY.every((r) => r.kind === 'dj' && r.app === 'dj' && r.flag === 'music') && new Set(DJ_REGISTRY.map((r) => r.key)).size === DJ_REGISTRY.length);
t('all six DJ apps are named Phoenix DJ / Phoenix DJ 1..5 and no registry text says NOREX', DJ_APPS.length === 6 && DJ_APPS.map((a) => a.name).join() === 'Phoenix DJ,Phoenix DJ 1,Phoenix DJ 2,Phoenix DJ 3,Phoenix DJ 4,Phoenix DJ 5' && !/norex/i.test(JSON.stringify([DJ_REGISTRY, DJ_APPS])));
t('no channel or role ID is hardcoded in the registry block', !/\b\d{17,20}\b/.test(JSON.stringify(DJ_REGISTRY)));
done();
