/* Overlay Studio: edits the overlay config (overlay-core.js), previews it live in overlay.html and hands out the OBS links.
   The config lives in the link itself (cfg=…), plus this browser's storage so it is still here next time. Nothing is sent anywhere. */
(function () {
  'use strict';
  var O = window.PFOverlay, B = O.brand, KEY = 'phoenix.overlay.studio', $ = function (id) { return document.getElementById(id); };
  var store = (function () { try { localStorage.setItem('_t', '1'); localStorage.removeItem('_t'); return localStorage; } catch (e) { return { getItem: function () { return null; }, setItem: function () {} }; } })();
  var el = function (tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };
  var root = document.documentElement.style;
  if (B.accent) root.setProperty('--accent', B.accent); if (B.ink) root.setProperty('--ink', B.ink); if (B.goldTop) root.setProperty('--gold', B.goldTop);

  var cfg = (function () { var q = new URLSearchParams(location.search).get('cfg'); return O.decode(q != null ? q : store.getItem(KEY) || ''); })();
  var get = function (p) { return p.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, cfg); };
  var set = function (p, v) { var k = p.split('.'), last = k.pop(), o = k.reduce(function (a, x) { return a[x]; }, cfg); o[last] = v; changed(); };
  var POS = [['tl', 'Top left'], ['tc', 'Top middle'], ['tr', 'Top right'], ['cl', 'Middle left'], ['c', 'Centre'], ['cr', 'Middle right'], ['bl', 'Bottom left'], ['bc', 'Bottom middle'], ['br', 'Bottom right']];
  var SOUND = [['chime', 'Chime'], ['horn', 'Fanfare'], ['fire', 'Fire whoosh'], ['none', 'Silent']], STYLE = [['ember', 'Ember'], ['gold', 'Gold'], ['silver', 'Silver']];
  var NAMES = { follow: 'New follower', sub: 'New sub', resub: 'Resub', giftsub: 'Gift sub', giftbomb: 'Gift bomb', bits: 'Bits', raid: 'Raid', goal: 'Goal met', clip: 'Clip reaction' };

  /* ---------- tiny form kit ---------- */
  function wrap(label, node, hint) { var f = el('label', 'fld'); f.appendChild(el('span', '', label)); f.appendChild(node); var out = document.createDocumentFragment(); out.appendChild(f); if (hint) out.appendChild(el('p', 'hint', hint)); return out; }
  function text(label, path, o) { o = o || {}; var i = el('input'); i.type = o.type || 'text'; i.value = get(path) == null ? '' : get(path); if (o.ph) i.placeholder = o.ph; if (o.max) i.maxLength = o.max; i.autocomplete = 'off'; i.spellcheck = false; i.oninput = function () { set(path, i.value); }; return wrap(label, i, o.hint); }
  function num(label, path, o) { o = o || {}; var i = el('input'); i.type = 'number'; i.min = o.min != null ? o.min : 0; if (o.max != null) i.max = o.max; if (o.step) i.step = o.step; var sc = o.scale || 1; i.value = (get(path) || 0) / sc; i.oninput = function () { set(path, (Number(i.value) || 0) * sc); }; return wrap(label, i, o.hint); }
  function range(label, path) { var i = el('input'); i.type = 'range'; i.min = 0; i.max = 1; i.step = 0.05; i.value = get(path); i.oninput = function () { set(path, Number(i.value)); }; return wrap(label + ' (' + Math.round(get(path) * 100) + '%)', i); }
  function select(label, path, opts) { var s = el('select'); opts.forEach(function (o) { var op = el('option', '', o[1]); op.value = o[0]; s.appendChild(op); }); s.value = get(path); s.onchange = function () { set(path, s.value); }; return wrap(label, s); }
  function check(label, path, hint) { var w = el('label', 'chk'), i = el('input'); i.type = 'checkbox'; i.checked = !!get(path); i.onchange = function () { set(path, i.checked); }; w.appendChild(i); w.appendChild(el('span', '', label)); var f = document.createDocumentFragment(); f.appendChild(w); if (hint) f.appendChild(el('p', 'hint', hint)); return f; }
  function csv(label, path, o) { o = o || {}; var i = el('input'); i.type = 'text'; i.value = (get(path) || []).join(', '); i.oninput = function () { var v = i.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean); set(path, o.numbers ? v.map(Number).filter(function (x) { return x > 0; }) : v); }; return wrap(label, i, o.hint); }
  function multi(label, path, opts, hint) { var box = el('div'), cur = get(path) || []; opts.forEach(function (o) { var w = el('label', 'chk'), i = el('input'); i.type = 'checkbox'; i.checked = cur.indexOf(o[0]) > -1; i.onchange = function () { var now = get(path).filter(function (x) { return x !== o[0]; }); if (i.checked) now.push(o[0]); set(path, now); }; w.appendChild(i); w.appendChild(el('span', '', o[1])); box.appendChild(w); }); return wrap(label, box, hint); }
  function grid(cls) { var g = el('div', cls); for (var i = 1; i < arguments.length; i++) g.appendChild(arguments[i]); return g; }
  function section(title, open) { var d = el('details'); if (open) d.open = true; d.appendChild(el('summary', '', title)); return d; }
  function add(p) { for (var i = 1; i < arguments.length; i++) p.appendChild(arguments[i]); return p; }

  /* ---------- form ---------- */
  var VARS = 'Use {name} {tier} {months} {recipient} {count} {amount} {viewers} {label} {target} in the text.';
  function form() {
    var f = $('form'); f.textContent = '';
    var s1 = section('1 · Channel and sources', true);
    add(s1, text('Twitch channel', 'source.channel', { ph: 'yourchannel', hint: 'Subs, gifts, raids, bits and clip links are read from this channel’s public chat. No login, nothing to install.' }),
      check('Read Twitch chat', 'source.irc'), check('Also read the club feed (follows)', 'source.feed', 'Twitch only tells a channel about new follows through its API. The club Worker receives them and this page polls them.'),
      grid('g2', text('Feed address', 'source.feedUrl', { ph: 'https://…/api/stream/events', hint: 'https only.' }), text('Feed key', 'source.feedKey', { type: 'password', hint: 'The overlay read key set on the Worker.' })),
      multi('Count these from the feed', 'source.feedTypes', [['follow', 'Follows'], ['sub', 'Subs'], ['giftbomb', 'Gift bombs'], ['bits', 'Bits'], ['raid', 'Raids']], 'Leave subs, bits and raids off when chat already supplies them, or each one is shown twice.'),
      text('Line under every alert (optional)', 'brand.motto', { hint: 'Your club’s motto or channel name.' }));

    var s2 = section('2 · Alert box', true);
    add(s2, grid('g3', select('Where it sits', 'alerts.pos', POS), num('Pause between alerts (seconds)', 'alerts.gap', { scale: 1000, step: 0.1 }), num('Merge follow bursts at', 'alerts.mergeFollows', { min: 2 })), range('Volume', 'alerts.volume'),
      check('Alert box on', 'alerts.on'), check('Calm mode (no motion, no sparks)', 'alerts.calm'), el('p', 'hint', VARS));
    O.TYPES.filter(function (k) { return k !== 'clip'; }).forEach(function (k) { // clips have their own section
      var p = 'alerts.types.' + k, c = el('div', 'card'), hd = el('div', 'hd'); hd.appendChild(el('span', '', NAMES[k])); c.appendChild(hd);
      add(c, check('On', p + '.on'), grid('g2', text('Small heading', p + '.title', { max: 40 }), text('Icon (emoji)', p + '.icon', { max: 8 })), text('Message', p + '.text', { max: 140 }),
        grid('g3', num('On screen (seconds)', p + '.dur', { scale: 1000, min: 2, max: 30 }), select('Sound', p + '.sound', SOUND), select('Look', p + '.style', STYLE)));
      if (k === 'bits') add(c, num('Only from this many bits', p + '.min'));
      s2.appendChild(c);
    });

    var s3 = section('3 · Goal bars', false);
    add(s3, grid('g2', select('Where it sits', 'goals.pos', POS), check('Goal bars on', 'goals.on')), el('p', 'hint', 'The bar fills as follows, subs or bits arrive. Add steps (50, 100, 250) to chain goals: each one is celebrated, then the bar moves to the next. “Counts now” is where the bar starts; change it and the saved count resets.'));
    cfg.goals.list.forEach(function (g, i) {
      var p = 'goals.list.' + i, c = el('div', 'card'), hd = el('div', 'hd'), rm = el('button', '', 'Remove'); rm.type = 'button'; rm.onclick = function () { cfg.goals.list.splice(i, 1); changed(true); };
      hd.appendChild(el('span', '', g.label || 'Goal')); hd.appendChild(rm); c.appendChild(hd);
      add(c, grid('g2', text('Name', p + '.label', { max: 40 }), select('Counts', p + '.kind', [['follow', 'Follows'], ['sub', 'Subs (tier 2 = 2, tier 3 = 6)'], ['bits', 'Bits']])),
        grid('g3', num('Counts now', p + '.current'), num('Target', p + '.target', { min: 1 }), text('Unit word', p + '.unit', { max: 16, ph: 'followers' })),
        csv('Steps (optional, comma separated)', p + '.steps', { numbers: true, hint: 'Replaces the single target. Example: 50, 100, 250' }), text('Celebration text', p + '.metText', { max: 24 }));
      s3.appendChild(c);
    });
    var addG = el('button', '', '+ Add a goal'); addG.type = 'button'; addG.onclick = function () { if (cfg.goals.list.length < 6) { cfg.goals.list.push({ id: 'goal' + Date.now().toString(36), kind: 'follow', label: 'New goal', current: 0, target: 50, steps: [], metText: 'GOAL MET', unit: 'followers' }); changed(true); } }; s3.appendChild(addG);

    var s4 = section('4 · Clip reactions', false);
    add(s4, grid('g2', select('Where it sits', 'clips.pos', POS), check('Clip reactions on', 'clips.on')),
      multi('Who can play a clip on stream', 'clips.allow', [['broadcaster', 'You (broadcaster)'], ['moderator', 'Moderators'], ['vip', 'VIPs'], ['subscriber', 'Subscribers'], ['viewer', 'Anyone']], 'Someone posts a Twitch clip link in chat and it plays here. Keep this to trusted roles.'),
      check('Only when the message has the command', 'clips.needCmd'), grid('g3', text('Command', 'clips.cmd', { max: 20 }), num('Longest it plays (seconds)', 'clips.maxSec', { min: 5, max: 60 }), text('Tag on the frame', 'clips.label', { max: 12 })),
      check('Play the clip muted', 'clips.muted'), check('Show chat reactions on the clip', 'clips.reactions.on', 'While the clip plays, matching chat words float up and are tallied under it.'),
      csv('Reaction words', 'clips.reactions.words', { hint: 'Comma separated. Emotes and words both work.' }), num('Most floating at once', 'clips.reactions.max', { max: 40 }));
    add(f, s1, s2, s3, s4);
  }

  /* ---------- preview, links, tests ---------- */
  var frame = $('pv'), enc = '', timer = 0, origin = location.origin;
  function built() { return O.build(cfg); }
  function base() { return new URL('./', location.href).toString(); }
  function linkFor(widget, extra) { var q = []; if (enc) q.push('cfg=' + enc); if (widget !== 'all') q.push('widget=' + widget); if (extra) q.push(extra); return base() + (q.length ? '?' + q.join('&') : ''); }
  function links() {
    var box = $('links'); box.textContent = '';
    [['All in one (recommended)', 'all'], ['Alert box only', 'alerts'], ['Goal bars only', 'goals'], ['Clip reactions only', 'clips']].forEach(function (x) {
      var d = el('div', 'link'), r = el('div', 'row'), i = el('input'), b = el('button', 'go', 'Copy'); i.readOnly = true; i.value = linkFor(x[1]); i.onfocus = function () { i.select(); };
      b.type = 'button'; b.onclick = function () { copy(i.value, b); }; d.appendChild(el('b', '', x[0])); r.appendChild(i); r.appendChild(b); d.appendChild(r); box.appendChild(d);
    });
    [['Open a self-running demo', 'demo=1&bg=1'], ['Open with a connection light (checks chat and the feed)', 'debug=1&bg=1']].forEach(function (x) { var a = el('a', '', x[0]); a.href = linkFor('all', x[1]); a.target = '_blank'; a.rel = 'noopener'; a.style.cssText = 'display:block;color:var(--gold);font-size:14px;margin:4px 0'; box.appendChild(a); });
  }
  function copy(v, b) { var ok = function () { var t = b.textContent; b.textContent = 'Copied'; setTimeout(function () { b.textContent = t; }, 1400); }; if (navigator.clipboard) navigator.clipboard.writeText(v).then(ok, function () { fallback(v, ok); }); else fallback(v, ok); }
  function fallback(v, ok) { var t = el('textarea'); t.value = v; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); ok(); } catch (e) { /* the field is selectable */ } t.remove(); }
  function post(o) { try { frame.contentWindow.postMessage(Object.assign({ pf: 'overlay' }, o), origin); } catch (e) { /* not loaded yet */ } }
  function scale() { var w = frame.parentNode.clientWidth; frame.style.transform = 'scale(' + w / 1920 + ')'; }
  function changed(rebuild) {
    enc = O.encode(built()); try { store.setItem(KEY, enc); } catch (e) { /* ignore */ }
    clearTimeout(timer); timer = setTimeout(function () { post({ cmd: 'cfg', cfg: enc }); links(); tests(); }, 180);
    if (rebuild) form();
  }
  function tests() {
    var t = $('tests'), g = $('goaltests'), c = $('chattests'); [t, g, c].forEach(function (n) { n.textContent = ''; });
    O.TYPES.filter(function (k) { return k !== 'goal'; }).forEach(function (k) { var b = el('button', '', NAMES[k] || k); b.type = 'button'; b.onclick = function () { post({ cmd: 'test', type: k }); }; t.appendChild(b); });
    cfg.goals.list.forEach(function (gl) { [1, 10, 50].forEach(function (n) { var b = el('button', '', (gl.label || 'Goal') + ' +' + n); b.type = 'button'; b.onclick = function () { post({ cmd: 'bump', id: gl.id, by: n }); }; g.appendChild(b); }); });
    ['🔥', 'W', 'GG', 'LUL'].forEach(function (w) { var b = el('button', '', 'Chat: ' + w); b.type = 'button'; b.onclick = function () { post({ cmd: 'chat', text: w }); }; c.appendChild(b); });
  }
  $('load').onclick = function () {
    var v = $('paste').value.trim(), m = /[?&]cfg=([\w-]*)/.exec(v), s = m ? m[1] : /^[\w-]+$/.test(v) ? v : null, msg = $('msg');
    if (s == null) { msg.textContent = 'That does not look like an overlay link.'; return; }
    cfg = O.decode(s); form(); changed(); post({ cmd: 'cfg', cfg: O.encode(built()) }); msg.textContent = 'Loaded.';
  };

  frame.src = new URL('./', location.href).toString() + '?studio=1&cfg=' + O.encode(built());
  addEventListener('resize', scale); scale(); enc = O.encode(built()); form(); links(); tests();
  if (window.ResizeObserver) new ResizeObserver(scale).observe(frame.parentNode);
})();
