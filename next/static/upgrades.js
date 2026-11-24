// Upgrade pack behaviour (the animation lab's "Upgrade" side), switched on from the Theme Studio per component:
//   data-st-playercard = b | c   the player card rig: spring tilt, foil, highlight, glow, shine, drag with spring-back, tap shine, gyroscope
//   data-st-buttonfx   = b | c   buttons: ripple from the finger and a short phone buzz (b); squeeze and inner light are CSS (upgrades.css)
//   data-st-scrollfx / tapfx / menufx = b | c   scrolling lean + progress line, tap reactions, menus (hubfx and pagefx live in fx.js: steel doors and the ember page slide)
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


  // ---------- S. status accents: bell rings when tapped, count badge pops and rolls when its number changes, ripple on chips and tiles ----------
  const replay = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
  d.addEventListener('click', (e) => {
    if (!variant('statusfx') || reduced()) return;
    const bell = e.target.closest && e.target.closest('.hdr-bellp,.hdr-bell,.bell'); if (bell) { replay(bell, 'up-ring'); setTimeout(() => bell.classList.remove('up-ring'), 900); try { if (variant('statusfx') === 'b' && (!w.PhoenixFx || w.PhoenixFx.on('haptics'))) navigator.vibrate && navigator.vibrate([12, 40, 12]); } catch {} }
  }, true);
  d.addEventListener('pointerdown', (e) => {
    if (variant('statusfx') !== 'b' || reduced()) return;
    const t = e.target.closest && e.target.closest('.chip,.tile'); if (!t) return;
    const r = t.getBoundingClientRect(), n = d.createElement('span'); n.className = 'up-rip'; n.style.left = (e.clientX - r.left) + 'px'; n.style.top = (e.clientY - r.top) + 'px'; t.appendChild(n);
    const sc = Math.max(r.width, r.height) / 10 * 2.4; n.animate([{ transform: 'scale(0)', opacity: 0.5 }, { transform: 'scale(' + sc + ')', opacity: 0 }], { duration: 600, easing: 'cubic-bezier(.2,.7,.2,1)' }).onfinish = () => n.remove();
  }, true);
  new MutationObserver((ms) => { if (!variant('statusfx') || reduced()) return;
    for (const m of ms) { const el = m.target.nodeType === 3 ? m.target.parentElement : m.target; const b = el && el.closest && el.closest('.hdr-n,.nb,.ofab-n'); if (b && !b.classList.contains('up-pop')) { replay(b, 'up-pop'); setTimeout(() => b.classList.remove('up-pop'), 500); } }
  }).observe(d.documentElement, { characterData: true, childList: true, subtree: true });

  // ---------- F. dock and tab bar (dockfx): a pill glides between tabs (and across a page load), the icon hops, the ring squeezes and bounces ----------
  const SP = 'cubic-bezier(.2,1.15,.3,1)', OUT = 'cubic-bezier(.2,.8,.2,1)';
  const buzz = (n) => { try { if (!w.PhoenixFx || w.PhoenixFx.on('haptics')) navigator.vibrate && navigator.vibrate(n); } catch {} };
  const store = (v) => { try { if (v === undefined) return sessionStorage.getItem('phoenix.pillx'); sessionStorage.setItem('phoenix.pillx', String(v)); } catch {} return null; };
  const pillFor = (tb) => { let p = tb.querySelector(':scope > .up-pill'); if (!p) { p = d.createElement('i'); p.className = 'up-pill'; p.setAttribute('aria-hidden', 'true'); tb.insertBefore(p, tb.firstChild); } return p; };
  const pillTo = (tb, tab, from) => {
    const p = pillFor(tb), x = tab.offsetLeft;
    p.style.cssText = 'opacity:1;left:0;top:' + tab.offsetTop + 'px;width:' + tab.offsetWidth + 'px;height:' + tab.offsetHeight + 'px;transform:translate3d(' + x + 'px,0,0)';
    if (from != null && from !== x && !reduced() && variant('dockfx') !== 'c')
      p.animate([{ transform: 'translate3d(' + from + 'px,0,0) scaleX(1)' }, { transform: 'translate3d(' + ((from + x) / 2) + 'px,0,0) scaleX(1.35)', offset: 0.5 }, { transform: 'translate3d(' + x + 'px,0,0) scaleX(1)' }], { duration: 380, easing: OUT });
    store(x);
  };
  let pillWas = false;
  const pillSync = () => {
    if (!variant('dockfx') && !pillWas) return; pillWas = !!variant('dockfx');
    const tb = d.querySelector('.tabbar'); if (!tb) return;
    if (!variant('dockfx')) { tb.querySelectorAll(':scope > .up-pill').forEach((n) => n.remove()); return; }
    const on = tb.querySelector('a.on:not(.key)'); if (!on) { pillFor(tb).style.opacity = 0; return; }
    const was = store(); pillTo(tb, on, was == null ? null : +was);
  };
  d.addEventListener('click', (e) => {
    if (!variant('dockfx')) return;
    const a = e.target.closest && e.target.closest('.tabbar a:not(.key)'); if (!a || reduced()) return;
    const tb = a.closest('.tabbar'), was = tb.querySelector(':scope > .up-pill'), from = was ? new DOMMatrixReadOnly(getComputedStyle(was).transform).m41 : null;
    pillTo(tb, a, from);
    const ic = a.querySelector('.tbi,span'); if (ic && variant('dockfx') === 'b') { ic.animate([{ transform: 'translate3d(0,0,0) scale(1)' }, { transform: 'translate3d(0,-7px,0) scale(1.25)', offset: 0.4 }, { transform: 'translate3d(0,0,0) scale(1)' }], { duration: 420, easing: SP }); buzz(6); }
  }, true);
  d.addEventListener('pointerup', (e) => {
    if (!variant('dockfx') || reduced()) return;
    const r = e.target.closest && e.target.closest('.dk-ring'); if (r) r.animate([{ scale: 0.9 }, { scale: variant('dockfx') === 'c' ? 1.06 : 1.12, offset: 0.5 }, { scale: 1 }], { duration: 380, easing: SP });
  }, true);

  // ---------- I. dialogs, sheets and toasts (overlayfx): the dialog grows out of the button that opened it, toasts flick away ----------
  let opener = null;
  d.addEventListener('pointerdown', (e) => { opener = (e.target.closest && e.target.closest('button,.btn,a')) || null; }, true);
  const growDialog = (dlg) => {
    const panel = dlg.querySelector('.ph-dialog-panel'); if (!panel || !opener || reduced() || !variant('overlayfx')) return;
    const b = opener.getBoundingClientRect(), r = panel.getBoundingClientRect(); if (!b.width || !r.width) return;
    const dx = (b.left + b.width / 2) - (r.left + r.width / 2), dy = (b.top + b.height / 2) - (r.top + r.height / 2), q = variant('overlayfx') === 'c';
    panel.animate([{ opacity: 0, transform: 'translate3d(' + dx + 'px,' + dy + 'px,0) scale(.25)' }, { opacity: 1, transform: 'none' }], { duration: q ? 300 : 420, easing: SP });
    if (!q) { [].slice.call(panel.children).forEach((k, i) => k.animate([{ opacity: 0, transform: 'translate3d(0,8px,0)' }, { opacity: 1, transform: 'none' }], { duration: 260, delay: 160 + i * 50, easing: OUT, fill: 'backwards' })); buzz(8); }
  };
  const swipeToast = (el) => {
    if (el._upSwipe) return; el._upSwipe = 1; let x0 = 0, dr = false, moved = 0;
    el.addEventListener('pointerdown', (e) => { if (!variant('overlayfx') || e.target.closest('button')) return; dr = true; moved = 0; x0 = e.clientX; el.classList.add('up-drag'); try { el.setPointerCapture(e.pointerId); } catch {} });
    el.addEventListener('pointermove', (e) => { if (!dr) return; const dx = e.clientX - x0; moved = Math.max(moved, Math.abs(dx)); el.style.transform = 'translate3d(' + dx + 'px,0,0)'; el.style.opacity = String(1 - Math.min(1, Math.abs(dx) / 200)); });
    const end = (e) => { if (!dr) return; dr = false; el.classList.remove('up-drag'); const dx = e.clientX - x0;
      if (Math.abs(dx) > 70) { const x = el.querySelector('.ph-n-x'); el.style.transition = 'transform .24s,opacity .24s'; el.style.transform = 'translate3d(' + (dx > 0 ? 220 : -220) + 'px,0,0)'; el.style.opacity = '0'; setTimeout(() => x && x.click(), 200); }
      else { el.style.transform = ''; el.style.opacity = ''; } };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    el.addEventListener('click', (e) => { if (moved > 6) { e.stopPropagation(); e.preventDefault(); moved = 0; } }, true);
  };

  // ---------- K. charts and numbers (vizfx): a glowing dot draws the line chart as it appears ----------
  const dotFor = (wave) => {
    if (wave._upDot || !variant('vizfx') || variant('vizfx') === 'c' || reduced()) return;
    const path = wave.querySelector('path.l'); if (!path || !path.getTotalLength) return; wave._upDot = 1;
    const host = wave.parentElement; if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    const dot = d.createElement('i'); dot.className = 'up-dot'; dot.setAttribute('aria-hidden', 'true'); host.appendChild(dot);
    const L = path.getTotalLength(), t0 = performance.now() + 200, vb = (wave.viewBox && wave.viewBox.baseVal) || { width: 300, height: 56 };
    const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
    (function s(t) {
      const k = Math.min(1, Math.max(0, (t - t0) / 2000)), pt = path.getPointAtLength(L * ease(k)), sr = host.getBoundingClientRect(), pr = wave.getBoundingClientRect();
      dot.style.opacity = k > 0 && k < 1 ? 1 : 0; dot.style.transform = 'translate3d(' + (pr.left - sr.left + pt.x * pr.width / vb.width - 5) + 'px,' + (pr.top - sr.top + pt.y * pr.height / vb.height - 5) + 'px,0)';
      if (k < 1) requestAnimationFrame(s); else setTimeout(() => { dot.remove(); wave._upDot = 0; }, 400);
    })(performance.now());
  };
  const waves = () => { if (!variant('vizfx')) return; d.querySelectorAll('.wave').forEach((wv) => { if (wv._upIO) return; wv._upIO = new IntersectionObserver((es, o) => { if (es[0].isIntersecting) { o.disconnect(); wv._upIO = null; dotFor(wv); } }, { threshold: 0.4 }); wv._upIO.observe(wv); }); };

  // ---------- D. scrolling (scrollfx): rows lean and scale as they pass the middle, the header shrinks, a progress line fills. One frame loop, positions measured once ----------
  let sItems = [], sPos = [], sRaf = 0, sPg = null, sMax = 1;
  const sSel = '.rv-g>*,.rcard,.rrow';
  const sMeasure = () => { if (!variant('scrollfx')) return; sItems = [...d.querySelectorAll(sSel)]; const y = w.scrollY; sPos = sItems.map((el) => { const r = el.getBoundingClientRect(); return [r.top + y, r.height]; }); sMax = Math.max(1, H.scrollHeight - innerHeight); sFrame(); };
  const sFrame = () => { sRaf = 0; if (!variant('scrollfx') || reduced() || !innerHeight) return;
    const y = w.scrollY, mid = y + innerHeight / 2, k = variant('scrollfx') === 'c' ? 0.5 : 1;
    for (let i = 0; i < sItems.length; i++) { const [t, h] = sPos[i], p = (t + h / 2 - mid) / (innerHeight / 2); if (Math.abs(p) > 1.5) continue; const pc = clamp(p, -1, 1), ap = Math.abs(pc), st = sItems[i].style;
      st.setProperty('--up-dy', (pc * 8 * k).toFixed(1) + 'px'); st.setProperty('--up-s', (1 - ap * 0.06 * k).toFixed(3)); if (k === 1) st.setProperty('--up-o', (1 - ap * 0.4).toFixed(2)); }
    H.style.setProperty('--up-hk', clamp(y / 120, 0, 1).toFixed(3)); if (sPg) sPg.style.transform = 'scaleX(' + clamp(y / sMax, 0, 1).toFixed(4) + ')'; };
  const sOnScroll = () => { if (!sRaf) sRaf = requestAnimationFrame(sFrame); };
  let sOn = false, sTimer = 0;
  const sLater = () => setTimeout(sMeasure, 60);
  const sync2 = () => {
    const on = !!variant('scrollfx');
    if (on && !sOn) { sOn = true; sPg = d.querySelector('.up-pg') || d.body.appendChild(Object.assign(d.createElement('div'), { className: 'up-pg', ariaHidden: 'true' })); sPg.setAttribute('aria-hidden', 'true'); addEventListener('scroll', sOnScroll, { passive: true }); addEventListener('resize', sMeasure); addEventListener('norex:revealed', sMeasure); addEventListener('phoenix:theme', sLater); sMeasure(); clearTimeout(sTimer); sTimer = setTimeout(sMeasure, 400); }
    else if (!on && sOn) { sOn = false; removeEventListener('scroll', sOnScroll); removeEventListener('resize', sMeasure); removeEventListener('norex:revealed', sMeasure); removeEventListener('phoenix:theme', sLater); if (sPg) sPg.remove(); sPg = null; H.style.removeProperty('--up-hk'); for (const el of sItems) { el.style.removeProperty('--up-dy'); el.style.removeProperty('--up-s'); el.style.removeProperty('--up-o'); } sItems = []; sPos = []; }
  };

  // ---------- E. tap reactions (tapfx): the picked chip glides in from the one that was on, numbers roll when they change ----------
  const chipRect = new WeakMap();
  const chipsOf = (p) => [...p.children].filter((c) => c.classList.contains('chip'));
  const remember = (root = d) => root.querySelectorAll && root.querySelectorAll('.chip.on').forEach((c) => c.parentElement && chipRect.set(c.parentElement, c.getBoundingClientRect()));
  new MutationObserver((ms) => { if (!variant('tapfx')) return;
    for (const m of ms) {
      if (m.type === 'attributes') { const c = m.target; if (!c.classList || !c.classList.contains('chip') || !c.classList.contains('on') || (m.oldValue || '').split(' ').includes('on') || !c.parentElement) continue;
        const was = chipRect.get(c.parentElement), now = c.getBoundingClientRect(); chipRect.set(c.parentElement, now);
        if (was && !reduced() && Math.abs(was.left - now.left) + Math.abs(was.top - now.top) > 2) c.animate([{ translate: (was.left - now.left) + 'px ' + (was.top - now.top) + 'px', scale: '1.06' }, { translate: '0 0', scale: '1' }], { duration: variant('tapfx') === 'c' ? 260 : 440, easing: variant('tapfx') === 'c' ? OUT : SP }); }
      else if (m.type === 'characterData') { const el = m.target.parentElement && m.target.parentElement.closest('.ovr,[data-roll]'); if (el && !reduced()) replay(el, 'up-roll2'); }
    } }).observe(d.documentElement, { attributes: true, attributeFilter: ['class'], attributeOldValue: true, characterData: true, subtree: true });
  d.addEventListener('pointerdown', () => { if (variant('tapfx')) remember(); }, true);

  // ---------- G. menus (menufx): a scrim dims the page behind an open menu, a highlight follows the pointer down the island list ----------
  let scrim = null;
  const menuOpen = () => !!d.querySelector('.fx-orb.open,.fx-isl.open');
  const scrimSync = () => { if (!variant('menufx')) { if (scrim) { scrim.remove(); scrim = null; } return; } if (!scrim) { scrim = d.createElement('div'); scrim.className = 'up-scrim'; scrim.setAttribute('aria-hidden', 'true'); d.body.appendChild(scrim); } scrim.classList.toggle('on', menuOpen()); };
  d.addEventListener('pointerover', (e) => { if (!variant('menufx') || reduced()) return; const a = e.target.closest && e.target.closest('.fx-isl .il a'); if (!a) return; const il = a.closest('.il'); let hl = il.querySelector(':scope > .up-hl'); if (!hl) { hl = d.createElement('i'); hl.className = 'up-hl'; hl.setAttribute('aria-hidden', 'true'); il.insertBefore(hl, il.firstChild); }
    hl.style.width = a.offsetWidth + 'px'; hl.style.height = a.offsetHeight + 'px'; hl.style.transform = 'translate3d(' + a.offsetLeft + 'px,' + a.offsetTop + 'px,0)'; hl.style.opacity = 1; });
  d.addEventListener('pointerout', (e) => { const il = e.target.closest && e.target.closest('.fx-isl .il'); if (il && !il.contains(e.relatedTarget)) { const hl = il.querySelector(':scope > .up-hl'); if (hl) hl.style.opacity = 0; } });
  new MutationObserver(() => { if (variant('menufx') || scrim) scrimSync(); }).observe(d.documentElement, { attributes: true, subtree: true, attributeFilter: ['class'] });
  d.addEventListener('click', (e) => { if (variant('menufx') && e.target.closest && e.target.closest('.fx-orb .ob,.fx-isl .ib') && variant('menufx') === 'b') buzz(6); }, true);

  // ---------- follow the Theme Studio ----------
  const sync = () => {
    if (variant('playercard')) { cards().forEach(arm); if (!gyro) { gyro = true; addEventListener('deviceorientation', onGyro); } }
    else { cards().forEach(disarm); if (gyro) { gyro = false; removeEventListener('deviceorientation', onGyro); } }
    sync2(); remember(); scrimSync(); pillSync(); waves(); if (variant('overlayfx')) d.querySelectorAll('.ph-notice').forEach(swipeToast);
  };
  new MutationObserver(sync).observe(H, { attributes: true, attributeFilter: ['data-st-playercard', 'data-st-buttonfx', 'data-st-tilefx', 'data-st-statusfx', 'data-st-dockfx', 'data-st-overlayfx', 'data-st-vizfx', 'data-st-hubfx', 'data-st-scrollfx', 'data-st-tapfx', 'data-st-menufx', 'data-st-pagefx'] });
  new MutationObserver((ms) => { if (!variant('playercard')) return; for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.matches && n.matches('.pc-card')) arm(n); n.querySelectorAll && n.querySelectorAll('.pc-card').forEach(arm); } }).observe(d.documentElement, { childList: true, subtree: true });
  // dialogs, toasts and charts appear later: watch for them
  new MutationObserver((ms) => { if (!variant('overlayfx') && !variant('vizfx')) return;
    for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) {
      if (n.matches('.ph-notice')) swipeToast(n);
      if (n.matches('.ph-dialog')) growDialog(n);
      if (variant('vizfx') && (n.matches('.wave') || n.querySelector('.wave'))) waves();
    } }).observe(d.body || H, { childList: true, subtree: true });
  w.PFUpgrades = { arm, disarm, step, mk, clamp, K };
  sync();
})();
