/* PF-029: double-press guard. A second press on the same button inside 600 ms is ignored, and the
   button says it is busy until the window ends. Toggles (chips, tabs, checkboxes) are exempt. */
(function () {
  var WINDOW = 600;
  function guarded(el) {
    if (!el || el.nodeType !== 1 || el.tagName !== 'BUTTON') return false;
    if (el.hasAttribute('data-once-off')) return false;
    if (el.hasAttribute('role') && /^(tab|radio|switch|checkbox|menuitemradio)$/.test(el.getAttribute('role'))) return false;
    if (el.hasAttribute('aria-pressed') || el.hasAttribute('aria-selected') || el.hasAttribute('aria-expanded')) return false;
    if (/(^|\s)(chip|rchip|ftb|sdot|tab)(\s|$)/.test(el.className || '')) return false;
    return true;
  }
  function onClick(e) {
    var b = e.target && e.target.closest ? e.target.closest('button') : null;
    if (!guarded(b)) return;
    if (b.getAttribute('data-busy') === '1') { e.stopImmediatePropagation(); e.preventDefault(); return; }
    b.setAttribute('data-busy', '1'); b.setAttribute('aria-busy', 'true');
    setTimeout(function () { b.removeAttribute('data-busy'); b.removeAttribute('aria-busy'); }, WINDOW);
  }
  document.addEventListener('click', onClick, true);
  window.PhoenixTap = { guarded: guarded, WINDOW: WINDOW };
})();
