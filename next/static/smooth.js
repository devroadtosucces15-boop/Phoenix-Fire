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
  const locked = () => getComputedStyle(H).overflowY === 'hidden' || getComputedStyle(document.body).overflowY === 'hidden' || document.body.className.split(/\s+/).some((c) => /(^|-)lock$/.test(c));
  const sync = () => (locked() ? lenis.stop() : lenis.start());
  new MutationObserver(sync).observe(H, { attributes: true, attributeFilter: ['style', 'class'] });
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] });
  if (G) { addEventListener('norex:revealed', () => ScrollTrigger.refresh()); addEventListener('load', () => ScrollTrigger.refresh()); }
})();
