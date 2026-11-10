// 👑 Owner button (PLANNING/BOT-SITE.md #6): a gold stamp, bottom-right, that only the owner sees. The badge counts what waits for a
// decision (GET /api/manager/queue → { claims, cards, rush, requests, ideas }); the panel opens the owner tools: approvals, Boardroom,
// feature switches, preview-as, health, announcements and the issue reporter. Behind its own owner flag `ownerFab`.
(() => {
  const d = document, w = window;
  const QUEUES = [['claims', '🪪', 'Player claims', 'staff-desk.html'], ['cards', '🎨', 'Card Studio photos', 'staff-artwork.html'], ['rush', '⚡', 'Rush results', 'staff-desk.html'], ['requests', '📨', 'Requests', 'staff-desk.html'], ['ideas', '💡', 'Ideas', 'staff-content.html']];
  const LINKS = [['👑', 'Boardroom', 'Club health, recruitment', 'staff-boardroom.html'], ['🎛️', 'Feature flags', 'Who sees what', 'staff-boardroom.html#switches'], ['🩺', 'Health', 'Site, bot and builds', 'staff-boardroom.html#health'], ['📣', 'Announcements', 'Post to the club', 'staff-boardroom.html#announce']];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // pure: the numbers the badge and the list use (only counts the server sent; anything else is 0)
  const tally = (q) => { const rows = QUEUES.map(([k, i, l, h]) => ({ k, i, l, h, n: Math.max(0, Math.floor(+(q && q[k]) || 0)) })); return { rows, total: rows.reduce((a, r) => a + r.n, 0) }; };
  // pure: the item that has waited longest. The Worker may send `oldest: { kind, at, title? }` next to the counts (kind = a queue key, at = ms);
  // anything else, or a kind with nothing waiting, gives null and the line simply is not shown.
  const waited = (ms) => { const m = Math.floor(Math.max(0, ms) / 6e4), h = Math.floor(m / 60), dd = Math.floor(h / 24); return m < 2 ? 'just now' : h < 1 ? `${m} min` : dd < 1 ? `${h} h` : `${dd} d`; };
  const oldest = (q, now = Date.now()) => {
    const o = q && q.oldest, row = o && QUEUES.find(([k]) => k === o.kind), at = o && +o.at;
    if (!row || !(at > 0) || at > now + 6e4 || !tally(q).rows.find((r) => r.k === o.kind)?.n) return null;
    return { k: row[0], i: row[1], l: row[2], h: row[3], title: String(o.title || '').slice(0, 80), age: waited(now - at), late: now - at > 48 * 36e5 };
  };
  const PANEL_CMD = '/panel', DISCORD = window.NOREX?.links?.discord || ''; // config.discord.guildId, empty when not set
  w.NorexOwnerFab = { tally, oldest, waited, badge: (n) => (n > 99 ? '99+' : String(n)), PANEL_CMD, DISCORD };

  const A = w.NorexAuth, API = w.NOREX_API;
  if (!A || !API || !A.token || A.role !== 'owner' || A.viewAs) return;
  const ready = A.ready || Promise.resolve();
  ready.then(() => {
    if (!(A.features || []).includes('ownerFab') || d.querySelector('.ofab')) return;
    const root = d.createElement('div'); root.className = 'ofab';
    const ring = 'OWNER · ' + (window.NOREX?.brand || 'the club').toUpperCase() + ' · OWNER · ' + (window.NOREX?.brand || 'the club').toUpperCase() + ' · ';
    root.innerHTML = `<div class="ofab-panel" id="ofabPanel" role="dialog" aria-label="Owner tools" hidden></div>
<button type="button" class="ofab-btn" aria-haspopup="dialog" aria-expanded="false" aria-controls="ofabPanel" aria-label="Owner tools"><svg class="ofab-ring" viewBox="0 0 100 100" aria-hidden="true"><defs><path id="ofabC" d="M50 50 m-39 0 a39 39 0 1 1 78 0 a39 39 0 1 1 -78 0"/></defs><text><textPath href="#ofabC" textLength="241">${ring}</textPath></text></svg><img src="crest-sm.png" alt="" width="22" height="32" decoding="async"><b class="ofab-n" hidden></b><i class="ofab-sheen" aria-hidden="true"></i></button>`;
    d.body.appendChild(root);
    const btn = root.querySelector('.ofab-btn'), panel = root.querySelector('.ofab-panel'), badge = root.querySelector('.ofab-n');
    let q = null, open = false, last = 0, sig = '';
    const hasReporter = () => !!d.querySelector('.nxr-fab');
    const paintPanel = () => {
      const { rows, total } = tally(q), live = rows.filter((r) => r.n), old = oldest(q);
      panel.innerHTML = `<div class="ofab-h"><span class="eyebrow">👑 Owner tools</span><button type="button" class="ofab-x" aria-label="Close">×</button></div>
<section class="ofab-sec" aria-label="Approvals queue"><a class="ofab-row ofab-top" href="${live[0] ? esc(live[0].h) : 'staff-desk.html'}"><span class="ofab-i" aria-hidden="true">✅</span><span class="ofab-t"><b>Approvals queue</b><small>${q === null ? 'Checking…' : total ? `${total} waiting for a decision` : 'Nothing waiting'}</small></span>${total ? `<em class="ofab-c num">${window.NorexOwnerFab.badge(total)}</em>` : ''}</a>
${old ? `<a class="ofab-old${old.late ? ' late' : ''}" href="${esc(old.h)}"><span aria-hidden="true">⏳</span><span class="ofab-ot"><small>Waiting longest</small><b>${old.i} ${esc(old.title || old.l)}</b></span><em class="num">${esc(old.age)}</em></a>` : ''}
${live.length ? `<ul class="ofab-q">${live.map((r) => `<li><a href="${esc(r.h)}"><span aria-hidden="true">${r.i}</span>${esc(r.l)}<b class="num">${r.n}</b></a></li>`).join('')}</ul>` : ''}</section>
<ul class="ofab-list">${LINKS.map(([i, t, s, h]) => `<li><a class="ofab-row" href="${h}"><span class="ofab-i" aria-hidden="true">${i}</span><span class="ofab-t"><b>${t}</b><small>${s}</small></span></a></li>`).join('')}
<li><button type="button" class="ofab-row ofab-pn" data-panel><span class="ofab-i" aria-hidden="true">💬</span><span class="ofab-t"><b>Open Discord /panel</b><small>Copies /panel, then paste it in any channel</small></span></button></li>
<li><div class="ofab-row ofab-va"><span class="ofab-i" aria-hidden="true">👁️</span><span class="ofab-t"><b>Preview as</b><small>See the site like they do</small></span><span class="ofab-vb"><button type="button" class="chip" data-va="member">Member</button><button type="button" class="chip" data-va="guest">Guest</button></span></div></li>
${hasReporter() ? '<li><button type="button" class="ofab-row" data-report><span class="ofab-i" aria-hidden="true">🐞</span><span class="ofab-t"><b>Report an issue</b><small>Pin it on this page</small></span></button></li>' : ''}</ul>`;
    };
    const paintBadge = () => { const { total } = tally(q); badge.hidden = !total; badge.textContent = window.NorexOwnerFab.badge(total); btn.setAttribute('aria-label', total ? `Owner tools, ${total} waiting` : 'Owner tools'); if (total > last && last >= 0 && q) { btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop'); } last = total; };
    const set = (v) => {
      open = v; panel.hidden = !v; btn.setAttribute('aria-expanded', String(v)); root.classList.toggle('open', v);
      if (v) { paintPanel(); sig = JSON.stringify(q); panel.classList.add('fresh'); setTimeout(() => panel.classList.remove('fresh'), 700); poll(); panel.querySelector('a,button')?.focus({ preventScroll: true }); }
    };
    btn.addEventListener('click', () => set(!open));
    panel.addEventListener('click', (e) => {
      if (e.target.closest('.ofab-x')) { set(false); btn.focus(); return; }
      const va = e.target.closest('[data-va]');
      if (va) { try { localStorage.setItem('norex.viewas', va.dataset.va); localStorage.setItem('norex.viewas.t', String(Date.now())); } catch {} location.reload(); return; }
      if (e.target.closest('[data-panel]')) { // one tap: /panel is on the clipboard, Discord opens; the manager approvals appear where you paste it
        const N = window.NorexOwnerFab, say = (m, kind) => window.NorexMotion?.toast?.(m, { kind, icon: '💬' });
        (navigator.clipboard ? navigator.clipboard.writeText(N.PANEL_CMD) : Promise.reject()).then(() => say('Copied /panel. Paste it in any Discord channel and press Enter.', 'ok'), () => say('Type /panel in any Discord channel.', ''));
        if (N.DISCORD) window.open(N.DISCORD, '_blank', 'noopener'); return;
      }
      if (e.target.closest('[data-report]')) { set(false); d.querySelector('.nxr-fab')?.click(); }
    });
    d.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) { set(false); btn.focus(); } });
    d.addEventListener('pointerdown', (e) => { if (open && !root.contains(e.target)) set(false); });
    const poll = async () => {
      if (d.hidden) return;
      try { q = await A.call('/api/manager/queue'); } catch { if (q === null) q = {}; }
      paintBadge(); const now = JSON.stringify(q); if (open && now !== sig) { sig = now; paintPanel(); } // repaint only when the counts changed, so focus and animation stay put
    };
    poll(); setInterval(poll, 60e3); d.addEventListener('visibilitychange', () => { if (!d.hidden) poll(); });
  });
})();
