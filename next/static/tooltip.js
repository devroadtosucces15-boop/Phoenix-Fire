/* PF-035: one tooltip for the whole site, replacing the browser's own title pop-ups and the per-page data-tip copies.
   One shared script, no page markup rewrites. Any element with a title="" or data-tip="" gets it:
   - mouse hover (after a short delay) and keyboard focus (at once) show it; touch never does, so taps are not blocked.
   - Esc hides it (WCAG 1.4.13); it stays while the pointer is over it, and goes when the pointer or focus leaves.
   - a title is moved to data-tip on first sight so the browser's own pop-up never doubles up; an icon-only control with
     no other name keeps the text as its aria-label, and the tooltip is linked with aria-describedby while it shows.
   - key hint: an element with aria-keyshortcuts or data-key gets a small key cap beside the text.
   Look comes from tooltip.css (Phoenix accent border). Pure helpers are exposed as window.PhoenixTip for tests. */
(function () {
  var DELAY = 350, GAP = 10, EDGE = 8;
  var tip = null, cur = null, timer = 0, hideTimer = 0, kbd = false;

  // text a tooltip shows for an element, '' when none
  function textOf(el) {
    if (!el || !el.getAttribute) return '';
    var t = el.getAttribute('data-tip');
    if (t == null) t = el.getAttribute('data-tip-title');
    return (t || '').replace(/\s+/g, ' ').trim();
  }
  // key hint for an element: first shortcut of aria-keyshortcuts or data-key, '' when none
  function keyOf(el) {
    var k = (el.getAttribute('data-key') || el.getAttribute('aria-keyshortcuts') || '').split(/\s+/)[0];
    return k.replace(/\+/g, ' + ');
  }
  // top-left for a box of size (w, h) near rect r inside a viewport (vw, vh): above by default, below when there is no room, clamped to the edges
  function place(r, w, h, vw, vh) {
    var x = r.left + r.width / 2 - w / 2;
    x = Math.max(EDGE, Math.min(vw - w - EDGE, x));
    var above = r.top - h - GAP >= EDGE;
    var y = above ? r.top - h - GAP : Math.min(vh - h - EDGE, r.bottom + GAP);
    return { x: Math.round(x), y: Math.round(Math.max(EDGE, y)), above: above };
  }

  // move a title to data-tip; keep an accessible name for controls that have none
  function adopt(el) {
    if (!el || el.nodeType !== 1 || !el.hasAttribute('title')) return;
    var t = el.getAttribute('title');
    if (!t || !t.trim()) return;
    if (!el.hasAttribute('data-tip-title')) el.setAttribute('data-tip-title', t);
    if (!el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby') && !(el.textContent || '').trim()) el.setAttribute('aria-label', t);
    el.removeAttribute('title');
  }
  function target(node) {
    var el = node && node.closest ? node.closest('[title],[data-tip],[data-tip-title]') : null;
    if (el) adopt(el);
    return el && textOf(el) ? el : null;
  }

  function build() {
    if (tip) return tip;
    tip = document.createElement('div');
    tip.className = 'ph-tip'; tip.id = 'ph-tip'; tip.setAttribute('role', 'tooltip'); tip.hidden = true;
    tip.addEventListener('pointerenter', function () { clearTimeout(hideTimer); });
    tip.addEventListener('pointerleave', function () { hide(); });
    document.body.appendChild(tip);
    return tip;
  }

  function show(el) {
    var text = textOf(el);
    if (!text) return;
    clearTimeout(timer); clearTimeout(hideTimer);
    if (cur && cur !== el) cur.removeAttribute('aria-describedby');
    var b = build(), key = keyOf(el);
    b.textContent = text;
    if (key) { var k = document.createElement('kbd'); k.textContent = key; b.appendChild(k); }
    b.hidden = false; b.style.left = '0px'; b.style.top = '0px';
    var p = place(el.getBoundingClientRect(), b.offsetWidth, b.offsetHeight, window.innerWidth, window.innerHeight);
    b.style.left = p.x + 'px'; b.style.top = p.y + 'px'; b.setAttribute('data-side', p.above ? 'top' : 'bottom');
    el.setAttribute('aria-describedby', 'ph-tip');
    cur = el;
  }
  function hide() {
    clearTimeout(timer); clearTimeout(hideTimer);
    if (cur) { cur.removeAttribute('aria-describedby'); cur = null; }
    if (tip) tip.hidden = true;
  }
  function later(el) { clearTimeout(timer); timer = setTimeout(function () { show(el); }, DELAY); }

  function onOver(e) {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') return;
    var el = target(e.target);
    if (!el) return;
    if (el === cur) { clearTimeout(hideTimer); return; }
    hide(); later(el);
  }
  function onOut(e) {
    if (e.pointerType === 'touch') return;
    var el = e.target && e.target.closest ? e.target.closest('[data-tip-title],[data-tip]') : null;
    if (!el || (e.relatedTarget && el.contains(e.relatedTarget))) return;
    if (tip && e.relatedTarget && tip.contains(e.relatedTarget)) return;
    clearTimeout(timer);
    hideTimer = setTimeout(hide, 120);
  }
  function onFocus(e) {
    if (!kbd) return;
    var el = target(e.target);
    if (el) show(el);
  }
  function onBlur() { hide(); }
  function onKey(e) {
    if (e.key === 'Escape') { if (cur) hide(); return; }
    kbd = true;
  }
  function onPointer(e) { kbd = false; if (e.pointerType === 'touch') hide(); }

  document.addEventListener('pointerover', onOver, true);
  document.addEventListener('pointerout', onOut, true);
  document.addEventListener('focusin', onFocus);
  document.addEventListener('focusout', onBlur);
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('pointerdown', onPointer, true);
  window.addEventListener('scroll', hide, { passive: true, capture: true });
  window.addEventListener('resize', hide);
  window.PhoenixTip = { textOf: textOf, keyOf: keyOf, place: place, adopt: adopt };
})();
