// Site-wide smooth scroll: Lenis (inertial scrolling) driven by GSAP's ticker, ScrollTrigger for the progress bar and scrubbed motion.
// Stays off for reduced-motion users, the calm/off motion modes and ?still, so it never fights the site's own settings.
// Pages that need native scrolling set <html data-nosmooth>.
(() => {
  const H = document.documentElement;
  const calm = () => H.dataset.motion === 'calm' || H.dataset.motion === 'off' || /[?&]still/.test(location.search) || matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (H.hasAttribute('data-nosmooth') || calm() || !window.Lenis) return;
  const G = window.gsap && window.ScrollTrigger ? (gsap.registerPlugin(ScrollTrigger), true) : false; // GSAP is only loaded on pages that use scrubbed motion
  // nested scrollers (menus, chat lists, tables, sheets) keep their own native scrolling
  const nested = (n) => { for (let e = n; e && e !== document.body && e !== H; e = e.parentElement) { if (e.hasAttribute && e.hasAttribute('data-lenis-prevent')) return true; const o = getComputedStyle(e); if (/(auto|scroll)/.test(o.overflowY) && e.scrollHeight > e.clientHeight + 1) return true; if (/(auto|scroll)/.test(o.overflowX) && e.scrollWidth > e.clientWidth + 1) return true; } return false; };
  const lenis = new Lenis({ duration: 1.1, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true, anchors: true, prevent: nested, autoRaf: !G });
  window.NorexLenis = lenis;
  if (G) { lenis.on('scroll', ScrollTrigger.update); gsap.ticker.add((t) => lenis.raf(t * 1000)); gsap.ticker.lagSmoothing(0); }
  H.classList.add('sm-on');
  const bar = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'sm-bar' }));
  lenis.on('scroll', ({ progress }) => { bar.style.transform = `scaleX(${progress || 0})`; });
  if (G) gsap.utils.toArray('.ab-card .ab-i').forEach((el) => gsap.fromTo(el, { y: 14 }, { y: -14, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: 0.6 } }));
  // hand scrolling back to the browser while a menu, sheet or dialog has locked the page
  // Lenis's own stop adds .lenis-stopped, and smooth.css turns that into overflow:clip on <html>. If the lock test read that
  // computed value it would see "not hidden" the moment Lenis stopped, call start(), see "hidden" again and stop() again:
  // an endless stop/start loop that froze the page (opening the search palette, which adds html.hdr-lock). So the lock is
  // read from the page's own signals only (lock classes, inline overflow, the body), never from Lenis's own class or its
  // overflow, and the observer only acts when the wanted state differs from Lenis's current state.
  const lockClass = (e) => Array.from(e.classList).some((c) => /(^|-)lock$/.test(c));
  const locked = () => lockClass(H) || lockClass(document.body) || H.style.overflowY === 'hidden' || document.body.style.overflowY === 'hidden' || getComputedStyle(document.body).overflowY === 'hidden' || (!H.classList.contains('lenis-stopped') && getComputedStyle(H).overflowY === 'hidden');
  const sync = () => { const want = locked(); if (want !== !!lenis.isStopped) (want ? lenis.stop() : lenis.start()); };
  new MutationObserver(sync).observe(H, { attributes: true, attributeFilter: ['style', 'class'] });
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] });
  if (G) { addEventListener('norex:revealed', () => ScrollTrigger.refresh()); addEventListener('load', () => ScrollTrigger.refresh()); }
})();
