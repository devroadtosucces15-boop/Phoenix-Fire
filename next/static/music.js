// Music page (BOT-SITE #5, flag `music`): the live player on top of musicmodel.js – rooms, now playing, play/pause, skip, volume, search + add, queue.
// Norex DJ is not connected yet, so it starts in practice mode with SAMPLE rooms that really answer every control. The moment
// GET /api/music/rooms returns rows the page switches to the real bot (polling, or a WebSocket when <div data-music data-socket="wss://…"> is set)
// and the SAMPLE rooms go away. See musicmodel.js for the state model and the proposed API.
(() => {
  const d = document, w = window, MM = w.NorexMusicModel;
  if (!MM) return;
  w.NorexMusic = { sample: MM.sample, norm: MM.norm, clock: MM.clock, played: MM.played };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const { clock, played } = MM;

  const host = d.querySelector?.('[data-music]'), B = w.NorexBot;
  if (!host || !B) return;
  const list = d.querySelector('#mu-rooms'), room = d.querySelector('#mu-room'), note = host.querySelector('[data-mu-note]');
  const A = w.NorexAuth, me = { id: String(A?.session?.u || ''), name: String(A?.session?.n || '') }, owner = A?.role === 'owner';
  let built = '', found = [], t0 = 0, qtimer = 0, qseq = 0;
  const store = MM.createStore({ me, onChange: (s) => paint(s) });

  const art = (np) => np && np.thumb ? `<img src="${esc(np.thumb)}" alt="" width="120" height="120" decoding="async">` : '<span class="mu-ph" aria-hidden="true">♪</span>';
  const bar = (np, p) => `<div class="mu-bar" role="progressbar" aria-label="Song progress" aria-valuemin="0" aria-valuemax="${np.duration}" aria-valuenow="${p}"><i style="width:${np.duration ? Math.round((p / np.duration) * 100) : 0}%"></i></div><div class="mu-time num"><span data-mu-pos>${clock(p)}</span><span>${clock(np.duration)}</span></div>`;
  const NOTE = {
    sample: 'The music bot isn’t connected yet. These rooms are made-up examples, but every button really works on them so you can try the player.',
    offline: 'Lost touch with the music bot. Showing the last known state while we retry.',
  };

  const paintList = (s) => { list.innerHTML = s.rooms.map((r) => `<button type="button" role="listitem" class="panel mu-r${r.id === s.sel ? ' on' : ''}" aria-pressed="${r.id === s.sel}" data-room="${esc(r.id)}"><span class="mu-t"><b>${esc(r.name)}</b><small class="muted">${r.nowPlaying ? esc(r.nowPlaying.title) : 'Nothing playing'}</small></span><span class="mu-l" title="Listening now"><span aria-hidden="true">🎧</span><b class="num">${r.listeners}</b></span></button>`).join(''); list.setAttribute('aria-busy', 'false'); };
  // built once per picked room so the search box keeps focus while the state changes under it
  const build = () => {
    room.innerHTML = `<article class="panel mu-np" data-mu-np></article>
<div class="panel mu-ctl" aria-label="Controls"><button type="button" class="btn" data-mu-pp></button><button type="button" class="btn ghost" data-mu-skip>⏭ Skip</button><label class="mu-vol"><span aria-hidden="true">🔉</span><input type="range" min="0" max="100" step="5" data-mu-vol aria-label="Volume"><b class="num" data-mu-volv></b></label></div>
<section class="panel mu-search"><label class="eyebrow" for="mu-q">Add a song</label><input id="mu-q" class="mu-q" type="search" placeholder="Search a song to add" autocomplete="off" enterkeyhint="search"><div class="mu-res" data-mu-res aria-live="polite"></div></section>
<section class="panel mu-queue" data-mu-queue></section>`;
    clearTimeout(qtimer); found = []; qseq++;
  };
  const paintRes = (rows, msg = '') => {
    found = rows || [];
    d.querySelector('[data-mu-res]').innerHTML = msg ? `<p class="muted small">${esc(msg)}</p>` : `<ul>${found.map((x, i) => `<li><span class="mu-qt"><b>${esc(x.title)}</b><small class="muted">${esc(x.artist)} · ${clock(x.duration)}</small></span><button type="button" class="btn ghost" data-add="${i}" aria-label="Add ${esc(x.title)} to the queue">＋ Add</button></li>`).join('')}</ul>`;
  };
  function paint(s) {
    paintList(s);
    note.hidden = s.conn === 'live'; if (!note.hidden) note.querySelector('[data-mu-msg]').textContent = NOTE[s.conn] || NOTE.sample;
    note.querySelector('.sample').hidden = s.conn !== 'sample';
    const r = store.room(); if (!r) { room.innerHTML = ''; built = ''; return; }
    if (built !== r.id) { build(); built = r.id; }
    const np = r.nowPlaying, p = played(np, r.paused), off = s.conn === 'offline';
    room.querySelector('[data-mu-np]').innerHTML = `<div class="mu-art">${art(np)}</div><div class="mu-info"><span class="eyebrow">${np ? (r.paused ? '⏸ Paused' : '▶ Now playing') : 'Quiet'}</span><h3>${np ? esc(np.title) : 'Nothing playing right now'}</h3><p class="muted">${np ? esc(np.artist) : 'Search a song below and add it to start the music.'}</p>${np ? bar(np, p) : ''}</div>`;
    const pp = room.querySelector('[data-mu-pp]'), sk = room.querySelector('[data-mu-skip]'), vol = room.querySelector('[data-mu-vol]');
    pp.textContent = r.paused ? '▶ Play' : '⏸ Pause'; pp.disabled = !np || off; sk.disabled = !np || off; vol.disabled = off;
    if (d.activeElement !== vol) vol.value = r.volume; room.querySelector('[data-mu-volv]').textContent = vol.value + '%';
    room.querySelector('[data-mu-queue]').innerHTML = `<h3>Up next <span class="muted num">${r.queue.length}</span></h3>${r.queue.length ? `<ol>${r.queue.map((q, i) => `<li><span class="mu-n num">${i + 1}</span><span class="mu-qt"><b>${esc(q.title)}</b><small class="muted">${esc(q.artist)}${q.by.name ? ` · added by ${esc(q.by.name)}` : ''}</small></span><span class="num muted">${clock(q.duration)}</span>${(owner || (me.id && q.by.id === me.id)) && !off ? `<button type="button" class="btn ghost mu-rm" data-rm="${esc(q.id)}" aria-label="Remove ${esc(q.title)} from the queue">✕</button>` : ''}</li>`).join('')}</ol>` : '<p class="muted small">The queue is empty. Songs people add land here.</p>'}`;
  }
  const run = async (type, arg, okMsg) => { const r = await store.cmd(type, arg); if (!r.ok) B.toast(r.error); else if (okMsg) B.toast(okMsg, 'ok'); };

  list.addEventListener('click', (e) => { const b = e.target.closest('[data-room]'); if (b && b.dataset.room !== store.get().sel) store.select(b.dataset.room); });
  room.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t || t.disabled) return; const r = store.room(); if (!r) return;
    if (t.matches('[data-mu-pp]')) run(r.paused ? 'resume' : 'pause');
    else if (t.matches('[data-mu-skip]')) run('skip');
    else if (t.dataset.rm) run('remove', { id: t.dataset.rm });
    else if (t.dataset.add != null && found[+t.dataset.add]) { const x = found[+t.dataset.add]; run('add', { track: x }, r.nowPlaying ? 'Added to the queue' : 'Starting it now'); }
  });
  room.addEventListener('input', (e) => {
    if (e.target.matches('[data-mu-vol]')) room.querySelector('[data-mu-volv]').textContent = e.target.value + '%';
    else if (e.target.matches('.mu-q')) {
      const q = e.target.value.trim(); clearTimeout(qtimer); const n = ++qseq;
      if (q.length < 2) return paintRes([], q ? 'Keep typing…' : '');
      paintRes([], 'Searching…');
      qtimer = setTimeout(async () => { try { const rows = await store.search(q); if (rows && n === qseq) paintRes(rows, rows.length ? '' : 'No songs found for that.'); } catch { if (n === qseq) paintRes([], 'Search is not available right now.'); } }, 250);
    }
  });
  room.addEventListener('change', (e) => { if (e.target.matches('[data-mu-vol]')) run('volume', { v: +e.target.value }); });

  const http = MM.httpTransport({ get: (p) => B.call(p), post: (p, b) => B.post(p, b) });
  const real = host.dataset.socket ? MM.socketTransport({ url: host.dataset.socket, http }) : http;
  // real rows win: start in practice mode, probe the bot now and every 30 s, switch for good when rows arrive
  const probe = async () => { let rows = []; try { rows = MM.norm(await B.call('/api/music/rooms')); } catch {} if (!rows.length) return false; store.use(real); return true; };
  const boot = async () => {
    list.innerHTML = '<div class="panel"><span class="sk" style="height:64px;display:block"></span></div>';
    if (await probe()) return;
    store.use(MM.sampleTransport(me));
    const i = setInterval(async () => { if (!d.hidden && await probe()) clearInterval(i); }, 30e3);
  };
  // one clock for the progress bar (the room state only changes on events)
  setInterval(() => { const r = store.room(), pos = room.querySelector('[data-mu-pos]'); if (!r?.nowPlaying || !pos || d.hidden) return; const np = r.nowPlaying, q = played(np, r.paused), b = room.querySelector('.mu-bar'); pos.textContent = clock(q); b.querySelector('i').style.width = (np.duration ? Math.round((q / np.duration) * 100) : 0) + '%'; b.setAttribute('aria-valuenow', q); }, 1000);
  B.flag('music').then((on) => { host.querySelector('[data-mu-on]').hidden = !on; host.querySelector('[data-mu-off]').hidden = on; if (on) boot(); });
})();
