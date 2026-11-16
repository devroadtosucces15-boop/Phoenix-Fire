// Control Center registry block for the DJ (PF-022 step 5, kind `dj`). The generator and bot/controlcenter.js belong to the Control Center
// backend session, so this block lives in its own file: the follow-up spreads DJ_REGISTRY into the generated list (same row shape as
// bot/registry.gen.js, plus kind 'dj') and may route the music.* permissions. Nothing here posts anything by itself.
// App IDs live in dj/DEPLOY.md, not here (no Discord ID is typed into code). Every name is Phoenix (Phoenix DJ, Phoenix DJ 1..5); channels and roles are never named here, they come from config / the bound rooms.
export const DJ_APPS = [
  { key: 'dj:app:main', name: 'Phoenix DJ', role: 'controller: registers the slash commands, owns room 1' },
  { key: 'dj:app:1', name: 'Phoenix DJ 1', role: 'helper room' },
  { key: 'dj:app:2', name: 'Phoenix DJ 2', role: 'helper room' },
  { key: 'dj:app:3', name: 'Phoenix DJ 3', role: 'helper room' },
  { key: 'dj:app:4', name: 'Phoenix DJ 4', role: 'helper room' },
  { key: 'dj:app:5', name: 'Phoenix DJ 5', role: 'helper room' },
];

// slash commands of the DJ apps (source of truth: dj/src/commands.js, parity checked by tests/dj.test.mjs)
const SLASH = [
  ['play', 'Play a song or link (YouTube, Spotify, SoundCloud)', 'public'], ['room', 'Pop-up rooms: your own voice channel and chat', 'public'],
  ['playlist', 'Personal playlists: create, add, import, play, share', 'public'], ['setup', 'Managers: make a text channel the player for a voice channel', 'managers'],
  ['unsetup', 'Managers: remove the player from a text channel', 'managers'], ['panel', 'Re-post the player panel at the bottom of the channel', 'public'],
  ['queue', 'Show the queue', 'public'], ['voteskip', 'Vote to skip the current song', 'public'], ['skip', 'Skip the current song', 'public'],
  ['pause', 'Pause or resume', 'public'], ['stop', 'Stop and leave', 'public'], ['volume', 'Set the volume', 'public'], ['shuffle', 'Shuffle the queue', 'public'],
  ['loop', 'Loop mode: off, song or queue', 'public'], ['remove', 'Remove a queued song', 'public'], ['autoplay', 'Keep playing suggested songs', 'public'],
  ['effects', 'Audio effects, each on or off with its own level', 'public'],
];
// commands the website sends to the DJ through the bridge (bot/music.js)
const BRIDGE = [
  ['pause', 'Pause the room from the website', 'music.control'], ['resume', 'Resume the room from the website', 'music.control'], ['skip', 'Skip the current song from the website', 'music.control'],
  ['volume', 'Set the room volume from the website (0 to 100)', 'music.control'], ['add', 'Add a song to the queue from the website', 'music.control'],
  ['remove', 'Remove a queued song by id from the website', 'music.control'], ['search', 'Search songs for the website Add-a-song box', 'music.control'],
];
const row = (o) => ({ app: 'dj', summary: '', schedule: 'when someone runs it', flag: 'music', level: 'members', status: 'owner testing', source: 'dj/', purposes: [], applies: ['switch', 'audience'], kind: 'dj', ...o });

export const DJ_REGISTRY = [
  ...SLASH.map(([n, summary, level]) => row({ key: `dj:slash:/${n}`, name: `/${n} (Phoenix DJ)`, summary, trigger: `/${n}`, level })),
  ...BRIDGE.map(([n, summary, perm]) => row({ key: `dj:site:${n}`, name: `Website: ${n}`, summary, trigger: `POST /api/music/rooms/:id/${n === 'search' ? '' : n}`.replace(/\/$/, '') , schedule: 'when a member presses it on the site', perm, source: 'bot/music.js' })),
  row({ key: 'dj:out:panel', name: 'Phoenix DJ player panel', summary: 'The persistent player panel with controls, posted in each player channel', trigger: 'room change', schedule: 'on every song or setting change', applies: ['switch', 'reply'] }),
  row({ key: 'dj:out:room-chat', name: 'Pop-up room chat (PHX rooms)', summary: 'Room welcome and control messages in /room chats', trigger: '/room create', applies: ['switch', 'reply'] }),
  row({ key: 'dj:out:break-dm', name: 'Playback broken or fixed DM', summary: 'A DM to the owner when YouTube playback breaks or is fixed', trigger: 'watch job', schedule: 'when playback state changes', level: 'owner', applies: ['switch'] }),
  row({ key: 'dj:out:snapshot', name: 'Live rooms on the website', summary: 'The Music page shows every live room pushed by the DJ app (SAMPLE rooms when it is offline)', trigger: 'DJ push, every change and every 20 s', schedule: 'continuous', source: 'bot/music.js', applies: ['switch', 'audience'] }),
  row({ key: 'dj:out:status', name: 'DJ bridge status', summary: 'Online or offline, last push, open commands and the recent command log for managers', trigger: 'GET /api/music/status', schedule: 'when a manager opens it', level: 'managers', source: 'bot/music.js', applies: ['audience'] }),
];
