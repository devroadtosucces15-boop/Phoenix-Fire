// Upgrade pack behaviour (the animation lab's "Upgrade" side), switched on from the Theme Studio per component:
//   data-st-playercard = b | c   the player card rig: spring tilt, foil, highlight, glow, shine, drag with spring-back, tap shine, gyroscope
//   data-st-buttonfx   = b | c   buttons: ripple from the finger and a short phone buzz (b); squeeze and inner light are CSS (upgrades.css)
// The rig is the lab's: one tilt value feeds every layer, one frame loop runs only while something moves, positions are written as
// CSS variables (never measured while animating). Stiffness 170 / damping 16 for the lean, 140 / 14 for the drag, press eases at rate 18.
// Cards stay links: a tap sends one shine and follows the link; a drag moves the card and does not navigate.
(() => {
  const w = window, d = document, H = d.documentElement;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || H.dataset.motion === 'off';
  const variant = (c) => H.getAttribute('data-st-' + c) || '';
  const K = () => (variant('playercard') === 'c' ? 0.55 : 1);   // quiet = softer lean
  const LAY = '<span class="up-shadow"></span><span class="up-glow"></span><span class="up-lay"><i class="up-foil"></i><i class="up-spec"></i><i class="up-shine"></i><i class="up-sweep"></i></span>';

  // ---------- A. player card ----------
  const S = new Map();            // card -> rig state
  let running = false, lastT = 0, gyro = false;
  const mk = () => ({ x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, dx: 0, dy: 0, dvx: 0, dvy: 0, tdx: 0, tdy: 0, press: 0, tp: 0, drag: false, sx0: 0, sy0: 0, moved: 0 });
  const step = (s, dt) => {
    const k = 170, c = 16;
    s.vx += ((s.tx - s.x) * k - s.vx * c) * dt; s.x += s.vx * dt; s.vy += ((s.ty - s.y) * k - s.vy * c) * dt; s.y += s.vy * dt;
    s.dvx += ((s.tdx - s.dx) * 140 - s.dvx * 14) * dt; s.dx += s.dvx * dt; s.dvy += ((s.tdy - s.dy) * 140 - s.dvy * 14) * dt; s.dy += s.dvy * dt;
    s.press += (s.tp - s.press) * Math.min(1, dt * 18);
  };
  const write = (el, s) => {
    const mag = Math.min(1, Math.hypot(s.x, s.y)), ang = Math.atan2(s.y, s.x) * 57.2958 + 90, st = el.style, k = K();
    st.setProperty('--ry', (s.x * 16 * k).toFixed(2) + 'deg'); st.setProperty('--rx', (-s.y * 16 * k).toFixed(2) + 'deg');
    st.setProperty('--tx', s.dx.toFixed(1) + 'px'); st.setProperty('--ty', s.dy.toFixed(1) + 'px');
    st.setProperty('--sx', s.x.toFixed(3)); st.setProperty('--sy', s.y.toFixed(3));
    st.setProperty('--ang', ang.toFixed(1) + 'deg'); st.setProperty('--mag', mag.toFixed(3)); st.setProperty('--press', s.press.toFixed(3));
  };
  const calm = (s) => Math.abs(s.x - s.tx) + Math.abs(s.y - s.ty) + Math.abs(s.vx) + Math.abs(s.vy) + Math.abs(s.dx - s.tdx) + Math.abs(s.dy - s.tdy) + Math.abs(s.dvx) + Math.abs(s.dvy) + Math.abs(s.press - s.tp) < 0.004;
  const live = new Set();
  const tick = (t) => {
    const dt = Math.min(0.033, (t - lastT) / 1000 || 0.016); lastT = t;
    for (const el of [...live]) { const s = S.get(el); if (!s) { live.delete(el); continue; } step(s, dt); write(el, s); if (calm(s)) { live.delete(el); write(el, s); } }
    if (live.size) requestAnimationFrame(tick); else running = false;
  };
  const kick = (el) => { live.add(el); if (!running) { running = true; lastT = performance.now(); requestAnimationFrame(tick); } };
  const setTilt = (el, x, y) => { const s = S.get(el); if (!s) return; s.tx = clamp(x, -1, 1); s.ty = clamp(y, -1, 1); kick(el); };
  const sweep = (el) => { if (reduced()) return; const sw = el.querySelector('.up-sweep'); sw && sw.animate([{ transform: 'translate3d(-120%,0,0)', opacity: 0.9 }, { transform: 'translate3d(120%,0,0)', opacity: 0.9 }], { duration: 650, easing: 'cubic-bezier(.4,0,.2,1)' }); };
  const norm = (el, e) => { const r = el.getBoundingClientRect(); return [clamp((e.clientX - (r.left + r.width / 2)) / (r.width * 0.55), -1, 1), clamp((e.clientY - (r.top + r.height / 2)) / (r.height * 0.55), -1, 1)]; };
  const arm = (el) => {
    if (el.dataset.up) return; el.dataset.up = '1'; el.classList.remove('tilt'); el.dataset.t = '1';
    el.insertAdjacentHTML('afterbegin', LAY); S.set(el, mk());
    const s = S.get(el);
    el.addEventListener('pointermove', (e) => { if (reduced()) return; const n = norm(el, e);
      if (s.drag) { const dx = e.clientX - s.sx0, dy = e.clientY - s.sy0; s.moved = Math.max(s.moved, Math.hypot(dx, dy)); s.tdx = 44 * Math.tanh(dx / 90) * K(); s.tdy = 36 * Math.tanh(dy / 90) * K(); setTilt(el, n[0] * 0.9, n[1] * 0.9); }
      else if (e.pointerType === 'mouse') setTilt(el, n[0], n[1]); });
    el.addEventListener('pointerleave', (e) => { if (!s.drag && e.pointerType === 'mouse') setTilt(el, 0, 0); });
    el.addEventListener('pointerdown', (e) => { if (reduced()) return; s.drag = true; s.sx0 = e.clientX; s.sy0 = e.clientY; s.moved = 0; s.tp = 1; el.classList.add('drag'); try { el.setPointerCapture(e.pointerId); } catch {} kick(el); });
    const up = (e) => { if (!s.drag) return; s.drag = false; el.classList.remove('drag'); s.tp = 0; s.tdx = 0; s.tdy = 0; if (e.pointerType !== 'mouse') setTilt(el, 0, 0); if (s.moved < 6) sweep(el); kick(el); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('click', (e) => { if (s.moved >= 6) { e.preventDefault(); e.stopPropagation(); s.moved = 0; } }, true);   // a drag is not a tap
    el.addEventListener('dragstart', (e) => e.preventDefault());
  };
  const disarm = (el) => { if (!el.dataset.up) return; el.querySelectorAll(':scope > .up-shadow,:scope > .up-glow,:scope > .up-lay').forEach((n) => n.remove()); delete el.dataset.up; S.delete(el); live.delete(el); el.classList.remove('drag'); for (const p of ['--rx', '--ry', '--tx', '--ty', '--sx', '--sy', '--ang', '--mag', '--press']) el.style.removeProperty(p); };
  // the phone's gyroscope leans every upgraded card in view (only when the owner's Gyro effect is on and the device sends the signal)
  const onGyro = (e) => { if (e.gamma == null || reduced()) return; if (w.PhoenixFx && !w.PhoenixFx.on('gyro')) return; const x = clamp(e.gamma / 28, -1, 1), y = clamp(((e.beta || 0) - 45) / 28, -1, 1);
    for (const [el, s] of S) { if (s.drag) continue; const r = el.getBoundingClientRect(); if (r.bottom > 0 && r.top < innerHeight) setTilt(el, x, y); } };
  const cards = () => d.querySelectorAll('.pc-card');

  // ---------- B. buttons ----------
  const onDown = (e) => {
    const b = e.target.closest && e.target.closest('.btn'); if (!b || !variant('buttonfx') || reduced()) return;
    if (variant('buttonfx') === 'b') {
      const r = b.getBoundingClientRect(), n = d.createElement('span'); n.className = 'up-rip'; n.style.left = (e.clientX - r.left) + 'px'; n.style.top = (e.clientY - r.top) + 'px'; b.appendChild(n);
      const sc = Math.max(r.width, r.height) / 10 * 2.2; n.animate([{ transform: 'scale(0)', opacity: 0.55 }, { transform: 'scale(' + sc + ')', opacity: 0 }], { duration: 620, easing: 'cubic-bezier(.2,.7,.2,1)' }).onfinish = () => n.remove();
      try { if (!w.PhoenixFx || w.PhoenixFx.on('haptics')) navigator.vibrate && navigator.vibrate(8); } catch {}
    }
  };
  d.addEventListener('pointerdown', onDown, true);

  // ---------- follow the Theme Studio ----------
  const sync = () => {
    if (variant('playercard')) { cards().forEach(arm); if (!gyro) { gyro = true; addEventListener('deviceorientation', onGyro); } }
    else { cards().forEach(disarm); if (gyro) { gyro = false; removeEventListener('deviceorientation', onGyro); } }
  };
  new MutationObserver(sync).observe(H, { attributes: true, attributeFilter: ['data-st-playercard', 'data-st-buttonfx'] });
  new MutationObserver((ms) => { if (!variant('playercard')) return; for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.matches && n.matches('.pc-card')) arm(n); n.querySelectorAll && n.querySelectorAll('.pc-card').forEach(arm); } }).observe(d.documentElement, { childList: true, subtree: true });
  w.PFUpgrades = { arm, disarm, step, mk, clamp, K };
  sync();
})();
