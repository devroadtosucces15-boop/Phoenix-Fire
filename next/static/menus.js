/* PF-034: keyboard and touch for the pop-up menus (account chip, bell, page navigator, dock ring, owner tools). Same menus, same look.
   One shared script: pages and menu code are not rewritten. A menu is a trigger button with aria-haspopup + aria-expanded and its panel.
   - Esc closes the open menu and puts focus back on the opener.
   - Tapping or clicking outside closes it.
   - ArrowDown / ArrowUp / Home / End move through the items in the panel; ArrowDown on a closed trigger opens it.
   - When a menu closes from the keyboard, focus returns to its opener (not after a mouse or touch close, so touch never jumps).
   Closing always goes through the opener's own click, so the menu's own state stays the single source of truth.
   Pure helpers are exposed as window.PhoenixMenus so tests can run them without a browser. */
(function () {
  var TRIGGERS = '[aria-haspopup][aria-expanded]';
  var PANELS = { ac: '.hdr-menu:not(.hdr-bellp)', 'hdr-bell': '.hdr-bellp', 'nv-fab': '.nv-panel', 'dk-ring': '.dk-nav', 'ofab-btn': '#ofabPanel' };
  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  var kbd = false, openers = [];

  // index to move to for a key inside a menu, or -1 when the key is not ours
  function step(key, i, n) {
    if (!(n > 0)) return -1;
    if (key === 'ArrowDown') return i < 0 ? 0 : (i + 1) % n;
    if (key === 'ArrowUp') return i < 0 ? n - 1 : (i - 1 + n) % n;
    if (key === 'Home') return 0;
    if (key === 'End') return n - 1;
    return -1;
  }

  function panelOf(t) {
    var id = t.getAttribute('aria-controls');
    if (id) return document.getElementById(id);
    var cls = (t.className && t.className.split ? t.className.split(/\s+/) : []);
    for (var i = 0; i < cls.length; i++) if (PANELS[cls[i]]) return document.querySelector(PANELS[cls[i]]);
    return null;
  }
  function isOpen(t) { return t.getAttribute('aria-expanded') === 'true'; }
  function visible(el) { return !el.hidden && !el.closest('[hidden]') && el.getClientRects().length > 0; }
  function items(p) { return Array.prototype.filter.call(p.querySelectorAll(FOCUSABLE), visible); }
  function allTriggers() { return Array.prototype.slice.call(document.querySelectorAll(TRIGGERS)); }
  function openMenus() {
    return allTriggers().filter(isOpen).map(function (t) { return { t: t, p: panelOf(t) }; }).filter(function (m) { return m.p && visible(m.p); });
  }
  function inside(m, node) { return !!node && (m.p.contains(node) || m.t.contains(node)); }

  function onKey(e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    kbd = true;
    var a = document.activeElement, tgt = e.target;
    if (e.key === 'Escape') {
      var ms = openMenus();
      var m = ms.filter(function (x) { return inside(x, tgt) || inside(x, a); })[0] || ms[ms.length - 1];
      if (m) { e.preventDefault(); m.t.click(); setTimeout(function () { m.t.focus(); }, 0); }
      return;
    }
    if (e.shiftKey) return;
    // closed trigger: ArrowDown opens it
    var tr = tgt && tgt.closest ? tgt.closest(TRIGGERS) : null;
    if (tr && e.key === 'ArrowDown' && !isOpen(tr)) { e.preventDefault(); tr.click(); return; }
    var open = openMenus().filter(function (x) { return x.p.contains(tgt) || x.t === tr; })[0];
    if (!open) return;
    if (tgt && /^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName) && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    if (tgt && tgt.tagName === 'TEXTAREA') return;
    var list = items(open.p), i = list.indexOf(tgt);
    var j = step(e.key, i, list.length);
    if (j < 0) return;
    e.preventDefault();
    list[j].focus();
  }

  function onPointer() { kbd = false; }

  // outside tap or click: close through the opener so the menu's own code stays in charge
  function onClick(e) {
    var ms = openMenus();
    if (!ms.length) return;
    var trs = allTriggers();
    var node = e.target;
    if (!node || !document.contains(node)) return;
    if (trs.some(function (t) { return t.contains(node); })) return;
    ms.forEach(function (m) { if (!m.p.contains(node) && isOpen(m.t) && visible(m.p)) m.t.click(); });
  }

  // opened by keyboard: land on the first item; closed by keyboard: go back to the opener
  function onChange(list) {
    list.forEach(function (r) {
      var t = r.target;
      if (!t.matches || !t.matches(TRIGGERS) || r.oldValue === t.getAttribute('aria-expanded')) return;
      var p = panelOf(t);
      if (isOpen(t)) {
        if (openers.indexOf(t) < 0) openers.push(t);
        if (kbd && p) setTimeout(function () {
          var a = document.activeElement;
          if (a && p.contains(a)) return;
          var f = items(p)[0];
          if (f) f.focus({ preventScroll: true });
        }, 30);
      } else {
        openers = openers.filter(function (x) { return x !== t; });
        if (kbd) setTimeout(function () {
          var a = document.activeElement;
          if ((!a || a === document.body || (p && p.contains(a))) && t.isConnected && visible(t)) t.focus({ preventScroll: true });
        }, 0);
      }
    });
  }

  function start() {
    new MutationObserver(onChange).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['aria-expanded'], attributeOldValue: true });
  }

  document.addEventListener('keydown', onKey);
  document.addEventListener('pointerdown', onPointer, true);
  document.addEventListener('click', onClick);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.PhoenixMenus = { step: step, TRIGGERS: TRIGGERS, PANELS: PANELS };
})();
