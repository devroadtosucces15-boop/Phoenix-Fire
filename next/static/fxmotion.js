// PF-045: the accepted motion pass. Five counted effects, all read from the owner's config (fxconfig.js, window.PhoenixFx):
//   spring (card spring settle + deeper photo layer), ripple (selection ripple), spotlight (glow inside the hovered panel only, no pointer
//   shadow), ping (status ping), popin (menus and widgets pop in softly). Each runs only while PhoenixFx.on(<effect>) is true and every
//   distance is multiplied by PhoenixFx.scale(<effect>). Transform and opacity only; the card glare and shine are not touched.
(() => {
  const d = document, w = window, H = d.documentElement;
  const Fx = () => w.PhoenixFx, on = (k) => !!Fx() && Fx().on(k) && !H.classList.contains('nx-safe'), sc = (k) => (Fx() ? Fx().scale(k) : 0);
  const fine = () => w.matchMedia && matchMedia('(hover:hover) and (pointer:fine)').matches;
  const rm = () => w.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ok = (k) => on(k) && !rm() && d.documentElement.dataset.motion !== 'off';
  // linear() spring: overshoots once, settles. Falls back to an ease-out where linear() is unsupported.
  const SPRING = (w.CSS && CSS.supports && CSS.supports('transition-timing-function', 'linear(0,1)')) ? 'linear(0,.56,.98,1.14,1.1,1.03,.99,1,1)' : 'cubic-bezier(.34,1.56,.64,1)';

  // ---- spring: when a card is let go it settles with one small overshoot; the photo layer sits deeper and shifts a little against the lean
  const isCard = (el) => el && el.classList && (el.classList.contains('pc-card') || el.classList.contains('pc-hero'));
  const cardOf = (t) => (t && t.closest ? t.closest('.pc-card,.pc-hero') : null);
  d.addEventListener('pointerleave', (e) => {
    const el = e.target; if (!isCard(el) || !ok('spring') || !el.animate) return;
    const from = el.style.transform; if (!from || from === 'none') return;   // read before motion.js clears it (capture phase)
    const k = sc('spring'); el.style.setProperty('--fx-photo-x', '0'); el.style.setProperty('--fx-photo-y', '0');
    requestAnimationFrame(() => { try { el.animate([{ transform: from }, { transform: 'none' }], { duration: 420 + 260 * k, easing: SPRING }); } catch {} });
  }, true);
  d.addEventListener('pointermove', (e) => {
    const el = cardOf(e.target); if (!el || e.pointerType === 'touch' || !ok('spring')) return;
    const r = el.getBoundingClientRect(); if (!r.width) return;
    const x = ((e.clientX - r.left) / r.width - .5) * 2, y = ((e.clientY - r.top) / r.height - .5) * 2, k = sc('spring');
    el.style.setProperty('--fx-photo-x', (-x * 7 * k).toFixed(2) + 'px'); el.style.setProperty('--fx-photo-y', (-y * 6 * k).toFixed(2) + 'px');
  }, { passive: true });

  // ---- ripple: a soft ember ring grows from the tap point on chips, tabs, segmented options and buttons. It lives in its own clipped
  // layer on <body>, so the pressed control is never changed (no overflow or position side effects, no clipped focus rings).
  const RIP = '.chip,.cx-chip,.nx-pill,.seg button,[role=tab],[role=option],button.btn,a.btn,.tabbar a';
  d.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || !ok('ripple') || !d.body || !d.body.animate) return;
    const t = e.target.closest && e.target.closest(RIP); if (!t || t.disabled || t.getAttribute('aria-disabled') === 'true') return;
    const r = t.getBoundingClientRect(); if (r.width < 8 || r.height < 8) return;
    const host = d.createElement('div'); host.className = 'fxr'; host.setAttribute('aria-hidden', 'true');
    Object.assign(host.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', borderRadius: getComputedStyle(t).borderRadius });
    const dot = d.createElement('i'), size = Math.hypot(r.width, r.height) * 2 * Math.max(.5, sc('ripple'));
    Object.assign(dot.style, { left: e.clientX - r.left - size / 2 + 'px', top: e.clientY - r.top - size / 2 + 'px', width: size + 'px', height: size + 'px' });
    host.appendChild(dot); d.body.appendChild(host);
    const a = dot.animate([{ transform: 'scale(0)', opacity: .38 * sc('ripple') + .12 }, { transform: 'scale(1)', opacity: 0 }], { duration: 520, easing: 'cubic-bezier(.2,.7,.2,1)' });
    const gone = () => host.remove(); a.onfinish = gone; a.oncancel = gone; setTimeout(gone, 700);
  }, { passive: true });

  // ---- spotlight: light follows the pointer INSIDE the hovered panel only (a clipped layer over that panel, never outside it)
  const SPOT = '.panel,.kc,.tile,.sbt';
  let spot = null, cur = null, raf = 0, px = 0, py = 0;
  const off = () => { cancelAnimationFrame(raf); raf = 0; cur = null; if (spot) spot.style.opacity = '0'; };
  const draw = () => { raf = 0; if (!cur || !cur.isConnected) return off(); const r = cur.getBoundingClientRect();
    spot.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;border-radius:${getComputedStyle(cur).borderRadius};opacity:${(.9 * sc('spotlight')).toFixed(2)};--sx:${px - r.left}px;--sy:${py - r.top}px`; };
  d.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || !fine()) return; if (!ok('spotlight')) { if (cur) off(); return; }
    const t = e.target.closest && e.target.closest(SPOT);
    if (!t || t.closest('.pc-card,.pc-hero,dialog,[role=dialog]')) { if (cur) off(); return; }
    if (!spot) { spot = d.createElement('div'); spot.className = 'fxs'; spot.setAttribute('aria-hidden', 'true'); d.body.appendChild(spot); }
    cur = t; px = e.clientX; py = e.clientY; if (!raf) raf = requestAnimationFrame(draw);
  }, { passive: true });
  d.addEventListener('pointerleave', off, true); addEventListener('scroll', () => { if (cur) off(); }, { passive: true, capture: true }); addEventListener('blur', off);

  // ---- ping + popin are CSS only (fxmotion.css) keyed on html[data-fx-ping] / html[data-fx-popin], which fxconfig.js sets from the
  // owner's config; nothing to run here. A status element opts in with data-ping, a live badge with .live.
  w.PhoenixFxMotion = { SPRING, RIP, SPOT };
})();
