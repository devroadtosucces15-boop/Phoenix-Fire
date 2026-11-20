/* PF-033: keyboard for chips and tabs. Same look, no markup changes by pages.
   - Tab sets (role="tablist"): items get role="tab", aria-selected follows the highlighted one, only that one is a Tab stop
     (roving tabindex). Arrow keys, Home and End move AND select (automatic activation). The last tab is remembered per page.
   - Filter chip rows (.chips, .chipset, .seg ...): role="group" with a name, aria-pressed follows the highlighted chip, arrows,
     Home and End move focus only (Enter or Space still press it), every chip stays a Tab stop.
   Pure key maths is exposed as window.PhoenixRoving.nextIndex so tests can run it without a browser. */
(function () {
  var GROUPS = '[role="tablist"],.chips,.chipset,.seg,.cc-chips,.cx-chips,.nx-pills';
  var ITEMS = 'button.chip,button.cx-chip,button.nx-pill,button[role="tab"],.seg>button';
  var KEYPREFIX = 'phoenix.tab.';
  var restored = {};

  // index to move to for a key, or -1 when the key is not ours
  function nextIndex(key, i, n) {
    if (!(n > 0)) return -1;
    if (key === 'ArrowRight' || key === 'ArrowDown') return (i + 1) % n;
    if (key === 'ArrowLeft' || key === 'ArrowUp') return (i - 1 + n) % n;
    if (key === 'Home') return 0;
    if (key === 'End') return n - 1;
    return -1;
  }

  function items(g) {
    return Array.prototype.filter.call(g.querySelectorAll(ITEMS), function (el) {
      return el.closest(GROUPS) === g && !el.hidden && !el.disabled;
    });
  }
  function isTabs(g) { return g.getAttribute('role') === 'tablist'; }
  // the look (.on) is the source of truth; aria-selected is only read when no item carries .on
  function chosen(list) {
    var a = list.filter(function (el) { return el.matches('.on'); });
    return a.length ? a : list.filter(function (el) { return el.matches('[aria-selected="true"]'); });
  }

  function ident(el) {
    for (var i = 0; i < el.attributes.length; i++) {
      var a = el.attributes[i];
      if (/^data-/.test(a.name) && a.name !== 'data-dl' && a.name !== 'data-busy') return a.name + '=' + a.value;
    }
    return 'text=' + (el.textContent || '').trim().slice(0, 40);
  }
  function memKey(g) {
    var k = g.id || g.getAttribute('aria-label');
    return k ? KEYPREFIX + location.pathname.split('/').pop() + '|' + k : '';
  }
  function store(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  function enhance(g) {
    var list = items(g);
    if (list.length < 2) return;
    if (isTabs(g)) {
      var cur = chosen(list)[0] || list[0];
      list.forEach(function (el) {
        if (!el.hasAttribute('role')) el.setAttribute('role', 'tab');
        var s = el === cur ? 'true' : 'false';
        if (el.getAttribute('aria-selected') !== s) el.setAttribute('aria-selected', s);
        var ti = el === cur ? '0' : '-1';
        if (el.getAttribute('tabindex') !== ti) el.setAttribute('tabindex', ti);
      });
      remember(g, list, cur);
    } else {
      if (!g.hasAttribute('role')) g.setAttribute('role', 'group');
      if (g.getAttribute('role') === 'group' && !g.hasAttribute('aria-label') && !g.hasAttribute('aria-labelledby')) g.setAttribute('aria-label', 'Filter options');
      var ch = chosen(list);
      if (ch.length) list.forEach(function (el) {
        if (el.hasAttribute('aria-selected')) return;
        var p = ch.indexOf(el) > -1 ? 'true' : 'false';
        if (el.getAttribute('aria-pressed') !== p) el.setAttribute('aria-pressed', p);
      });
    }
  }

  // bring back the last tab once per page load; skipped for deep links and groups that opt out
  function remember(g, list, cur) {
    var k = memKey(g);
    if (!k || restored[k] || g.hasAttribute('data-no-remember')) return;
    restored[k] = 1;
    if (location.hash || list.some(function (el) { return el.hasAttribute('data-dl'); })) return;
    var want = load(k);
    if (!want || want === ident(cur)) return;
    var hit = list.filter(function (el) { return ident(el) === want; })[0];
    if (hit) hit.click();
  }

  function scan(root) {
    var gs = (root || document).querySelectorAll(GROUPS);
    for (var i = 0; i < gs.length; i++) enhance(gs[i]);
  }

  function onKey(e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    var el = e.target && e.target.closest ? e.target.closest(ITEMS) : null;
    if (!el) return;
    var g = el.closest(GROUPS);
    if (!g) return;
    var list = items(g), i = list.indexOf(el);
    if (i < 0 || list.length < 2) return;
    var j = nextIndex(e.key, i, list.length);
    if (j < 0) return;
    e.preventDefault();
    var to = list[j], tabs = isTabs(g);
    to.focus();
    if (tabs && to !== el) { to.click(); refocus(g, j); }
  }

  // a tab press often redraws the whole bar; put focus back on the same position
  function refocus(g, j) {
    setTimeout(function () {
      var a = document.activeElement;
      if (a && a !== document.body && g.contains(a)) return;
      var g2 = g.isConnected ? g : (g.id ? document.getElementById(g.id) : null);
      if (!g2) return;
      enhance(g2);
      var l = items(g2);
      if (l[j]) l[j].focus();
    }, 0);
  }

  function onClick(e) {
    var el = e.target && e.target.closest ? e.target.closest(ITEMS) : null;
    var g = el && el.closest(GROUPS);
    if (!g || !isTabs(g)) return;
    var k = memKey(g);
    if (k) store(k, ident(el));
  }

  function start() {
    scan();
    var pend = 0;
    new MutationObserver(function () {
      if (pend) return;
      pend = 1;
      (window.requestAnimationFrame || setTimeout)(function () { pend = 0; scan(); });
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
  }

  document.addEventListener('keydown', onKey);
  document.addEventListener('click', onClick, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.PhoenixRoving = { nextIndex: nextIndex, scan: scan, GROUPS: GROUPS, ITEMS: ITEMS };
})();
