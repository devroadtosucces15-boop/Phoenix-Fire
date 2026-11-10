// Shared photo picker for the Rush leaderboard and season-card pages: take a photo with the camera or choose one from the gallery,
// shrink it in the browser (long side 1600 px, JPEG) so the upload stays small, and hand back a data URL. Nothing is kept on the device.
(() => {
  const d = document;
  const shrink = (file) => new Promise((ok, no) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight)), c = d.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); no(new Error('That file is not a picture we can read.')); };
    img.src = url;
  });
  // mount(root, onPicked(dataUrl)) draws the two buttons and a thumbnail; returns { reset() }
  function mount(root, onPicked, { label = 'the screenshot' } = {}) {
    root.innerHTML = `<div class="su"><div class="su-btns"><label class="btn su-b"><input type="file" accept="image/*" capture="environment" hidden data-cam>📷 Take a photo</label>
      <label class="btn ghost su-b"><input type="file" accept="image/*" hidden data-gal>🖼️ Choose from gallery</label></div>
      <p class="muted small su-h">Use ${label}. A straight, sharp shot with every column in view reads best. The picture is read once and then discarded.</p>
      <div class="su-pv" hidden><img alt="Your picture"><span class="su-st" role="status"></span></div></div>`;
    const pv = root.querySelector('.su-pv'), im = pv.querySelector('img'), st = pv.querySelector('.su-st');
    const take = async (f) => {
      if (!f) return;
      pv.hidden = false; st.textContent = 'Preparing…';
      try { const url = await shrink(f); im.src = url; st.textContent = 'Reading the numbers…'; await onPicked(url, (m) => { st.textContent = m; }); }
      catch (e) { st.textContent = e.message || 'Something went wrong.'; }
    };
    root.querySelectorAll('input[type=file]').forEach((i) => i.addEventListener('change', () => { take(i.files[0]); i.value = ''; }));
    return { reset() { pv.hidden = true; im.removeAttribute('src'); st.textContent = ''; } };
  }
  window.PFScan = { mount, shrink };
  // A wide table inside .tbx gets a fade on its right edge while there is more to scroll to.
  const fade = (el) => el.classList.toggle('fade', el.scrollWidth > el.clientWidth + 2 && el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  const scan = () => document.querySelectorAll('.tbx').forEach((el) => { fade(el); if (!el._fade) { el._fade = 1; el.addEventListener('scroll', () => fade(el), { passive: true }); } });
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true }); addEventListener('resize', scan); scan();
})();
