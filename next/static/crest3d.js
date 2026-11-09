// Opt-in 3D crest. Three.js (636 KB) is only fetched when the visitor presses the button, and the choice is remembered.
// Light on the GPU: stacked flat layers (no heavy geometry), pixel ratio capped at 1.5, drawing pauses when the crest is off screen or the tab is hidden.
(() => {
  const box = document.querySelector('.c3'); if (!box) return;
  const btn = box.querySelector('.c3-btn'), note = box.querySelector('.c3-note'), img = box.querySelector('.c3-img');
  const H = document.documentElement;
  const calm = () => H.dataset.motion === 'calm' || H.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = { get: () => { try { return localStorage.getItem('norex.crest3d') === '1'; } catch (e) { return false; } }, set: (v) => { try { localStorage.setItem('norex.crest3d', v ? '1' : '0'); } catch (e) {} } };
  let R = null; // running renderer state
  const load = () => window.THREE ? Promise.resolve() : new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'vendor-three.min.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
  const stop = () => { if (!R) return; R.dead = true; cancelAnimationFrame(R.raf); R.io.disconnect(); R.dispose(); R.cv.remove(); R = null; box.classList.remove('on'); btn.setAttribute('aria-pressed', 'false'); btn.textContent = 'Turn on 3D'; };
  const start = async () => {
    if (R) return;
    btn.disabled = true; btn.textContent = 'Loading…';
    try { await load(); } catch (e) { btn.disabled = false; btn.textContent = 'Turn on 3D'; note.textContent = '3D could not load.'; return; }
    const T = window.THREE;
    let renderer; try { renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }); } catch (e) { btn.disabled = false; btn.textContent = 'Turn on 3D'; note.textContent = 'This device does not support 3D.'; return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    const cv = renderer.domElement; box.appendChild(cv);
    const scene = new T.Scene(), cam = new T.PerspectiveCamera(32, 1, 0.1, 50); cam.position.z = 7;
    const tex = new T.TextureLoader().load(img.currentSrc || img.src, () => { R && (R.need = true); });
    tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
    const W = 2.2, Hh = W * 1289 / 892, group = new T.Group(); scene.add(group);
    // faux thickness: dark layers behind a bright front face
    const geo = new T.PlaneGeometry(W, Hh), layers = 7;
    for (let i = layers; i >= 0; i--) {
      const front = i === 0, m = new T.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, side: T.DoubleSide, color: front ? 0xffffff : new T.Color().setHSL(0.1, 0.5, 0.12 + 0.02 * (layers - i)) });
      const p = new T.Mesh(geo, m); p.position.z = -i * 0.018; group.add(p);
    }
    // a few gold motes for depth
    const n = 48, pos = new Float32Array(n * 3); for (let i = 0; i < n; i++) { pos.set([(Math.random() - .5) * 5, (Math.random() - .5) * 5.5, -0.5 - Math.random() * 2.2], i * 3); }
    const pg = new T.BufferGeometry(); pg.setAttribute('position', new T.BufferAttribute(pos, 3));
    const pm = new T.PointsMaterial({ color: 0xefcf7a, size: 0.05, transparent: true, opacity: 0.7, depthWrite: false });
    const pts = new T.Points(pg, pm); scene.add(pts);
    const st = { tx: 0, ty: 0, x: 0, y: 0, spin: 0 };
    const size = () => { const w = box.clientWidth, h = box.clientHeight; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); R && (R.need = true); };
    const onMove = (e) => { const r = box.getBoundingClientRect(), p = e.touches ? e.touches[0] : e; st.ty = ((p.clientX - r.left) / r.width - .5) * 0.9; st.tx = ((p.clientY - r.top) / r.height - .5) * 0.5; };
    const onLeave = () => { st.tx = 0; st.ty = 0; };
    let sy = scrollY; const onScroll = () => { st.spin += (scrollY - sy) * 0.004; sy = scrollY; };
    box.addEventListener('pointermove', onMove); box.addEventListener('pointerleave', onLeave); addEventListener('scroll', onScroll, { passive: true }); addEventListener('resize', size);
    let vis = true; const io = new IntersectionObserver((e) => { vis = e[0].isIntersecting; if (vis) tick(); }); io.observe(box);
    const loss = (e) => { e.preventDefault(); stop(); store.set(false); note.textContent = '3D paused: the graphics card ran out of memory.'; };
    cv.addEventListener('webglcontextlost', loss);
    let last = 0;
    const tick = (t = 0) => {
      if (!R || R.dead) return; R.raf = 0; if (!vis || document.hidden) return;
      R.raf = requestAnimationFrame(tick);
      if (t - last < 33) return; last = t; // ~30 fps is plenty for a slow tilt
      st.spin *= 0.92; st.x += (st.tx - st.x) * 0.08; st.y += (st.ty - st.y) * 0.08;
      const idle = Math.sin(t / 2200) * 0.12;
      group.rotation.set(st.x, st.y + idle + st.spin, 0);
      pts.rotation.y = -(st.y + st.spin) * 0.4 + t / 20000;
      renderer.render(scene, cam);
    };
    document.addEventListener('visibilitychange', () => { if (!document.hidden && R && !R.raf) tick(); });
    R = { dead: false, raf: 0, io, cv, need: true, dispose: () => { removeEventListener('scroll', onScroll); removeEventListener('resize', size); box.removeEventListener('pointermove', onMove); box.removeEventListener('pointerleave', onLeave); geo.dispose(); pg.dispose(); pm.dispose(); tex.dispose(); group.children.forEach((m) => m.material.dispose()); renderer.dispose(); renderer.forceContextLoss?.(); } };
    box.classList.add('on'); size(); btn.disabled = false; btn.setAttribute('aria-pressed', 'true'); btn.textContent = 'Turn off 3D'; note.textContent = 'Move your pointer over the crest, or scroll.';
    tick();
  };
  btn.addEventListener('click', () => { if (R) { stop(); store.set(false); note.textContent = ''; } else { store.set(true); start(); } });
  if (calm()) { note.textContent = '3D is off while reduced motion is on.'; btn.disabled = true; }
  else if (store.get()) start();
})();
