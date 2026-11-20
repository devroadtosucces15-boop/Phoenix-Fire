// PhoenixNotices (PF-039): one notice queue for the whole site. Stacked up to 3, errors stay until dismissed, optional Undo,
// a progress line that shows the time left. the motion toast delegates here, so every page's old toast wrapper lands in one place.
(function () {
  'use strict';
  var d = document, MAX = 3, DEF_MS = 4000, ICONS = { err: '⚠️', ok: '✅', '': '🔔' };
  var live = [], waiting = [], box;

  function ensureBox() {
    if (box && box.isConnected) return box;
    box = d.createElement('div'); box.id = 'ph-notices'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite');
    d.body.appendChild(box); return box;
  }
  function pump() {
    while (waiting.length && live.length < MAX) mount(waiting.shift());
  }
  function close(n, how) {
    if (n.closed) return; n.closed = true; clearTimeout(n.timer);
    var i = live.indexOf(n); if (i > -1) live.splice(i, 1);
    n.el.classList.add('ph-out');
    setTimeout(function () { n.el.remove(); pump(); }, 220);
    if (how === 'timeout' && n.opts.onExpire) { try { n.opts.onExpire(); } catch (e) {} }
  }
  function arm(n) {
    if (n.sticky) return;
    n.left = n.left == null ? n.ms : n.left; n.t0 = Date.now();
    n.bar.style.animation = 'none'; void n.bar.offsetWidth;
    n.bar.style.animation = 'phNoticeBar ' + n.left + 'ms linear forwards';
    n.bar.style.animationPlayState = 'running';
    clearTimeout(n.timer); n.timer = setTimeout(function () { close(n, 'timeout'); }, n.left);
  }
  function hold(n) { if (n.sticky || n.closed) return; clearTimeout(n.timer); n.left = Math.max(400, n.left - (Date.now() - n.t0)); n.bar.style.animationPlayState = 'paused'; }

  function mount(n) {
    var o = n.opts, kind = o.kind || '', el = d.createElement('div'), ic = d.createElement('span'), tx = d.createElement('span');
    el.className = 'ph-notice' + (kind ? ' ' + kind : ''); el.setAttribute('role', kind === 'err' ? 'alert' : 'status');
    ic.className = 'ph-n-ic'; ic.setAttribute('aria-hidden', 'true'); ic.textContent = o.icon || ICONS[kind] || ICONS[''];
    tx.className = 'ph-n-tx'; tx.textContent = n.msg; el.appendChild(ic); el.appendChild(tx);
    if (typeof o.undo === 'function') {
      var u = d.createElement('button'); u.type = 'button'; u.className = 'ph-n-undo'; u.textContent = o.undoLabel || 'Undo';
      u.onclick = function (e) { e.stopPropagation(); try { o.undo(); } catch (x) {} close(n, 'undo'); }; el.appendChild(u);
    }
    var x = d.createElement('button'); x.type = 'button'; x.className = 'ph-n-x'; x.setAttribute('aria-label', 'Dismiss notice'); x.textContent = '×';
    x.onclick = function (e) { e.stopPropagation(); close(n, 'dismiss'); }; el.appendChild(x);
    n.sticky = !!o.sticky || kind === 'err' && o.sticky !== false;
    n.ms = o.ms || DEF_MS;
    if (!n.sticky) { n.bar = d.createElement('i'); n.bar.className = 'ph-n-bar'; n.bar.setAttribute('aria-hidden', 'true'); el.appendChild(n.bar); }
    el.addEventListener('click', function () { close(n, 'dismiss'); });
    el.addEventListener('mouseenter', function () { hold(n); }); el.addEventListener('mouseleave', function () { if (!n.closed && !n.sticky) arm(n); });
    el.addEventListener('focusin', function () { hold(n); }); el.addEventListener('focusout', function () { if (!n.closed && !n.sticky) arm(n); });
    n.el = el; live.push(n); ensureBox().appendChild(el); arm(n);
  }

  function show(msg, opts) {
    opts = opts || {};
    // an identical notice already showing is not repeated; its timer restarts instead
    for (var i = 0; i < live.length; i++) if (live[i].msg === String(msg) && (live[i].opts.kind || '') === (opts.kind || '') && !opts.undo) { if (!live[i].sticky) { live[i].left = null; arm(live[i]); } return live[i].el; }
    var n = { msg: String(msg), opts: opts, closed: false };
    if (live.length < MAX) mount(n); else waiting.push(n);
    return n.el || null;
  }
  function wrap(M) { return function (m, err) { return show(m, { kind: err ? 'err' : 'ok' }); }; }
  function clear() { waiting.length = 0; live.slice().forEach(function (n) { close(n, 'clear'); }); }

  window.PhoenixNotices = {
    show: show, clear: clear, wrap: wrap, MAX: MAX,
    ok: function (m, o) { return show(m, Object.assign({ kind: 'ok' }, o)); },
    err: function (m, o) { return show(m, Object.assign({ kind: 'err' }, o)); },
    info: function (m, o) { return show(m, o); },
    // toast(msg, true|false|'err'|'ok') for the old (m, err) call shape
    toast: function (m, err) { return show(m, { kind: err ? 'err' : 'ok' }); },
    count: function () { return live.length; }
  };
})();
