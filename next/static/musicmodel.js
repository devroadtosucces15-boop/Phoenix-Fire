// Music state model (BOT-SITE #5, flag `music`): no DOM in here, so the Music page, the profile playlists and the tests all share it.
//   room    = { id, name, paused, listeners, volume 0-100, nowPlaying:{ id, title, artist, thumb, duration, startedAt, position }|null, queue:[track] }
//   track   = { id, title, artist, thumb, duration, by:{ id, name } }      (duration in seconds, startedAt in unix seconds)
//   `position` is optional: where a PAUSED song stopped (seconds). A playing room is always now − startedAt.
// The store holds rooms and takes EVENTS from any transport (sample, polling, WebSocket); commands are applied at once, then confirmed or rolled back:
//   events   { t:'rooms', rooms } · { t:'room', room } · { t:'conn', conn:'sample'|'live'|'offline' }
//   commands pause · resume · skip · volume{v} · add{track} · remove{id}      → transport.send(roomId, { type, … }) → the new room (optional)
//   transport = { kind, connect(emit) → stop(), send(roomId, cmd) → Promise<room|void>, search(q) → Promise<track[]> }
// Proposed API for the bot side (nothing here exists on the Worker yet):
//   GET  /api/music/rooms                        → [room]            (this is also what a WebSocket pushes: {t:'rooms'|'room'})
//   POST /api/music/rooms/:id/<pause|resume|skip|volume|add|remove>   body: { v } | { track } | { id }    → room
//   GET  /api/music/search?q=<text>              → [track]
//   GET  /api/music/playlists[?u=<discord id>]   → [{ id, name, count, tracks:[{ title, artist, duration }] }]
(() => {
  const w = window;
  const now = () => Math.floor(Date.now() / 1000);
  const num = (n, max) => Math.min(max, Math.max(0, Math.floor(+n) || 0));
  const txt = (s, n) => String(s ?? '').slice(0, n);
  const img = (u) => w.NorexBotUtil?.imgUrl(u) || '';
  const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const track = (q, i) => ({ id: String(q.id ?? i), title: txt(q.title, 140), artist: txt(q.artist, 80), thumb: img(q.thumb), duration: num(q.duration, 36000), by: { id: txt(q.by?.id, 25), name: txt(q.by?.name, 40) } });
  // pure: clean whatever the server sends so a bad row can never break the page
  const room = (r) => ({
    id: String(r.id), name: txt(r.name || 'Music room', 60), paused: !!r.paused, listeners: num(r.listeners, 9999), volume: r.volume == null ? 60 : num(r.volume, 100),
    nowPlaying: r.nowPlaying && r.nowPlaying.title ? { id: txt(r.nowPlaying.id, 40), title: txt(r.nowPlaying.title, 140), artist: txt(r.nowPlaying.artist, 80), thumb: img(r.nowPlaying.thumb), duration: num(r.nowPlaying.duration, 36000), startedAt: num(r.nowPlaying.startedAt, 4e9), position: num(r.nowPlaying.position, 36000) } : null,
    queue: (Array.isArray(r.queue) ? r.queue : []).filter((q) => q && q.title).slice(0, 50).map(track),
  });
  const norm = (list) => (Array.isArray(list) ? list : []).filter((r) => r && r.id != null).slice(0, 12).map(room);
  const normTracks = (list) => (Array.isArray(list) ? list : []).filter((q) => q && q.title).slice(0, 12).map(track);
  // pure: seconds into the song (a paused room shows where it stopped; never past the end)
  const played = (np, paused, t = now()) => (!np || !np.duration ? 0 : Math.min(np.duration, Math.max(0, paused ? np.position || 0 : t - np.startedAt)));

  // every visible title says SAMPLE so it can never pass for real content
  const sample = () => [
    { id: 'sample-lounge', name: 'SAMPLE · Club lounge', paused: false, listeners: 5, nowPlaying: { title: 'SAMPLE · Late night warm-up', artist: 'SAMPLE Artist', thumb: '', duration: 214, startedAt: now() - 96 },
      queue: [{ id: 'q1', title: 'SAMPLE · Pre-match hype', artist: 'SAMPLE Artist', duration: 187, by: { id: '222', name: 'Mike' } }, { id: 'q2', title: 'SAMPLE · A very long song title to test clamping across two lines on a phone screen', artist: 'SAMPLE Band', duration: 241, by: { id: '333', name: 'Jez' } }, { id: 'q3', title: 'SAMPLE · Full-time anthem', artist: 'SAMPLE Choir', duration: 203, by: { id: '444', name: 'Kruger' } }] },
    { id: 'sample-match', name: 'SAMPLE · Match night', paused: true, listeners: 0, nowPlaying: { title: 'SAMPLE · Walk-out theme', artist: 'SAMPLE Orchestra', thumb: '', duration: 158, startedAt: now() - 40 }, queue: [] },
    { id: 'sample-quiet', name: 'SAMPLE · Quiet room', paused: false, listeners: 0, nowPlaying: null, queue: [] },
  ];
  const CATALOG = [['Pre-match hype', 'SAMPLE Artist', 187], ['Walk-out theme', 'SAMPLE Orchestra', 158], ['Full-time anthem', 'SAMPLE Choir', 203], ['Late night warm-up', 'SAMPLE Artist', 214], ['Penalty shootout drums', 'SAMPLE Band', 176], ['Golden goal', 'SAMPLE Band', 232], ['Trophy lift', 'SAMPLE Choir', 245], ['Rush hour', 'SAMPLE Artist', 198]]
    .map(([title, artist, duration], i) => ({ id: 'sample-t' + i, title: 'SAMPLE · ' + title, artist, duration, thumb: '', by: { id: '', name: '' } }));
  // SAMPLE playlists for the profile section (GET /api/music/playlists)
  const samplePlaylists = () => [
    { id: 'sample-p1', name: 'SAMPLE · Match day', count: 4, tracks: CATALOG.slice(0, 4) },
    { id: 'sample-p2', name: 'SAMPLE · Late grind', count: 3, tracks: CATALOG.slice(3, 6) },
  ];
  const normPlaylists = (list) => (Array.isArray(list) ? list : []).filter((p) => p && p.id != null && p.name).slice(0, 12).map((p) => {
    const tracks = normTracks(p.tracks), count = Math.max(tracks.length, num(p.count, 5000));
    return { id: String(p.id), name: txt(p.name, 60), count, tracks, minutes: Math.round(tracks.reduce((a, x) => a + x.duration, 0) / 60) };
  });

  // pure command → the room after it (t = unix seconds, by = who did it). Used for the instant update and by the sample transport.
  const apply = (r, cmd, t = now(), by = { id: '', name: '' }) => {
    const x = JSON.parse(JSON.stringify(r)), np = x.nowPlaying;
    switch (cmd.type) {
      case 'pause': if (np && !x.paused) np.position = played(np, false, t); x.paused = true; break;
      case 'resume': if (np) { np.startedAt = t - (np.position || 0); np.position = 0; } x.paused = false; break;
      case 'skip': { const n = x.queue.shift(); x.nowPlaying = n ? { id: n.id, title: n.title, artist: n.artist, thumb: n.thumb, duration: n.duration, startedAt: t, position: 0 } : null; if (!n) x.paused = false; break; }
      case 'volume': x.volume = num(cmd.v, 100); break;
      case 'add': { const q = cmd.track; if (!q || !q.title || x.queue.length >= 50) break; const row = { ...q, id: String(q.id) + '-' + t, by };
        if (!np) x.nowPlaying = { id: row.id, title: row.title, artist: row.artist, thumb: row.thumb, duration: row.duration, startedAt: t, position: 0 }; else x.queue.push(row); break; }
      case 'remove': x.queue = x.queue.filter((q) => q.id !== cmd.id); break;
    }
    return x;
  };

  // ---------- the store ----------
  const reduce = (s, ev) => {
    if (ev.t === 'rooms') { const rooms = norm(ev.rooms); return { ...s, rooms, sel: rooms.some((r) => r.id === s.sel) ? s.sel : rooms[0]?.id || '' }; }
    if (ev.t === 'room') { const r = norm([ev.room])[0]; if (!r) return s; const has = s.rooms.some((x) => x.id === r.id); return { ...s, rooms: has ? s.rooms.map((x) => (x.id === r.id ? r : x)) : [...s.rooms, r], sel: s.sel || r.id }; }
    if (ev.t === 'conn') return { ...s, conn: ev.conn };
    if (ev.t === 'select') return s.rooms.some((r) => r.id === ev.id) ? { ...s, sel: ev.id } : s;
    return s;
  };
  const createStore = ({ me = { id: '', name: '' }, onChange = () => {}, clock: nowFn = now } = {}) => {
    let s = { rooms: [], sel: '', conn: 'sample' }, tr = null, stop = null, sseq = 0;
    const set = (n) => { s = n; onChange(s); };
    const emit = (ev) => set(reduce(s, ev));
    const cur = () => s.rooms.find((r) => r.id === s.sel) || null;
    return {
      get: () => s, room: cur, emit, select: (id) => emit({ t: 'select', id }),
      // swap the transport (sample → real once real rows arrive); the new one's first `rooms` event replaces what was shown
      use(t) { stop?.(); tr = t; stop = t.connect(emit) || null; },
      stop() { stop?.(); stop = null; },
      // → { ok } | { ok:false, error }; the room changes at once and goes back if the bot says no
      async cmd(type, arg = {}) {
        const before = cur(); if (!before || !tr) return { ok: false, error: 'No room picked.' };
        const c = { type, ...arg };
        emit({ t: 'room', room: apply(before, c, nowFn(), me) });
        try { const r = await tr.send(before.id, c); if (r && r.id != null) emit({ t: 'room', room: r }); return { ok: true }; }
        catch (e) { emit({ t: 'room', room: before }); return { ok: false, error: e?.message || 'The music bot did not accept that.' }; }
      },
      // newest answer wins: a slow reply to an old query never overwrites a newer one → track[] | null (null = superseded)
      async search(q) { const n = ++sseq; const rows = await tr.search(q); return n === sseq ? normTracks(rows) : null; },
    };
  };

  // ---------- transports ----------
  // practice mode: a local copy of the rooms that answers every command, so the whole player can be tried before the bot exists
  const sampleTransport = (me = { id: '', name: '' }) => {
    let rooms = norm(sample()), emit = null, timer = 0;
    const put = (r) => { rooms = rooms.map((x) => (x.id === r.id ? r : x)); emit?.({ t: 'room', room: r }); };
    return {
      kind: 'sample',
      connect(e) { emit = e; e({ t: 'conn', conn: 'sample' }); e({ t: 'rooms', rooms });
        timer = setInterval(() => { const t = now(); rooms.forEach((r) => { if (r.nowPlaying && !r.paused && r.nowPlaying.duration && t - r.nowPlaying.startedAt >= r.nowPlaying.duration) put(apply(r, { type: 'skip' }, t, me)); }); }, 1000);
        return () => { clearInterval(timer); emit = null; }; },
      async send(id, cmd) { const r = rooms.find((x) => x.id === id); if (!r) throw new Error('That room is gone.'); const n = apply(r, cmd, now(), me); put(n); return n; },
      search: (q) => new Promise((ok) => setTimeout(() => ok(CATALOG.filter((x) => (x.title + ' ' + x.artist).toLowerCase().includes(q.toLowerCase()))), 150)),
    };
  };
  // the real bot over HTTP: polls the rooms, commands are POSTs. `get`/`post` are NorexBot.call / NorexBot.post.
  const httpTransport = ({ get, post, every = 30e3 }) => ({
    kind: 'http',
    connect(emit) { let dead = false; const poll = async () => { try { const r = norm(await get('/api/music/rooms')); if (!dead && r.length) { emit({ t: 'conn', conn: 'live' }); emit({ t: 'rooms', rooms: r }); } } catch { if (!dead) emit({ t: 'conn', conn: 'offline' }); } };
      poll(); const i = setInterval(poll, every); return () => { dead = true; clearInterval(i); }; },
    send: (id, cmd) => post(`/api/music/rooms/${encodeURIComponent(id)}/${cmd.type}`, cmd.type === 'volume' ? { v: cmd.v } : cmd.type === 'add' ? { track: { id: cmd.track.id } } : cmd.type === 'remove' ? { id: cmd.id } : {}),
    search: (q) => get('/api/music/search?q=' + encodeURIComponent(q)),
  });
  // live push: the same events over a WebSocket (`{t:'rooms'|'room'}` JSON), reconnecting with a growing pause; commands and search still go through `http`
  const socketTransport = ({ url, http, WS = w.WebSocket }) => ({
    kind: 'socket',
    connect(emit) { let ws = null, dead = false, wait = 1000, timer = 0;
      const open = () => { try { ws = new WS(url); } catch { emit({ t: 'conn', conn: 'offline' }); return; }
        ws.onopen = () => { wait = 1000; emit({ t: 'conn', conn: 'live' }); };
        ws.onmessage = (m) => { try { const ev = JSON.parse(m.data); if (ev && (ev.t === 'rooms' || ev.t === 'room')) emit(ev); } catch {} };
        ws.onclose = () => { if (dead) return; emit({ t: 'conn', conn: 'offline' }); timer = setTimeout(open, wait); wait = Math.min(30e3, wait * 2); }; };
      open(); return () => { dead = true; clearTimeout(timer); try { ws?.close(); } catch {} }; },
    send: http.send, search: http.search,
  });

  w.NorexMusicModel = { now, clock, played, norm, normTracks, normPlaylists, sample, samplePlaylists, catalog: CATALOG, apply, reduce, createStore, sampleTransport, httpTransport, socketTransport };
})();
