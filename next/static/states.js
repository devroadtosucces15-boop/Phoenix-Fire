// PF-036: loading and empty states (states.js + states.css). One place for the rules:
//  - a loading region says aria-busy and has a screen-reader caption; its placeholder keeps the shape of the real content;
//  - an empty state says why it is empty and offers one action. The page's own wording wins; this only fills what is missing.
(function () {
  'use strict';
  var EMPTY_SEL = '.sq-empty,.nw-empty,.hb-empty';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var SHAPES = { text: 'line', line: 'line', card: 'card', row: 'row', table: 'table' };
  var shapeOf = function (s) { return SHAPES[s] || 'line'; };

  // Markup for a shimmer placeholder: n bars shaped like card / row / table / text.
  function skeletonHtml(n, shape, label) {
    var sh = shapeOf(shape), out = '<div class="sk-wrap ' + sh + '" role="status"><span class="sk-cap">' + esc(label || 'Loading') + '</span>';
    for (var i = 0; i < Math.max(1, n | 0); i++) out += '<span class="sk' + (sh === 'line' && i % 3 ? ' s' + (i % 3 + 1) : '') + '"></span>';
    return out + '</div>';
  }

  // Markup for an empty state: icon, title, why, one action ({label, href} link, or {label, attrs} button).
  function emptyHtml(o) {
    o = o || {};
    var a = o.action, act = '';
    if (a && a.href) act = '<a class="btn ghost" href="' + esc(a.href) + '">' + esc(a.label) + '</a>';
    else if (a && a.label) act = '<button type="button" class="btn ghost"' + (a.attrs ? ' ' + a.attrs : '') + '>' + esc(a.label) + '</button>';
    return '<div class="panel sq-empty" role="status"><span aria-hidden="true">' + esc(o.icon || '📭') + '</span><div><b>' + esc(o.title || 'Nothing here yet') + '</b><p class="muted small">' + esc(o.why || DEFAULT_WHY) + '</p>' + act + '</div></div>';
  }

  var DEFAULT_WHY = 'Nothing has been added here yet. It fills in as the club plays and posts.';
  var DEFAULT_ACTION = { label: 'Back to Home', href: 'index.html' };
  var hasAction = function (el) { return !!el.querySelector('a[href],button'); };

  // Fill what an empty state is missing: role, a reason, one action. Never replaces wording the page already wrote.
  function fixEmpty(el) {
    if (!el || el.nodeType !== 1 || el.getAttribute('data-state-ok')) return false;
    if (!el.hasAttribute('role')) el.setAttribute('role', 'status');
    var box = el.querySelector(':scope>div') || el;
    if (!box.querySelector('p')) { var p = document.createElement('p'); p.className = 'muted small'; p.textContent = DEFAULT_WHY; box.appendChild(p); }
    if (!hasAction(el)) {
      var a = document.createElement('a'); a.className = 'btn ghost'; a.href = DEFAULT_ACTION.href; a.textContent = DEFAULT_ACTION.label; box.appendChild(a);
      el.setAttribute('data-state-auto', '1');
    }
    el.setAttribute('data-state-ok', '1');
    return true;
  }

  // A busy region always has a caption a screen reader can read.
  function fixBusy(el) {
    if (!el || el.nodeType !== 1 || el.getAttribute('aria-busy') !== 'true' || el.querySelector('.sk-cap')) return false;
    if (!el.querySelector('.sk-wrap,.dg-skel,.cx-skel,.sk')) return false;
    var c = document.createElement('span'); c.className = 'sk-cap'; c.setAttribute('role', 'status'); c.textContent = 'Loading'; el.insertBefore(c, el.firstChild);
    return true;
  }

  function scan(root) {
    root = root || document;
    if (!root.querySelectorAll) return;
    [].forEach.call(root.querySelectorAll(EMPTY_SEL), fixEmpty);
    [].forEach.call(root.querySelectorAll('[aria-busy="true"]'), fixBusy);
  }

  window.PhoenixStates = { skeletonHtml: skeletonHtml, emptyHtml: emptyHtml, fixEmpty: fixEmpty, fixBusy: fixBusy, scan: scan, DEFAULT_WHY: DEFAULT_WHY, DEFAULT_ACTION: DEFAULT_ACTION, shapeOf: shapeOf };

  if (typeof document === 'undefined' || !document.addEventListener) return;
  var queued = false, later = function () { if (queued) return; queued = true; (window.requestAnimationFrame || setTimeout)(function () { queued = false; scan(document); }); };
  var start = function () { scan(document); if (window.MutationObserver) new MutationObserver(later).observe(document.body, { childList: true, subtree: true }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
