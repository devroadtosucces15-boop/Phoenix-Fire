// PhoenixDialog (PF-040): one behaviour for every pop-up, whoever built it. Any element with role=dialog + aria-modal, or one of the
// known sheet/modal classes, is adopted when it appears: Tab stays inside it, Esc closes it, the browser/phone Back button closes it
// (and not the page), focus returns to what opened it, and on phones a bottom sheet gets a grab handle you can drag down.
// Closing always goes through the dialog's own close button, so each page's own cleanup still runs. New code can use
// PhoenixDialog.open({title, html|node, onClose}) and PhoenixDialog.confirm(message, {yes, danger}) -> Promise<boolean>.
(function () {
  'use strict';
  var d = document, w = window;
  var SEL = '[role=dialog][aria-modal=true],.mx-sheet,.br-modal,.wtp-modal,#awardfx,.cx-drawer';
  var SHEET = /(^|\s)(mx-sheet|cx-drawer|br-modal|ph-dialog)(\s|$)/;
  var CLOSER = '[data-ph-close],[data-x],[data-gr-close],.cx-x,.gr-x,.wtp-x,.hdr-pal-x,button[aria-label="Close"],button[aria-label="Dismiss"]';
  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  var stack = [], lastOutside = null, ignorePop = 0, uid = 0;

  // pure helper: where Tab goes inside a trap of n items, from index i (-1 = outside). Returns the target index.
  function trapIndex(i, n, shift) {
    if (!(n > 0)) return -1;
    if (i < 0) return shift ? n - 1 : 0;
    return shift ? (i === 0 ? n - 1 : i - 1) : (i === n - 1 ? 0 : i + 1);
  }
  // pure helper: should a drag of dy pixels (over ms) close a sheet?
  function dragCloses(dy, ms) { return dy > 90 || (dy > 30 && ms > 0 && dy / ms > 0.5); }

  function visible(el) { return !!(el.offsetWidth || el.offsetHeight || (el.getClientRects && el.getClientRects().length)); }
  function items(root) { return Array.prototype.filter.call(root.querySelectorAll(FOCUSABLE), visible); }
  function closerOf(root) { return root.querySelector(CLOSER); }
  function topOf() { for (var i = stack.length - 1; i >= 0; i--) if (stack[i].el.isConnected) return stack[i]; return null; }

  function dismiss(rec) {
    var el = rec.el, c = closerOf(el);
    if (c) { c.click(); }
    else { try { el.click(); } catch (e) {} }
    if (el.isConnected && !el.classList.contains('out')) { rec.forced = true; el.remove(); sweep(); }
  }

  function grab(rec) {
    if (!SHEET.test(rec.el.className)) return;
    var panel = rec.el.querySelector('.mx-sheet-body,.br-sheet') || rec.el;
    if (panel.querySelector('.ph-grab')) return;
    var g = d.createElement('i'); g.className = 'ph-grab'; g.setAttribute('aria-hidden', 'true');
    panel.classList.add('ph-has-grab'); panel.insertBefore(g, panel.firstChild);
    var y0 = 0, t0 = 0, drag = false;
    g.addEventListener('pointerdown', function (e) { drag = true; y0 = e.clientY; t0 = Date.now(); try { g.setPointerCapture(e.pointerId); } catch (x) {} panel.style.transition = 'none'; });
    g.addEventListener('pointermove', function (e) { if (!drag) return; var dy = Math.max(0, e.clientY - y0); panel.style.transform = 'translateY(' + dy + 'px)'; });
    function end(e) {
      if (!drag) return; drag = false; var dy = Math.max(0, e.clientY - y0);
      panel.style.transition = ''; panel.style.transform = '';
      if (dragCloses(dy, Date.now() - t0)) dismiss(rec);
    }
    g.addEventListener('pointerup', end); g.addEventListener('pointercancel', function () { drag = false; panel.style.transition = ''; panel.style.transform = ''; });
  }

  function adopt(el) {
    if (el.getAttribute('data-ph-dlg') || (el.closest && el.parentNode && el.parentNode.closest && el.parentNode.closest('[data-ph-dlg]'))) return;
    var rec = { el: el, id: ++uid, opener: lastOutside, forced: false };
    el.setAttribute('data-ph-dlg', rec.id);
    if (el.getAttribute('role') !== 'dialog' && !el.querySelector('[role=dialog]')) el.setAttribute('role', 'dialog');
    if (el.getAttribute('role') === 'dialog') el.setAttribute('aria-modal', 'true');
    if (!el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')) {
      var h = el.querySelector('h1,h2,h3,h4'); el.setAttribute('aria-label', h && h.textContent.trim() ? h.textContent.trim() : 'Dialog');
    }
    stack.push(rec); grab(rec);
    try { history.pushState({ phDlg: rec.id }, ''); rec.pushed = true; } catch (e) {}
    if (!el.contains(d.activeElement)) {
      var f = el.querySelector('[data-focus]') || items(el)[0];
      if (!f) { el.setAttribute('tabindex', '-1'); f = el; }
      try { f.focus(); } catch (e) {}
    }
  }

  // a dialog left the page: give focus back, and drop its history step unless Back already did
  function sweep() {
    for (var i = stack.length - 1; i >= 0; i--) {
      var rec = stack[i]; if (rec.el.isConnected) continue;
      stack.splice(i, 1);
      var o = rec.opener; if (o && o.isConnected && !topOf()) { try { o.focus(); } catch (e) {} }
      if (rec.pushed && !rec.back && history.state && history.state.phDlg === rec.id) { ignorePop++; try { history.back(); } catch (e) { ignorePop--; } }
    }
  }

  function scan(root) {
    if (root.nodeType !== 1) return;
    if (root.matches && root.matches(SEL)) adopt(root);
    var all = root.querySelectorAll ? root.querySelectorAll(SEL) : [];
    for (var i = 0; i < all.length; i++) adopt(all[i]);
  }

  d.addEventListener('focusin', function (e) { var t = e.target; if (t && t.closest && !t.closest('[data-ph-dlg]')) lastOutside = t; }, true);
  d.addEventListener('keydown', function (e) {
    var rec = topOf(); if (!rec) return;
    if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); dismiss(rec); return; }
    if (e.key !== 'Tab') return;
    var list = items(rec.el); if (!list.length) { e.preventDefault(); return; }
    var i = list.indexOf(d.activeElement), n = trapIndex(i, list.length, e.shiftKey);
    if (i < 0 || (!e.shiftKey && i === list.length - 1) || (e.shiftKey && i === 0)) { e.preventDefault(); list[n].focus(); }
  }, true);
  w.addEventListener('popstate', function () {
    if (ignorePop > 0) { ignorePop--; return; }
    var rec = topOf(); if (!rec) return;
    rec.back = true; dismiss(rec); sweep();
  });

  function start() {
    scan(d.body);
    new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) for (var j = 0; j < ms[i].addedNodes.length; j++) scan(ms[i].addedNodes[j]);
      sweep();
    }).observe(d.body, { childList: true, subtree: true });
  }
  if (d.body) start(); else d.addEventListener('DOMContentLoaded', start);

  // ---- API for new code ----
  function open(o) {
    o = o || {};
    var el = d.createElement('div'), p = d.createElement('div'), x = d.createElement('button'), h = d.createElement('h3'), body = d.createElement('div');
    el.className = 'ph-dialog'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', o.title || 'Dialog');
    p.className = 'ph-dialog-panel'; x.type = 'button'; x.className = 'ph-dialog-x'; x.setAttribute('aria-label', 'Close'); x.setAttribute('data-ph-close', ''); x.textContent = '×';
    h.className = 'ph-dialog-h'; h.textContent = o.title || ''; body.className = 'ph-dialog-b';
    if (o.node) body.appendChild(o.node); else if (o.html != null) body.innerHTML = o.html;
    p.appendChild(x); if (o.title) p.appendChild(h); p.appendChild(body); el.appendChild(p);
    var done = false;
    function close(v) { if (done) return; done = true; el.classList.add('out'); setTimeout(function () { el.remove(); sweep(); }, 200); if (o.onClose) { try { o.onClose(v); } catch (e) {} } }
    x.addEventListener('click', function () { close(false); });
    el.addEventListener('mousedown', function (e) { if (e.target === el) close(false); });
    d.body.appendChild(el);
    return { el: el, close: close, body: body };
  }
  function confirm(msg, o) {
    o = o || {};
    return new Promise(function (res) {
      var b = d.createElement('div'), row = d.createElement('div'), y = d.createElement('button'), n = d.createElement('button'), t = d.createElement('p'), api;
      t.className = 'ph-dialog-msg'; t.textContent = msg; row.className = 'ph-dialog-row';
      y.type = 'button'; y.className = 'ph-dialog-btn' + (o.danger === false ? '' : ' danger'); y.textContent = o.yes || 'Remove'; y.setAttribute('data-focus', '');
      n.type = 'button'; n.className = 'ph-dialog-btn'; n.textContent = o.no || 'Cancel';
      row.appendChild(n); row.appendChild(y); b.appendChild(t); b.appendChild(row);
      api = open({ title: o.title || '', node: b, onClose: function (v) { res(v === true); } });
      if (!o.title) api.el.setAttribute('aria-label', msg);
      y.addEventListener('click', function () { api.close(true); }); n.addEventListener('click', function () { api.close(false); });
    });
  }

  w.PhoenixDialog = { open: open, confirm: confirm, trapIndex: trapIndex, dragCloses: dragCloses, count: function () { return stack.filter(function (r) { return r.el.isConnected; }).length; } };
})();
