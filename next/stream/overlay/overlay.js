/* Stream overlay: draws the alert box, goal bars and clip reactions from PFOverlay (overlay-core.js) and listens to the sources.
   URL: /overlay/?cfg=<studio link>&widget=all|alerts,goals,clips  [&demo=1 sample events] [&studio=1 live preview inside the Studio] [&calm=1] [&bg=1 checker background]
   Sources: Twitch chat as an anonymous reader (subs, gifts, raids, bits, clip links) and the Worker feed (follows). Nothing here needs a login. */
(function () {
  'use strict';
  var O = window.PFOverlay, B = O.brand, Q = new URLSearchParams(location.search);
  var cfg = O.decode(Q.get('cfg') || ''), W = (Q.get('widget') || 'all').split(',');
  var on = function (w) { return W.indexOf('all') > -1 || W.indexOf(w) > -1; };
  var STUDIO = Q.get('studio') === '1', $ = function (id) { return document.getElementById(id); };
  var store = (function () { try { localStorage.setItem('_t', '1'); localStorage.removeItem('_t'); return localStorage; } catch (e) { return { getItem: function () { return null; }, setItem: function () {} }; } })();
  var el = function (tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  /* ---------- brand + page setup ---------- */
  var root = document.documentElement.style;
  if (B.accent) root.setProperty('--ov-accent', B.accent); if (B.ink) root.setProperty('--ov-ink', B.ink);
  if (B.goldTop) root.setProperty('--ov-gold-a', B.goldTop); if (B.goldBottom) root.setProperty('--ov-gold-b', B.goldBottom);
  if (STUDIO) document.body.classList.add('studio'); if (Q.get('bg') === '1') document.body.classList.add('checker');
  if (Q.get('calm') === '1' || cfg.alerts.calm) document.body.classList.add('calm');
  var CALM = document.body.classList.contains('calm');
  function place() { [['alerts', 'alerts'], ['goals', 'goals'], ['clips', 'clips']].forEach(function (p) { var n = $(p[0]); n.className = 'slot pos-' + cfg[p[1]].pos + (on(p[0]) && cfg[p[1]].on ? '' : ' hide'); }); }
  place();

  /* ---------- embers (canvas) ---------- */
  var cv = $('fx'), cx = cv.getContext('2d'), parts = [], raf = 0;
  function size() { cv.width = innerWidth; cv.height = innerHeight; } size(); addEventListener('resize', size);
  function burst(x, y, n, spread) {
    if (CALM) return; var cols = [B.accent || '#e8651a', B.goldTop || '#f3c95c', '#ffb347', '#fff3cf'];
    for (var i = 0; i < n; i++) { var a = Math.random() * Math.PI * 2, s = 1.5 + Math.random() * (spread || 7); parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2.5, l: 1, d: 0.008 + Math.random() * 0.014, r: 2 + Math.random() * 4, c: cols[i % cols.length] }); }
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function frame() {
    cx.clearRect(0, 0, cv.width, cv.height);
    parts = parts.filter(function (p) { return p.l > 0; });
    parts.forEach(function (p) { p.x += p.vx; p.y += p.vy; p.vy += 0.09; p.vx *= 0.992; p.l -= p.d; cx.globalAlpha = Math.max(0, p.l); cx.fillStyle = p.c; cx.beginPath(); cx.arc(p.x, p.y, p.r * p.l + 0.5, 0, 6.3); cx.fill(); });
    raf = parts.length ? requestAnimationFrame(frame) : 0; if (!raf) cx.clearRect(0, 0, cv.width, cv.height);
  }
  function burstAt(node, n) { var r = node.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, n, 9); }

  /* ---------- sound (synthesised, so there are no files to host or license) ---------- */
  var ac = null;
  function tone(freq, t0, dur, type, vol) { var o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(0.0001, ac.currentTime + t0); g.gain.exponentialRampToValueAtTime(vol, ac.currentTime + t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t0 + dur); o.connect(g); g.connect(ac.destination); o.start(ac.currentTime + t0); o.stop(ac.currentTime + t0 + dur + 0.05); }
  function sound(kind) {
    var v = cfg.alerts.volume; if (!v || kind === 'none') return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume();
      if (kind === 'chime') { tone(784, 0, 0.5, 'sine', 0.25 * v); tone(1175, 0.12, 0.7, 'sine', 0.22 * v); tone(1568, 0.26, 0.9, 'sine', 0.16 * v); }
      if (kind === 'horn') { [262, 330, 392, 523].forEach(function (f, i) { tone(f, i * 0.1, 0.9, 'triangle', 0.2 * v); }); tone(523, 0.45, 1.1, 'sawtooth', 0.1 * v); }
      if (kind === 'fire') { for (var i = 0; i < 9; i++) tone(180 + i * 55 + Math.random() * 40, i * 0.06, 0.5, 'sawtooth', 0.07 * v); tone(98, 0, 1.4, 'triangle', 0.25 * v); tone(1046, 0.5, 1.0, 'sine', 0.14 * v); }
    } catch (e) { /* no audio is fine */ }
  }

  /* ---------- alert box ---------- */
  var aq = new O.Queue(cfg), busy = false;
  function nodesFor(tpl, v) { // {name} etc. become <b> runs; everything is textContent, so a viewer name can never be markup
    var box = el('div', 'txt'), parts = String(tpl).split(/(\{\w+\})/);
    parts.forEach(function (p) { var m = /^\{(\w+)\}$/.exec(p); if (m) { var val = v[m[1]]; if (val == null || val === '') return; box.appendChild(el(['name', 'recipient', 'count', 'amount', 'months', 'viewers', 'target'].indexOf(m[1]) > -1 ? 'b' : 'span', '', String(val))); } else if (p) box.appendChild(document.createTextNode(p)); });
    box.normalize(); return box;
  }
  function renderAlert(ev) {
    var a = cfg.alerts.types[ev.type], v = O.vars(ev); if (ev.merged) v.name = ev.name;
    var card = el('div', 'alert ' + a.style), badge = el('div', 'badge'), copy = el('div', 'copy');
    var img = el('img'); img.src = B.crest || '../crest-sm.png'; img.alt = ''; badge.appendChild(img); badge.appendChild(el('span', '', a.icon));
    var title = ev.merged ? (ev.count + ' NEW FOLLOWERS') : O.fill(a.title, v);
    copy.appendChild(el('div', 'ttl', title)); copy.appendChild(nodesFor(ev.merged ? '{name}' : a.text, v));
    if (ev.message && (ev.type === 'sub' || ev.type === 'resub' || ev.type === 'bits')) copy.appendChild(el('div', 'msg', ev.message));
    card.appendChild(badge); card.appendChild(copy); if (cfg.brand.motto) card.appendChild(el('div', 'motto', cfg.brand.motto));
    var bar = el('div', 'bar'); card.style.setProperty('--dur', a.dur + 'ms'); card.appendChild(bar);
    return card;
  }
  async function pump() {
    if (busy) return; busy = true;
    for (var ev; (ev = aq.next());) {
      var a = cfg.alerts.types[ev.type], card = renderAlert(ev), slot = $('alerts');
      slot.appendChild(card); sound(a.sound); burstAt(card, ev.type === 'giftbomb' || ev.type === 'raid' || ev.type === 'goal' ? 90 : 36);
      await wait(a.dur); card.classList.add('out'); await wait(CALM ? 10 : 450); card.remove(); await wait(cfg.alerts.gap);
    }
    busy = false;
  }
  function alertNow(ev) { if (!on('alerts') || !cfg.alerts.on) return; if (aq.push(ev)) pump(); }

  /* ---------- goals ---------- */
  var gkey = 'phoenix.overlay.goals.' + (cfg.source.channel || 'demo');
  function loadGoals() { // the running count lives in this browser; the Studio's "current" is the starting point and resets the count when it changes
    var saved = {}; try { saved = JSON.parse(store.getItem(gkey) || '{}'); } catch (e) { saved = {}; }
    cfg.goals.list.forEach(function (g) { var s = saved[g.id]; if (s && s.seed === g.current) g.current = s.cur; });
  }
  var seedOf = {}; cfg.goals.list.forEach(function (g) { seedOf[g.id] = g.current; }); if (!STUDIO) loadGoals();
  function saveGoals() { if (STUDIO) return; var o = {}; cfg.goals.list.forEach(function (g) { o[g.id] = { seed: seedOf[g.id], cur: g.current }; }); try { store.setItem(gkey, JSON.stringify(o)); } catch (e) { /* ignore */ } }
  var gnodes = {};
  function drawGoals(flashId) {
    var box = $('goals'); if (!on('goals') || !cfg.goals.on) return;
    cfg.goals.list.forEach(function (g) {
      var v = O.goalView(g), n = gnodes[g.id];
      if (!n) {
        n = gnodes[g.id] = { root: el('div', 'goal'), lbl: el('div', 'lbl'), num: el('div', 'num'), fill: el('div', 'fill'), l: el('span', 'left'), r: el('span', 'step'), banner: el('div', 'banner') };
        var top = el('div', 'top'), track = el('div', 'track'), sub = el('div', 'sub'); top.appendChild(n.lbl); top.appendChild(n.num); track.appendChild(n.fill); sub.appendChild(n.l); sub.appendChild(n.r);
        [top, track, sub, n.banner].forEach(function (x) { n.root.appendChild(x); }); box.appendChild(n.root);
      }
      n.lbl.textContent = v.label; n.num.textContent = ''; n.num.appendChild(document.createTextNode(v.current.toLocaleString() + ' ')); n.num.appendChild(el('small', '', '/ ' + v.target.toLocaleString()));
      n.fill.style.setProperty('--pct', v.pct + '%'); n.root.classList.toggle('met', v.met);
      n.l.textContent = v.met ? '🎯 ' + g.metText : v.left.toLocaleString() + ' ' + (v.unit || 'to go') + ' to go'; n.r.textContent = v.steps > 1 ? 'Step ' + v.step + ' of ' + v.steps : Math.round((v.current / v.target) * 100) + '%';
      if (flashId === g.id) { n.banner.textContent = g.metText; n.root.classList.remove('flash'); void n.root.offsetWidth; n.root.classList.add('flash'); sound('fire'); burstAt(n.root, 110); }
    });
  }

  /* ---------- clip reactions ---------- */
  var cq = [], cbusy = false, activeRx = null;
  function clipNode(ev) {
    var c = cfg.clips, box = el('div', 'clip'), head = el('div', 'head'), by = el('div', 'by'), frame = el('div', 'frame'), tally = el('div', 'tally'), rx = el('div', 'rx');
    head.appendChild(el('div', 'tag', c.label || 'CLIP')); by.appendChild(document.createTextNode('shared by ')); by.appendChild(el('b', '', ev.name || 'a viewer')); head.appendChild(by);
    if (ev.slug && !ev.demo) {
      var f = document.createElement('iframe'); f.allow = 'autoplay; fullscreen'; f.setAttribute('allowfullscreen', ''); f.referrerPolicy = 'strict-origin-when-cross-origin';
      f.src = 'https://clips.twitch.tv/embed?clip=' + encodeURIComponent(ev.slug) + '&parent=' + encodeURIComponent(location.hostname || 'localhost') + '&autoplay=true&muted=' + (c.muted ? 'true' : 'false'); frame.appendChild(f);
    } else frame.appendChild(el('div', 'ph', 'Clip plays here'));
    frame.appendChild(rx); box.appendChild(head); box.appendChild(frame); if (c.reactions.on) box.appendChild(tally);
    var bar = el('div', 'left'); box.style.setProperty('--dur', c.maxSec * 1000 + 'ms'); frame.appendChild(bar);
    return { box: box, rx: rx, tally: tally, counts: {} };
  }
  async function clipPump() {
    if (cbusy) return; cbusy = true;
    for (var ev; (ev = cq.shift());) {
      var n = clipNode(ev); activeRx = n; $('clips').appendChild(n.box); sound('chime'); burstAt(n.box, 70);
      await wait(cfg.clips.maxSec * 1000); activeRx = null; n.box.classList.add('out'); await wait(CALM ? 10 : 500); n.box.remove(); await wait(600);
    }
    cbusy = false;
  }
  function clipNow(ev) { if (!on('clips') || !cfg.clips.on) return; if (cq.length < 8) cq.push(ev); clipPump(); }
  function chatReaction(text) {
    var n = activeRx; if (!n) return; var w = O.reaction(text, cfg); if (!w) return;
    n.counts[w] = (n.counts[w] || 0) + 1; n.tally.textContent = '';
    Object.keys(n.counts).sort(function (a, b) { return n.counts[b] - n.counts[a]; }).slice(0, 6).forEach(function (k) { var s = el('span', '', k + ' '); s.appendChild(el('b', '', '×' + n.counts[k])); n.tally.appendChild(s); });
    if (n.rx.childElementCount < cfg.clips.reactions.max) { var i = el('i', '', w); i.style.left = 6 + Math.random() * 84 + '%'; n.rx.appendChild(i); setTimeout(function () { i.remove(); }, 3300); }
  }

  /* ---------- one place every event goes through ---------- */
  var seen = new O.Dedupe(45000);
  function handle(ev) {
    if (!ev || !seen.fresh(ev)) return;
    if (ev.type === 'clip') return clipNow(ev);
    if (on('goals') || on('alerts')) { var met = O.applyEvent(cfg, ev); saveGoals(); drawGoals(met[0] && met[0].id); met.forEach(function (m) { if (on('alerts')) alertNow(O.metEvent(m)); }); }
    if (!ev.silent) alertNow(ev);
  }
  window.PFOverlayHandle = handle;

  /* ---------- sources ---------- */
  var chip = null, DEBUG = Q.get('debug') === '1', stat = { chat: '', feed: '' };
  function status(k, msg, ok) { if (!DEBUG) return; stat[k] = (ok ? '● ' : '○ ') + msg; if (!chip) { chip = el('div', 'dbg'); document.body.appendChild(chip); } chip.textContent = [stat.chat, stat.feed].filter(Boolean).join('   '); }
  var ircClient = new O.Irc(), ws, backoff = 1000;
  function connectIrc() {
    if (!cfg.source.irc || !cfg.source.channel) return;
    try { ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443'); } catch (e) { return; }
    ws.onopen = function () { backoff = 1000; status('chat', 'Chat: joining #' + cfg.source.channel, false); ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands'); ws.send('PASS SCHMOOPIIE'); ws.send('NICK justinfan' + (10000 + Math.floor(Math.random() * 80000))); ws.send('JOIN #' + cfg.source.channel); };
    ws.onmessage = function (m) {
      String(m.data).split('\r\n').forEach(function (line) {
        if (!line) return; if (line.indexOf('PING') === 0) return ws.send('PONG :tmi.twitch.tv');
        var p = O.parseIrc(line); if (p.cmd === 'ROOMSTATE' || p.cmd === '366') status('chat', 'Chat: connected to #' + cfg.source.channel, true); if (p.cmd === 'PRIVMSG') chatReaction(p.text);
        var ev = ircClient.event(p, cfg); if (ev) handle(ev);
      });
    };
    ws.onclose = function () { status('chat', 'Chat: reconnecting', false); setTimeout(connectIrc, backoff); backoff = Math.min(30000, backoff * 2); };
  }
  var since = 0, primed = false, feedTimer = 0;
  async function poll() {
    var s = cfg.source;
    try {
      var u = new URL(s.feedUrl); u.searchParams.set('since', String(since)); if (s.feedKey) u.searchParams.set('k', s.feedKey);
      var r = await fetch(u.toString(), { cache: 'no-store' }); status('feed', r.ok ? 'Feed: ok' : 'Feed: error ' + r.status, r.ok); if (r.ok) {
        var d = await r.json();
        if (!primed) { primed = true; since = d.last || 0; } // the first poll only learns where the feed is: old follows are not replayed on a restart
        else (d.events || []).forEach(function (e) { since = Math.max(since, e.n || 0); if (s.feedTypes.indexOf(e.type) > -1) handle(O.fromFeed(e)); });
      }
    } catch (e) { status('feed', 'Feed: cannot reach', false); }
    feedTimer = setTimeout(poll, s.poll);
  }

  /* ---------- Studio preview + demo ---------- */
  var SAMPLES = [
    { type: 'follow', name: 'EmberKid', points: { follow: 1 } }, { type: 'sub', name: 'NorthStandNick', plan: '1000', points: { sub: 1 }, message: 'Up the club!' },
    { type: 'resub', name: 'GoldenBoot9', plan: '2000', months: 12, points: { sub: 2 } }, { type: 'giftsub', name: 'BigSpender', recipient: 'LuckyLad', plan: '1000', points: { sub: 1 } },
    { type: 'giftbomb', name: 'WhaleWatcher', count: 10, points: {} }, { type: 'bits', name: 'CheeseLord', amount: 500, points: { bits: 500 }, message: 'worldie!' },
    { type: 'raid', name: 'FriendlyClub', viewers: 87, points: {} }, { type: 'clip', name: 'ModMax', slug: 'demo-clip', demo: true, points: {} }
  ];
  var demoN = 0;
  function sample(type) { var s = SAMPLES.filter(function (x) { return x.type === type; })[0]; return s && Object.assign({}, s, { id: 'demo-' + type + '-' + (++demoN), at: Date.now(), source: 'demo' }); }
  window.addEventListener('message', function (m) {
    if (m.origin !== location.origin || !m.data || m.data.pf !== 'overlay') return;
    var d = m.data;
    if (d.cmd === 'cfg') { cfg = O.decode(d.cfg || ''); aq = new O.Queue(cfg); Object.keys(gnodes).forEach(function (k) { gnodes[k].root.remove(); delete gnodes[k]; }); cfg.goals.list.forEach(function (g) { seedOf[g.id] = g.current; }); place(); drawGoals(); }
    if (d.cmd === 'test') { var e = sample(d.type); if (e) handle(e); }
    if (d.cmd === 'bump') { var g = cfg.goals.list.filter(function (x) { return x.id === d.id; })[0]; if (g) { var ev = { type: 'follow', id: 'bump-' + (++demoN), name: 'Test', source: 'demo', points: {} }; ev.points[g.kind] = +d.by || 1; var met = O.applyEvent(cfg, ev); saveGoals(); drawGoals(met[0] && met[0].id); met.forEach(function (m2) { alertNow(O.metEvent(m2)); }); } }
    if (d.cmd === 'chat') chatReaction(d.text || '');
  });
  if (Q.get('demo') === '1') {
    var order = ['follow', 'sub', 'giftsub', 'resub', 'bits', 'raid', 'giftbomb', 'clip'], di = 0;
    setInterval(function () { var e = sample(order[di++ % order.length]); if (e.type === 'clip') { clipNow(e); [600, 1400, 2100, 3000].forEach(function (t, i) { setTimeout(function () { chatReaction(['🔥', 'W', 'GG', 'LUL'][i]); }, t); }); } else handle(e); }, 9000);
  }

  drawGoals(); if (!STUDIO) { connectIrc(); if (cfg.source.feed && cfg.source.feedUrl) poll(); } // the Studio preview runs on test events only
  if (parent !== window) parent.postMessage({ pf: 'overlay', ready: true }, location.origin);
})();
