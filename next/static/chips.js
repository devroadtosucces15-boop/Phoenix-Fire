/* PF-041: sliding highlight for chip rows, segmented bars and tabs. Only when the group is one row and exactly one item is selected;
   wrapped or multi-select groups keep the per-chip look (a wrapped chip highlights only itself). No markup changes by pages:
   the highlight is a pseudo-element of the group driven by CSS variables. Pure rule: window.PhoenixChips.canSlide. */
(function () {
  var GROUPS = '[role="tablist"],.chips,.chipset,.seg,.cx-chips,.nx-pills';
  var ITEMS = 'button,a[role="tab"],[role="tab"]';
  // like roving.js: the look (.on) is the source of truth; aria is read only when no item carries .on
  function chosen(list) {
    var a = list.filter(function (el) { return el.matches('.on,.active'); });
    return a.length ? a : list.filter(function (el) { return el.matches('[aria-selected="true"],[aria-pressed="true"]'); });
  }

  // rects: [{t, h}] of every item; true when they share one row (nothing starts below another item's bottom)
  function oneRow(rects) {
    if (!rects.length) return false;
    var maxT = -Infinity, minB = Infinity;
    for (var i = 0; i < rects.length; i++) { maxT = Math.max(maxT, rects[i].t); minB = Math.min(minB, rects[i].t + rects[i].h); }
    return maxT < minB - 1;
  }
  function canSlide(selected, rects) { return selected === 1 && rects.length >= 2 && oneRow(rects); }

  function items(g) {
    return Array.prototype.filter.call(g.children, function (el) { return el.matches(ITEMS) && !el.hidden; });
  }
  function off(g) { if (g.classList.contains('ph-slide')) g.classList.remove('ph-slide', 'ph-ready', 'ph-anim'); }

  function place(g) {
    if (!g.offsetWidth) return off(g);
    var list = items(g);
    var sel = chosen(list);
    // measure in the unslid look so the highlight never changes the layout it is measured from
    var rects = list.map(function (el) { return { t: el.offsetTop, h: el.offsetHeight }; });
    if (!canSlide(sel.length, rects)) return off(g);
    var el = sel[0];
    if (!g.classList.contains('ph-slide')) g.classList.add('ph-slide');
    var r = getComputedStyle(el).borderRadius;
    var v = { '--ph-x': el.offsetLeft + 'px', '--ph-y': el.offsetTop + 'px', '--ph-w': el.offsetWidth + 'px', '--ph-h': el.offsetHeight + 'px', '--ph-r': r };
    for (var k in v) if (g.style.getPropertyValue(k) !== v[k]) g.style.setProperty(k, v[k]);
    if (!g.classList.contains('ph-ready')) {
      g.classList.add('ph-ready');
      (window.requestAnimationFrame || setTimeout)(function () { (window.requestAnimationFrame || setTimeout)(function () { g.classList.add('ph-anim'); }); });
    }
  }

  function scan(root) {
    var gs = (root || document).querySelectorAll(GROUPS);
    for (var i = 0; i < gs.length; i++) place(gs[i]);
  }

  function start() {
    scan();
    var pend = 0;
    function later() {
      if (pend) return;
      pend = 1;
      (window.requestAnimationFrame || setTimeout)(function () { pend = 0; scan(); });
    }
    new MutationObserver(later).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-selected', 'aria-pressed', 'hidden'] });
    window.addEventListener('resize', later);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(later);
    window.addEventListener('load', later);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.PhoenixChips = { canSlide: canSlide, oneRow: oneRow, scan: scan, GROUPS: GROUPS };
})();
