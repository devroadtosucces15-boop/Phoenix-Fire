// PF-038: tables (tables.js + tables.css). One place for the rules:
//  - every table has a caption (the page's own, else data-caption / aria-label / the nearest heading, shown to screen readers only);
//  - header cells say scope; column headers with text are real buttons that sort by keyboard (Enter or Space) and say aria-sort;
//  - centred columns (css) and numbers with their unit on one line (css, and PhoenixTables.num for new markup).
// Add data-no-sort to a table, or data-no-sort to one th, to leave it alone.
(function () {
  'use strict';
  var clean = function (s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  // A number and its unit that never wrap apart: num(54, '%') -> <span class="ph-num">54<small>%</small></span>
  function num(value, unit) { return '<span class="ph-num">' + esc(value) + (unit ? '<small class="u">' + esc(unit) + '</small>' : '') + '</span>'; }

  // The value a cell sorts by: a number when it reads as one (1,204 / 54% / 7.3 / -2), otherwise lower-case text.
  function keyOf(cell) {
    var raw = cell.getAttribute('data-sort') != null ? cell.getAttribute('data-sort') : clean(cell.textContent);
    var m = /^[+-]?\d[\d,]*(\.\d+)?/.exec(raw);
    if (m && raw.length - m[0].length <= 4) return { n: parseFloat(m[0].replace(/,/g, '')), s: raw.toLowerCase() };
    return { n: null, s: raw.toLowerCase() };
  }
  function cmp(a, b) {
    if (a.n != null && b.n != null) return a.n - b.n;
    return a.s < b.s ? -1 : a.s > b.s ? 1 : 0;
  }
  var blank = function (k) { return k.n == null && (!k.s || k.s === '—' || k.s === '-'); };
  function sortBy(table, col, dir) {
    var tb = table.tBodies && table.tBodies[0]; if (!tb) return false;
    var rows = Array.prototype.slice.call(tb.rows), keyed = rows.map(function (r, i) { return { r: r, i: i, k: keyOf(r.cells[col] || r) }; });
    keyed.sort(function (x, y) {
      var bx = blank(x.k), by = blank(y.k);   // dashes and blanks stay last in both directions
      if (bx || by) return bx === by ? x.i - y.i : bx ? 1 : -1;
      return (cmp(x.k, y.k) * (dir === 'descending' ? -1 : 1)) || x.i - y.i;
    });
    keyed.forEach(function (x) { tb.appendChild(x.r); });
    return true;
  }
  function setSorted(th, dir) {
    var row = th.parentNode; Array.prototype.forEach.call(row.cells, function (c) { c.removeAttribute('aria-sort'); });
    th.setAttribute('aria-sort', dir);
  }
  function toggle(th) {
    var table = th.closest('table'), col = th.cellIndex, was = th.getAttribute('aria-sort');
    var numeric = Array.prototype.some.call(table.tBodies[0].rows, function (r) { return r.cells[col] && keyOf(r.cells[col]).n != null; });
    var dir = was === 'ascending' ? 'descending' : was === 'descending' ? 'ascending' : (numeric && col > 0 ? 'descending' : 'ascending');
    if (sortBy(table, col, dir)) setSorted(th, dir);
    return dir;
  }

  function captionFor(table) {
    if (table.querySelector('caption')) return;
    var text = table.getAttribute('data-caption') || table.getAttribute('aria-label'), n = table;
    while (!text && n && n.nodeType === 1) {
      var p = n.previousElementSibling;
      while (p && !text) { var h = /^H[1-6]$/.test(p.tagName) ? p : p.querySelector && p.querySelector('h1,h2,h3,h4,.ribbon'); if (h) text = clean(h.textContent); p = text ? null : p.previousElementSibling; }
      n = n.parentNode; if (n && n.tagName === 'MAIN') break;
    }
    var cap = document.createElement('caption'); cap.className = 'sr'; cap.textContent = text || 'Data table';
    table.insertBefore(cap, table.firstChild);
  }

  function enhance(table) {
    if (!table || table.nodeType !== 1 || table.getAttribute('data-ph-table')) return;
    table.setAttribute('data-ph-table', '1');
    captionFor(table);
    var head = table.tHead && table.tHead.rows[0];
    if (head) Array.prototype.forEach.call(head.cells, function (th) { if (th.tagName === 'TH' && !th.getAttribute('scope')) th.setAttribute('scope', 'col'); });
    var tb = table.tBodies && table.tBodies[0];
    if (!head || !tb || tb.rows.length < 2 || table.hasAttribute('data-no-sort')) return;
    Array.prototype.forEach.call(head.cells, function (th) {
      var label = clean(th.textContent);
      if (!label || th.hasAttribute('data-no-sort') || th.querySelector('button,a,input,select')) return;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'ph-sort'; b.textContent = label;
      b.setAttribute('aria-label', 'Sort by ' + label);
      th.textContent = ''; th.appendChild(b);
    });
  }
  function scan(root) { Array.prototype.forEach.call((root || document).querySelectorAll('table'), enhance); }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.ph-sort'); if (!b) return;
    var th = b.parentNode; if (th && th.tagName === 'TH') toggle(th);
  });
  // Buttons already handle Enter and Space with a click; nothing else to wire for the keyboard.

  window.PhoenixTables = { enhance: enhance, scan: scan, num: num, sortBy: sortBy, keyOf: keyOf, toggle: toggle };
  var go = function () {
    scan();
    if (window.MutationObserver && document.body) new MutationObserver(function (ms) {
      ms.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes, function (n) { if (n.nodeType !== 1) return; if (n.tagName === 'TABLE') enhance(n); else if (n.querySelector) scan(n); }); });
    }).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
