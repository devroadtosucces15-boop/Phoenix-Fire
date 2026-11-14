// PhoenixDeeplink: one place that lands a #hash on its target (R04, spec LAYOUT.md section 4).
// Resolves an id or a data-dl alias, opens whatever hides the target (details, tab panes, tab chips), waits until the target and the
// document stop moving (250 ms, cap 6 s), then scrolls below the sticky bars (--pf-sticky-top) through Lenis when it runs.
// A user who scrolls, touches or presses a key first is never pulled back. Reduced motion lands without animation.
(() => {
  const H = document.documentElement, D = document;
  const STABLE_MS = 250, CAP_MS = 6000, LIVE_MS = 1500; // the live strip stays hidden unless someone is on air, so it gives up sooner
  const reduced = () => H.dataset.motion === 'calm' || H.dataset.motion === 'off' || /[?&]still/.test(location.search) || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^\w-]/g, '\\$&'));
  let probe = null;
  // --pf-sticky-top is a calc() of other tokens, so a hidden probe turns it into pixels
  const stickyTop = () => {
    if (!probe) { probe = D.createElement('div'); probe.setAttribute('aria-hidden', 'true'); probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;width:0;height:var(--pf-sticky-top,130px)'; }
    if (!probe.isConnected) D.body.appendChild(probe);
    return probe.offsetHeight || 130;
  };
  // the sub bar height feeds --pf-sticky-top
  const syncSub = () => {
    const sub = D.querySelector('.sub'); if (!sub) return;
    const set = () => { const h = sub.offsetHeight; if (h) H.style.setProperty('--pf-sub-h', h + 'px'); };
    set(); if (window.ResizeObserver) new ResizeObserver(set).observe(sub);
  };
  const shown = (el) => !!(el && el.getClientRects().length);
  const find = (hash) => {
    let id = hash.replace(/^#/, ''); if (!id) return null;
    try { id = decodeURIComponent(id); } catch {}
    return D.getElementById(id) || D.querySelector('[data-dl~="' + esc(id) + '"]');
  };
  // what to scroll to once the element is open: an alias control points at its pane with data-dl-to
  const scrollTarget = (el) => {
    const to = el.getAttribute && el.getAttribute('data-dl-to');
    return (to && D.querySelector(to)) || el;
  };
  const isControl = (el) => el.matches && el.matches('button,[role="tab"],.chip') && el.hasAttribute('data-dl');
  // open the target and everything that hides it; safe to call every frame
  const reveal = (el) => {
    if (isControl(el)) { if (!el.classList.contains('on') && el.getAttribute('aria-selected') !== 'true') el.click(); return; }
    for (let n = el; n && n !== D.documentElement; n = n.parentElement) {
      if (n.tagName === 'DETAILS' && !n.open) n.open = true;
      if (n.hasAttribute && n.hasAttribute('data-pane') && n.hidden) { const c = D.querySelector('[data-tab="' + esc(n.getAttribute('data-pane')) + '"]'); if (c) c.click(); }
      if (n.classList && n.classList.contains('lp') && n.hidden && n.dataset.p) { const c = D.querySelector('[data-t="' + esc(n.dataset.p) + '"]'); if (c) c.click(); }
    }
  };
  // R34: a target near the end of a short page cannot reach the sticky offset; --pf-tail on #main adds just the missing space (only ever set by a hash jump)
  const tail = (y) => {
    const m = D.getElementById('main'); if (!m) return;
    const cur = parseFloat(m.style.getPropertyValue('--pf-tail')) || 0, need = Math.ceil(y - (H.scrollHeight - innerHeight));
    if (need > 0) m.style.setProperty('--pf-tail', cur + need + 'px');
  };
  // R2-verify: a page opened on a #hash arrives AT it (the browser's own anchor jump is instant); only later jumps (same-page clicks, hashchange) glide
  let arriving = !!location.hash;
  const settleArrival = () => { arriving = false; };
  ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach((e) => addEventListener(e, settleArrival, { capture: true, passive: true }));
  let run = 0;
  const go = (hash) => {
    const my = ++run; if (!hash || hash === '#') return;
    let stop = false, last = null, since = 0;
    const t0 = performance.now(), EV = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
    const end = () => { stop = true; EV.forEach((e) => removeEventListener(e, end, true)); };
    EV.forEach((e) => addEventListener(e, end, { capture: true, passive: true }));
    const land = (el) => {
      const y = Math.max(0, el.getBoundingClientRect().top + scrollY - stickyTop()), L = window.NorexLenis, imm = reduced() || arriving;
      arriving = false;
      tail(y);
      // Lenis caches the scroll limit; the page just grew (late content, --pf-tail), so refresh it or the jump stops at the old limit (hub-matchnight#mn-rush)
      if (L && typeof L.resize === 'function') L.resize();
      if (L && typeof L.scrollTo === 'function' && !L.isStopped) L.scrollTo(y, { immediate: imm, force: true }); else scrollTo({ top: y, behavior: imm ? 'auto' : 'smooth' });
    };
    const tick = (now) => {
      if (stop || my !== run) return end();
      const el = find(hash), t = el && scrollTarget(el), busy = H.classList.contains('fx-busy');
      if (el) reveal(el);
      if (t && shown(t) && !busy) {
        const sig = Math.round(t.getBoundingClientRect().top + scrollY) + ':' + H.scrollHeight;
        if (sig !== last) { last = sig; since = now; } else if (now - since >= STABLE_MS) { land(t); return end(); }
      } else last = null;
      if (now - t0 > (el && el.hasAttribute('data-live-strip') ? LIVE_MS : CAP_MS)) {
        // never became visible: the next visible section after it, else the nearest visible ancestor, else stay (live strip and locker pages stay at the top)
        // a hidden live strip (nobody is on air) is hidden by design: stay at the top (R34)
        let a = null; if (!(el && el.hasAttribute('data-live-strip'))) for (let n = t && t.nextElementSibling; n && !a; n = n.nextElementSibling) if (shown(n)) a = n;
        // locker pages hide whole sections by body class (R31): an id that this page hides stays at the top, it does not jump to a random neighbour
        if (!a && !(el && el.hasAttribute('data-live-strip')) && !/(^|\s)lk-/.test(D.body.className)) { a = t && t.parentElement; while (a && !shown(a)) a = a.parentElement; }
        if (a && a !== D.body && a !== H) land(a);
        return end();
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const here = () => location.hash;
  addEventListener('hashchange', () => { arriving = false; go(here()); });
  // a click on the link to the hash we are already on fires no hashchange
  D.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href*="#"]'); if (!a || e.defaultPrevented) return;
    const u = new URL(a.getAttribute('href'), location.href);
    if (u.origin === location.origin && u.pathname === location.pathname && u.hash && u.hash === here()) { arriving = false; go(u.hash); }
  });
  const boot = () => { syncSub(); if (here()) go(here()); };
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', boot); else boot();
  window.PhoenixDeeplink = { go, stickyTop };
})();
