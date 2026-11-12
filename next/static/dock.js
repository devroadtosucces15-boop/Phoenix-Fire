// The dock: two controls that replace the old round compass, the owner stamp, the edit gear and the preview toolbar.
//   Phoenix ring (everyone)  – the crest with a scroll-progress ring. Opens the menu for WHERE you are:
//                              inside the hub it lists the hub rooms you may open (nothing from the main site);
//                              on the main pages it lists the site menus with their sub-menus (nothing from the hub).
//                              Also "On this page" jumps. Never lists Staff: that has its own pill.
//   Staff pill (managers + owner) – a darker pill with every staff tool, grouped; the owner also gets the owner groups,
//                              the approvals count, Preview as and Edit this page.
// Both panels let a member pin menu items. Pins are saved on the member's account (POST /api/me/prefs { pins, spins },
// read back from /api/me prefs) and mirrored in localStorage, so they are there again when the app is reopened.
// The issue pill (web/report.js) is untouched. Colours come from the site's own variables (--red, --ink, --text).
(() => {
  const d = document, w = window, A = w.NorexAuth, N = w.NOREX || {}, API = w.NOREX_API;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const file = (location.pathname.split('/').pop() || 'index.html');
  const inHub = !!d.querySelector('.sub .wrap a[href^="hub"]') || /^(hub|staff)/.test(file);
  const LS = { get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

  // ---------- pins: one small store per panel, account first, this browser as the fast copy ----------
  const MAX = 12;
  const cleanPins = (a) => (Array.isArray(a) ? a : []).filter((p) => Array.isArray(p) && /^[a-z0-9._/-]+(#[\w-]+)?$/i.test(String(p[0] || '')) && String(p[0]).length <= 120)
    .map((p) => [String(p[0]), String(p[1] || '').slice(0, 40), String(p[2] || '').slice(0, 8)]).slice(0, MAX);
  const store = (key, field) => {
    let list = cleanPins(LS.get('phoenix.' + key));
    const save = () => { LS.set('phoenix.' + key, list); if (A?.token) A.call('/api/me/prefs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ [field]: list }) }).catch(() => {}); };
    return {
      all: () => list, has: (h) => list.some((p) => p[0] === h),
      toggle(h, l, e) { list = this.has(h) ? list.filter((p) => p[0] !== h) : [...list, [h, l, e]].slice(-MAX); save(); },
      adopt(remote) { const r = cleanPins(remote); if (r.length || Array.isArray(remote)) { list = r; LS.set('phoenix.' + key, list); } },
    };
  };
  const pinsNav = store('pins', 'pins'), pinsStaff = store('spins', 'spins');
  w.NorexDock = { cleanPins, pinsNav, pinsStaff };

  // ---------- who is here ----------
  const role = () => (A?.token ? A.role : w.NorexAs === 'owner' ? 'owner' : 'guest');
  const isStaff = () => role() === 'owner' || role() === 'manager';
  const isOwner = () => role() === 'owner' && !A?.viewAs;

  // ---------- menu sources ----------
  const hubItems = () => [...d.querySelectorAll('.sub .wrap a[href]')].filter((a) => !a.hidden && !/^staff/.test(a.getAttribute('href')))
    .map((a) => [a.getAttribute('href'), a.textContent.replace(/\s+/g, ' ').trim().replace(/^\S*\p{Extended_Pictographic}\S*\s*/u, ''), (a.querySelector('.em')?.textContent || '').trim()]);
  const siteGroups = () => (Array.isArray(N.nav) ? N.nav : []).filter((g) => g && g.l && g.href && !/^(hub|staff)/.test(g.href))
    .map((g) => ({ l: String(g.l), href: String(g.href), subs: (Array.isArray(g.subs) ? g.subs : []).filter((s) => Array.isArray(s) && s[0] && s[1] && !/^(hub|staff)/.test(s[0])) }));
  const STAFF = [
    ['Match night', [['staff-schedule.html', '🗓️', 'Schedule'], ['staff-dugout.html', '🧢', 'Dugout']]],
    ['People', [['staff-desk.html', '🗂️', 'Desk']]],
    ['Club content', [['staff-content.html', '📄', 'Content']]],
    ['Moderation and tools', [['staff-tools.html', '🛠️', 'Tools']]],
    ['Club health', [['staff-insights.html', '🧭', 'Insights']]]];
  const OWNER = [
    ['Artwork', [['staff-artwork.html', '🎨', 'Artwork studio']]],
    ['Owner controls', [['staff-switches.html', '🎛️', 'Feature switches'], ['staff-health.html', '🩺', 'Health'], ['staff-announce.html', '📣', 'Announce'], ['staff-audit.html', '🛡️', 'Audit log'], ['staff-halloffame.html', '🏛️', 'Hall of Fame'], ['staff-medals.html', '🏅', 'Medals'], ['staff-backup.html', '💾', 'Backup'], ['staff-organization.html', '🏢', 'Organization']]]];

  // ---------- panel plumbing ----------
  const mk = (cls, html) => { const e = d.createElement('div'); e.className = cls; e.innerHTML = html; return e; };
  const row = (store, h, e, l, sub) => `<li class="dk-r"><a href="${esc(h)}"${h === file || h.split('#')[0] === file && !h.includes('#') ? ' aria-current="page"' : ''}><span class="dk-e" aria-hidden="true">${esc(e || '•')}</span><span class="dk-t">${esc(l)}</span></a><button type="button" class="dk-pin${store.has(h) ? ' on' : ''}" data-pin="${esc(h)}" data-l="${esc(l)}" data-e="${esc(e || '')}" aria-pressed="${store.has(h)}" aria-label="${store.has(h) ? 'Unpin' : 'Pin'} ${esc(l)}" title="${store.has(h) ? 'Unpin' : 'Pin to the top'}">★</button></li>`;
  const pinned = (store) => store.all().length ? `<section class="dk-s"><h3>★ Pinned</h3><ul class="dk-l">${store.all().map(([h, l, e]) => row(store, h, e, l)).join('')}</ul></section>` : '';

  // ---------- the Phoenix ring ----------
  let ring = null, rp = null, heads = [];
  const collect = () => {
    const seen = new Set(); let n = 0;
    heads = [...(d.querySelector('main') || d.body).querySelectorAll('h1,h2,h3')].filter((h) => h.offsetParent !== null && !h.closest('.dk-panel,dialog,[hidden],.gr-sheet,a') && h.textContent.trim()).slice(0, 18).map((h) => {
      if (!h.id) { let id = 'dk-' + (h.textContent.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || ++n); while (seen.has(id) || d.getElementById(id)) id += '-' + (++n); h.id = id; } seen.add(h.id);
      return [h.id, h.textContent.replace(/\s+/g, ' ').trim().slice(0, 50)];
    });
  };
  const ringBody = () => {
    collect();
    const where = inHub ? '<small>Hub rooms</small>' : '<small>Menus</small>';
    const main = inHub
      ? `<section class="dk-s"><h3>🔐 The hub</h3><ul class="dk-l">${hubItems().map(([h, l, e]) => row(pinsNav, h, e, l)).join('') || '<li class="dk-none">Nothing here yet.</li>'}</ul></section>`
      : siteGroups().map((g) => `<section class="dk-s"><h3><a href="${esc(g.href)}">${esc(g.l)}</a></h3><ul class="dk-l">${g.subs.map(([h, l]) => row(pinsNav, h, '', l)).join('')}</ul></section>`).join('');
    const here = heads.length ? `<section class="dk-s"><h3>On this page</h3><ul class="dk-l dk-j">${heads.map(([id, t]) => `<li class="dk-r"><a href="#${esc(id)}" data-jump>${esc(t)}</a></li>`).join('')}</ul></section>` : '';
    return `<div class="dk-h"><b>Menu</b>${where}<button type="button" class="dk-x" data-x aria-label="Close menu">✕</button></div><div class="dk-body">${pinned(pinsNav)}${main}${here}</div><div class="dk-f"><button type="button" class="dk-b" data-top>⬆ Top</button><button type="button" class="dk-b" data-end>⬇ End</button></div>`;
  };
  const progress = () => { const h = d.documentElement.scrollHeight - innerHeight; ring?.style.setProperty('--p', h > 0 ? Math.min(100, Math.round(scrollY / h * 100)) : 0); };
  const smooth = () => (d.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

  // ---------- the Staff pill ----------
  let pill = null, sp = null, queue = null;
  const staffBody = () => {
    const groups = isOwner() ? [...STAFF, ...OWNER] : STAFF, n = queue ? ['claims', 'cards', 'rush', 'requests', 'ideas'].reduce((a, k) => a + Math.max(0, +queue[k] || 0), 0) : 0;
    const asNow = w.NorexAs || role();
    return `<div class="dk-h"><b>🧢 Staff</b><small>${isOwner() ? 'Owner' : 'Manager'}</small><button type="button" class="dk-x" data-x aria-label="Close staff menu">✕</button></div><div class="dk-body">
<a class="dk-top" href="staff.html"><span aria-hidden="true">🧢</span><b>Staff hub</b><small>${n ? n + ' waiting for a decision' : 'every tool, one tap each'}</small></a>
${pinned(pinsStaff)}${groups.map(([g, items]) => `<section class="dk-s"><h3>${esc(g)}</h3><ul class="dk-l">${items.map(([h, e, l]) => row(pinsStaff, h, e, l)).join('')}</ul></section>`).join('')}
<section class="dk-s"><h3>This page</h3><div class="dk-acts">${d.querySelector('.gr-fab') ? '<button type="button" class="dk-b" data-edit>✏️ Edit this page</button>' : ''}${isOwner() || w.NorexAs ? `<span class="dk-as">Preview as ${['guest', 'member', 'owner'].map((r) => `<button type="button" class="dk-chip${asNow === r ? ' on' : ''}" data-as="${r}">${r}</button>`).join('')}</span>` : ''}</div></section></div>`;
  };

  // ---------- mount ----------
  const place = (el, panel, open) => { el.setAttribute('aria-expanded', String(open)); panel.hidden = !open; el.classList.toggle('open', open); };
  function mount() {
    if (d.querySelector('.dk-ring')) return;
    d.documentElement.classList.add('pf-dock');
    ring = d.createElement('button'); ring.type = 'button'; ring.className = 'dk-ring'; ring.setAttribute('aria-haspopup', 'dialog'); ring.setAttribute('aria-expanded', 'false'); ring.setAttribute('aria-label', 'Menu'); ring.title = 'Menu';
    ring.innerHTML = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle class="dk-trk" cx="32" cy="32" r="29"/><circle class="dk-bar" cx="32" cy="32" r="29" pathLength="100"/></svg><img src="crest-sm.png" alt="" width="26" height="36" decoding="async">';
    rp = mk('dk-panel dk-nav', ''); rp.hidden = true; rp.setAttribute('role', 'dialog'); rp.setAttribute('aria-label', 'Menu');
    d.body.append(ring, rp);
    const closeR = () => place(ring, rp, false);
    ring.onclick = () => { if (rp.hidden) { rp.innerHTML = ringBody(); closeSt(); place(ring, rp, true); rp.querySelector('a,button')?.focus({ preventScroll: true }); } else closeR(); };
    rp.addEventListener('click', (e) => {
      if (e.target.closest('[data-x]')) { closeR(); ring.focus(); return; }
      if (e.target.closest('[data-top]')) { scrollTo({ top: 0, behavior: smooth() }); closeR(); return; }
      if (e.target.closest('[data-end]')) { scrollTo({ top: d.documentElement.scrollHeight, behavior: smooth() }); closeR(); return; }
      const j = e.target.closest('[data-jump]'); if (j) { e.preventDefault(); d.getElementById(j.getAttribute('href').slice(1))?.scrollIntoView({ behavior: smooth(), block: 'start' }); closeR(); return; }
      const p = e.target.closest('[data-pin]'); if (p) { pinsNav.toggle(p.dataset.pin, p.dataset.l, p.dataset.e); const y = rp.querySelector('.dk-body').scrollTop; rp.innerHTML = ringBody(); rp.querySelector('.dk-body').scrollTop = y; rp.querySelector(`[data-pin="${CSS.escape(p.dataset.pin)}"]`)?.focus({ preventScroll: true }); }
    });
    addEventListener('scroll', () => { if (!progress.t) progress.t = requestAnimationFrame(() => { progress.t = 0; progress(); }); }, { passive: true }); progress();

    let closeSt = () => {};
    const staffOn = () => { try { return isStaff(); } catch { return false; } };
    const mountStaff = () => {
      if (pill || !staffOn()) return;
      pill = d.createElement('button'); pill.type = 'button'; pill.className = 'dk-pill'; pill.setAttribute('aria-haspopup', 'dialog'); pill.setAttribute('aria-expanded', 'false');
      pill.innerHTML = '<span aria-hidden="true">🧢</span><b>Staff</b><i class="dk-n" hidden></i>';
      sp = mk('dk-panel dk-staff', ''); sp.hidden = true; sp.setAttribute('role', 'dialog'); sp.setAttribute('aria-label', 'Staff menu');
      d.body.append(pill, sp);
      closeSt = () => place(pill, sp, false);
      pill.onclick = () => { if (sp.hidden) { sp.innerHTML = staffBody(); closeR(); place(pill, sp, true); poll(); sp.querySelector('a,button')?.focus({ preventScroll: true }); } else closeSt(); };
      sp.addEventListener('click', (e) => {
        if (e.target.closest('[data-x]')) { closeSt(); pill.focus(); return; }
        if (e.target.closest('[data-edit]')) { closeSt(); d.querySelector('.gr-fab')?.click(); return; }
        const as = e.target.closest('[data-as]');
        if (as) { try { localStorage.setItem(API && !w.PF_MOCK ? 'phoenix.viewas' : 'phoenix.as', as.dataset.as); if (API && !w.PF_MOCK) localStorage.setItem('phoenix.viewas.t', String(Date.now())); } catch {} location.reload(); return; }
        const p = e.target.closest('[data-pin]'); if (p) { pinsStaff.toggle(p.dataset.pin, p.dataset.l, p.dataset.e); const y = sp.querySelector('.dk-body').scrollTop; sp.innerHTML = staffBody(); sp.querySelector('.dk-body').scrollTop = y; sp.querySelector(`[data-pin="${CSS.escape(p.dataset.pin)}"]`)?.focus({ preventScroll: true }); }
      });
      const poll = async () => {
        if (d.hidden || !A?.token) return;
        try { queue = await A.call('/api/manager/queue'); } catch { queue = queue || {}; }
        const n = ['claims', 'cards', 'rush', 'requests', 'ideas'].reduce((a, k) => a + Math.max(0, +queue[k] || 0), 0), b = pill.querySelector('.dk-n');
        b.hidden = !n; b.textContent = n > 99 ? '99+' : String(n); pill.setAttribute('aria-label', n ? `Staff menu, ${n} waiting` : 'Staff menu');
        if (!sp.hidden) { const y = sp.querySelector('.dk-body').scrollTop; sp.innerHTML = staffBody(); sp.querySelector('.dk-body').scrollTop = y; }
      };
      poll(); setInterval(poll, 60e3);
    };
    (A?.ready || Promise.resolve()).then(mountStaff);
    d.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!rp.hidden) { closeR(); ring.focus(); } if (sp && !sp.hidden) { closeSt(); pill.focus(); } } });
    d.addEventListener('pointerdown', (e) => { if (!rp.hidden && !rp.contains(e.target) && !ring.contains(e.target)) closeR(); if (sp && !sp.hidden && !sp.contains(e.target) && !pill.contains(e.target)) closeSt(); });
  }
  // saved pins arrive with the profile; adopt them once the session is known, then mount
  const boot = () => { const pr = A?.prefs; if (pr) { if ('pins' in pr) pinsNav.adopt(pr.pins); if ('spins' in pr) pinsStaff.adopt(pr.spins); } mount(); };
  if (A?.ready) A.ready.then(boot, mount); else mount();
})();
