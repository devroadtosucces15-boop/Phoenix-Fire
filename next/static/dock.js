// The dock: ONE round gold badge (the nav ring) that replaces the old round compass, the owner stamp, the edit gear, the preview toolbar and the Staff pill.
//   The badge can be dragged anywhere in the free part of the screen: below the header and sub bar, above the bottom tab bar.
//   The position is remembered per browser (phoenix.fabs, key "ring", as fractions of the free area so it survives a resize).
//   It opens the BIG menu for WHERE you are. A slicer at the top picks the view: Member (everyone: rooms, locker pages, "On this page"; inside the hub the hub
//   rooms, on the main pages the site menus), Manager (managers and the owner: every staff tool, approvals count, Report an issue) and Admin (owner only:
//   Artwork, Owner controls with the Boardroom, Preview as, Edit this page). A view a role may not see is never rendered. Guests and members get no slicer.
//   The last view is saved in phoenix.dockview and falls back to Member.
// The menu lets a member pin items. Pins are saved on the member's account (POST /api/me/prefs { pins, spins },
// read back from /api/me prefs) and mirrored in localStorage, so they are there again when the app is reopened.
// R46 quick dial: press and hold the badge still for about 350 ms (a small vibrate, then a wheel of quick jumps on an arc from the nearest screen edge).
//   Tap still opens the menu, press and move within the hold time still drags. Finger up and down spins the wheel, release opens the nearest item, sliding far
//   sideways or Esc cancels. Items come from the same sources as the menu (pins, top rooms, staff shortcuts for managers, the Boardroom for the owner).
//   Reduced motion (or data-motion calm/off) shows a plain vertical list. Pointer only: keyboard and screen reader users keep the menu.
// The issue button (web/report.js) is untouched. Colours come from the site's own variables (--red, --ink, --text).
(() => {
  const d = document, w = window, A = w.NorexAuth, N = w.NOREX || {}, API = w.NOREX_API, SELF = d.currentScript?.src || '';
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
  const role = () => (A?.token ? (A.ccView || A.role) : w.NorexAs === 'owner' ? 'owner' : 'guest');
  const isStaff = () => role() === 'owner' || role() === 'manager';
  const isOwner = () => role() === 'owner' && !A?.viewAs;
  // the real owner keeps the Preview-as chips while previewing as member or guest, so there is always a way back
  const canPreview = () => isOwner() || A?.realAs === 'owner' || (!!w.PF_MOCK && !!localStorage.getItem('phoenix.as'));

  // ---------- menu sources ----------
  const hubItems = () => [...d.querySelectorAll('.sub .wrap a[href]')].filter((a) => !a.hidden && !/^staff/.test(a.getAttribute('href')))
    .map((a) => [a.getAttribute('href'), a.textContent.replace(/\s+/g, ' ').trim().replace(/^\S*\p{Extended_Pictographic}\S*\s*/u, ''), (a.querySelector('.em')?.textContent || '').trim()]);
  const siteGroups = () => (Array.isArray(N.nav) ? N.nav : []).filter((g) => g && g.l && g.href && !/^(hub|staff)/.test(g.href))
    .map((g) => ({ l: String(g.l), href: String(g.href), subs: (Array.isArray(g.subs) ? g.subs : []).filter((s) => Array.isArray(s) && s[0] && s[1] && !/^(hub|staff)/.test(s[0])) }));
  /*@STAFF_LISTS@*/ // next/build.mjs writes const STAFF and const OWNER here from the staff manifest (next/lib/staffmanifest.mjs)

  // ---------- panel plumbing ----------
  const mk = (cls, html) => { const e = d.createElement('div'); e.className = cls; e.innerHTML = html; return e; };
  const row = (store, h, e, l, sub) => `<li class="dk-r"><a href="${esc(h)}"${h === file || h.split('#')[0] === file && !h.includes('#') ? ' aria-current="page"' : ''}><span class="dk-e" aria-hidden="true">${esc(e || '•')}</span><span class="dk-t">${esc(l)}</span></a><button type="button" class="dk-pin${store.has(h) ? ' on' : ''}" data-pin="${esc(h)}" data-ps="${store === pinsStaff ? 's' : 'n'}" data-l="${esc(l)}" data-e="${esc(e || '')}" aria-pressed="${store.has(h)}" aria-label="${store.has(h) ? 'Unpin' : 'Pin'} ${esc(l)}" title="${store.has(h) ? 'Unpin' : 'Pin to the top'}">★</button></li>`;
  const pinBtn = (store, h, l, e) => `<button type="button" class="dk-pin${store.has(h) ? ' on' : ''}" data-pin="${esc(h)}" data-ps="${store === pinsStaff ? 's' : 'n'}" data-l="${esc(l)}" data-e="${esc(e || '')}" aria-pressed="${store.has(h)}" aria-label="${store.has(h) ? 'Unpin' : 'Pin'} ${esc(l)}" title="${store.has(h) ? 'Unpin' : 'Pin to the top'}">★</button>`;
  // small colour-coded card, the same language as the room tiles: gradient, watermark emoji, pin star
  const MINI = ['', 'rm-clubh', 'rm-handb', 'rm-squadr', 'rm-night', 'rm-set'];
  const mini = (store, h, e, l, cls) => `<div class="rm-w"><a class="rm rm-mini ${cls || ''}" href="${esc(h)}"${h === file ? ' aria-current="page"' : ''}><span class="rm-ic" aria-hidden="true">${esc(e || '•')}</span><b class="rm-t">${esc(l)}</b></a>${store ? pinBtn(store, h, l, e) : ''}</div>`;
  const pinned = (store, cls) => store.all().length ? `<section class="dk-s"><h3>★ Pinned</h3><div class="dk-lk">${store.all().map(([h, l, e]) => mini(store, h, e, l, cls)).join('')}</div></section>` : '';

  // ---------- the Phoenix ring ----------
  let ring = null, rp = null, scrim = null, heads = [];
  const collect = () => {
    const seen = new Set(); let n = 0;
    heads = [...(d.querySelector('main') || d.body).querySelectorAll('h1,h2,h3')].filter((h) => h.offsetParent !== null && !h.closest('.dk-panel,dialog,[hidden],.gr-sheet,a') && h.textContent.trim()).slice(0, 18).map((h) => {
      if (!h.id) { let id = 'dk-' + (h.textContent.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || ++n); while (seen.has(id) || d.getElementById(id)) id += '-' + (++n); h.id = id; } seen.add(h.id);
      return [h.id, h.textContent.replace(/\s+/g, ' ').trim().slice(0, 50)];
    });
  };
  const memberBody = () => {
    collect();
    const R = w.PF_ROOMS, where = inHub ? '<small>The Hub</small>' : '<small>Menus</small>';
    let main;
    if (inHub && R) {
      const live = new Set(hubItems().map((i) => i[0]));
      const rooms = R.rooms.filter(([h]) => h === 'hub.html' || live.has(h));
      main = `<section class="dk-s"><h3>🚪 Rooms</h3><div class="dk-rooms">${rooms.map(([h, i, t, dsc, cls], n) => `<div class="rm-w${cls === 'locker' ? ' rm-locker' : ''}"><a class="rm rm-${esc(cls)}" href="${esc(h)}"${h === file ? ' aria-current="page"' : ''}><span class="rm-ic" aria-hidden="true">${esc(i)}</span><span class="rm-no">${String(n + 1).padStart(2, '0')}</span><b class="rm-t">${esc(t)}</b><span class="rm-d">${esc(dsc)}</span><span class="rm-go">Enter <i aria-hidden="true">→</i></span></a>${pinBtn(pinsNav, h, t, i)}</div>`).join('')}</div></section>`
        + `<section class="dk-s"><h3>🎽 My Locker</h3><div class="dk-lk">${R.lk.map(([h, i, t], n) => mini(null, h, i, t, MINI[n % MINI.length])).join('')}</div></section>`;
    } else if (inHub) {
      main = `<section class="dk-s"><h3>🔐 The hub</h3><ul class="dk-l">${hubItems().map(([h, l, e]) => row(pinsNav, h, e, l)).join('') || '<li class="dk-none">Nothing here yet.</li>'}</ul></section>`;
    } else {
      main = `<div class="dk-cols">${siteGroups().map((g) => `<section class="dk-s dk-card"><h3><a href="${esc(g.href)}">${esc(g.l)}</a></h3><ul class="dk-l">${g.subs.map(([h, l]) => row(pinsNav, h, '', l)).join('')}</ul></section>`).join('')}</div>`;
    }
    const here = heads.length ? `<section class="dk-s"><h3>On this page</h3><div class="dk-chips dk-j">${heads.map(([id, t]) => `<a class="dk-ch" href="#${esc(id)}" data-jump>${esc(t)}</a>`).join('')}</div></section>` : '';
    // R47: shown only when the report button exists in this page (web/report.js mounts it for the owner only), so no dead card
    const prev = canPreview() && !isOwner() ? `<section class="dk-s"><h3>Preview</h3><div class="dk-acts"><span class="dk-as">Preview as ${['guest', 'member', 'owner'].map((r) => `<button type="button" class="dk-chip${(w.NorexAs || role()) === r ? ' on' : ''}" data-as="${r}">${r}</button>`).join('')}</span></div></section>` : '';
    const rep = d.querySelector('.nxr-fab') ? '<section class="dk-s"><h3>Report</h3><p class="dk-none">Something wrong on this page? Tell the club.</p><div class="dk-lk"><div class="rm-w"><button type="button" class="rm rm-mini" data-issue><span class="rm-ic" aria-hidden="true">🐞</span><b class="rm-t">Report a problem</b></button></div></div></section>' : '';
    return { where, html: `${pinned(pinsNav)}${main}${here}${prev}${rep}` };
  };
  const progress = () => { const h = d.documentElement.scrollHeight - innerHeight; ring?.style.setProperty('--p', h > 0 ? Math.min(100, Math.round(scrollY / h * 100)) : 0); };
  const goto = (y) => (w.NorexLenis && smooth() === 'smooth' ? w.NorexLenis.scrollTo(y, { duration: 1.1 }) : scrollTo({ top: y }));
  const smooth = () => (d.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

  // ---------- the role views (R41) ----------
  let queue = null, view = 'member', poller = 0;
  const VIEWS = () => ['member', ...(isStaff() ? ['manager'] : []), ...(isOwner() ? ['admin'] : [])];
  const LABEL = { member: 'Member', manager: 'Manager', admin: 'Admin' };
  const waiting = () => (queue ? ['claims', 'cards', 'rush', 'requests', 'ideas'].reduce((a, k) => a + Math.max(0, +queue[k] || 0), 0) : 0);
  const staffGroup = ([g, items]) => `<section class="dk-s"><h3>${esc(g)}</h3><div class="dk-lk">${items.map(([h, e, l]) => mini(pinsStaff, h, e, l, 'rm-staff')).join('')}</div></section>`;
  const managerBody = () => { const n = waiting();
    return `<a class="dk-top" href="staff-controlcenter.html"><span aria-hidden="true">🎛️</span><b>Control Center</b><small>${n ? n + ' waiting for a decision' : 'every manager control, one place'}</small></a>${pinned(pinsStaff, 'rm-staff')}${STAFF.map(staffGroup).join('')}${d.querySelector('.nxr-fab') ? '<section class="dk-s"><h3>Report</h3><div class="dk-lk"><div class="rm-w"><button type="button" class="rm rm-mini rm-staff" data-issue><span class="rm-ic" aria-hidden="true">🐞</span><b class="rm-t">Report an issue</b></button></div></div></section>' : ''}`; };
  const adminBody = () => { const asNow = w.NorexAs || role();
    return `${OWNER.map(staffGroup).join('')}<section class="dk-s"><h3>This page</h3><div class="dk-acts">${d.querySelector('.gr-fab') ? '<button type="button" class="dk-b" data-edit>✏️ Edit this page</button>' : ''}${isOwner() || w.NorexAs ? `<span class="dk-as">Preview as ${['guest', 'member', 'owner'].map((r) => `<button type="button" class="dk-chip${asNow === r ? ' on' : ''}" data-as="${r}">${r}</button>`).join('')}</span>` : ''}</div></section>`; };
  const slicer = () => { const vs = VIEWS(); return vs.length > 1 ? `<div class="dk-slice" role="group" aria-label="Menu view">${vs.map((v) => `<button type="button" class="dk-chip${v === view ? ' on' : ''}" data-view="${v}" aria-pressed="${v === view}">${LABEL[v]}</button>`).join('')}</div>` : ''; };
  const bigBody = () => {
    const vs = VIEWS(); if (!vs.includes(view)) view = 'member';
    const m = view === 'member' ? memberBody() : null, body = m ? m.html : view === 'manager' ? managerBody() : adminBody();
    return `<div class="dk-h"><img class="dk-hc" src="crest-sm.png" alt="" width="22" height="30"><b>Menu</b>${m ? m.where : `<small>${LABEL[view]}</small>`}<button type="button" class="dk-x" data-x aria-label="Close menu">✕</button></div>${slicer()}<div class="dk-body">${body}</div>${view === 'member' ? '<div class="dk-f"><button type="button" class="dk-b" data-top>⬆ Top</button><button type="button" class="dk-b" data-end>⬇ End</button></div>' : ''}`;
  };

  // ---------- the free part of the screen, dragging, and where panels open ----------
  const FABS = new Map(), pos = LS.get('phoenix.fabs') || {}, DEF = { ring: [1, 1, 0] };
  const free = (el) => {
    const s = el.offsetWidth || 60, h = el.offsetHeight || 60; let top = 8, bottom = innerHeight - 8;
    for (const e of d.querySelectorAll('header.bar,.sub')) { if (/fixed|sticky/.test(getComputedStyle(e).position)) { const r = e.getBoundingClientRect(); if (r.height && r.bottom > 0 && r.top < 200) top = Math.max(top, r.bottom + 8); } }
    const tb = d.querySelector('.tabbar'); if (tb && getComputedStyle(tb).display !== 'none') { const r = tb.getBoundingClientRect(); if (r.width && r.top < innerHeight) bottom = Math.min(bottom, r.top - 8); }
    return { l: 8, t: top, r: Math.max(8, innerWidth - 8 - s), b: Math.max(top, bottom - h) };
  };
  const put = (el, x, y, f) => { el.style.left = Math.round(Math.min(f.r, Math.max(f.l, x))) + 'px'; el.style.top = Math.round(Math.min(f.b, Math.max(f.t, y))) + 'px'; };
  const at = (el, key) => {
    const f = free(el), p = pos[key], [fx, fy, dy] = DEF[key] || [1, 1, 0];
    put(el, f.l + (p ? p.x : fx) * (f.r - f.l), f.t + (p ? p.y : fy) * (f.b - f.t) + (p ? 0 : dy), f);
  };
  const save = (el, key) => { const f = free(el), r = el.getBoundingClientRect(); pos[key] = { x: f.r > f.l ? (r.left - f.l) / (f.r - f.l) : 1, y: f.b > f.t ? (r.top - f.t) / (f.b - f.t) : 1 }; LS.set('phoenix.fabs', pos); };
  const settle = (el) => { // never rest on top of another badge
    const f = free(el);
    for (let i = 0; i < 6; i++) {
      const r = el.getBoundingClientRect(), hit = [...FABS.keys()].find((o) => { if (o === el || !o.offsetWidth) return false; const q = o.getBoundingClientRect(); return r.left < q.right && q.left < r.right && r.top < q.bottom && q.top < r.bottom; });
      if (!hit) break;
      const q = hit.getBoundingClientRect(), up = q.top - r.height - 8, dn = q.bottom + 8;
      put(el, r.left, up >= f.t && (dn > f.b || r.top - up <= dn - r.top) ? up : dn, f);
    }
  };

  // ---------- R46: quick dial (press and hold the badge) ----------
  const HOLD_MS = 350, MOVE_PX = 6, CANCEL_PX = 120, DIAL_MAX = 20, DIAL_ROOMS = 6, SPAN = 70, ITEM = 44, GAP = 62;
  const calm = () => d.documentElement.dataset.motion === 'calm' || d.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  // items: the same sources as the menu. Pins first, then the top rooms of this page, then staff shortcuts (managers) and the Boardroom (owner).
  const dialItems = () => {
    const seen = new Set(), out = [], R = w.PF_ROOMS;
    const add = (h, l, e) => { h = String(h || ''); if (!h || seen.has(h)) return; seen.add(h); out.push([h, String(l || h).slice(0, 40), String(e || '•')]); };
    pinsNav.all().forEach(([h, l, e]) => add(h, l, e));
    if (isStaff()) pinsStaff.all().forEach(([h, l, e]) => add(h, l, e));
    if (inHub && R) { const live = new Set(hubItems().map((i) => i[0])); R.rooms.filter(([h]) => h === 'hub.html' || live.has(h)).slice(0, DIAL_ROOMS).forEach(([h, i, t]) => add(h, t, i)); }
    else if (inHub) hubItems().slice(0, DIAL_ROOMS).forEach(([h, l, e]) => add(h, l, e));
    else siteGroups().slice(0, DIAL_ROOMS).forEach((g) => add(g.href, g.l, '🚪'));
    if (inHub && R?.lk) R.lk.forEach(([h, i, t]) => add(h, t, i)); // My Locker pages, Card Studio included
    if (isStaff()) STAFF.forEach(([, items]) => items.forEach(([h, e, l]) => add(h, l, e)));
    if (isOwner()) { const [h, e, l] = OWNER[0][1][0]; add(h, l, e); } // the Boardroom, first in the owner group
    return out.slice(0, DIAL_MAX);
  };
  const dial = (() => {
    let layer = null, els = [], n = 0, S = { off: 0 }, G = null, sel = -1, away = false, pid = -1, x0 = 0, y0 = 0, o0 = 0, stopped = false, loading = null, vib = 0;
    const open = () => !!layer;
    const prime = () => { if (w.gsap || loading || calm()) return; loading = new Promise((ok) => { const s = d.createElement('script'); s.src = new URL('vendor-gsap.min.js', SELF || location.href).href; s.async = true; s.onload = s.onerror = ok; d.head.append(s); }); };
    const block = (e) => { if (e.cancelable) e.preventDefault(); };
    const smoothstep = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
    const layout = () => {
      if (!layer) return;
      if (G.list) { els.forEach((e, i) => { e.style.transform = `translate3d(${G.lx}px,${G.ly + i * (ITEM + 8)}px,0)`; }); return; }
      const P = Math.max(n * G.step, 2 * SPAN + G.step); let best = -1, bd = 1e9;
      els.forEach((e, i) => {
        const th = ((((i * G.step + S.off + SPAN) % P) + P) % P) - SPAN, a = Math.abs(th), c = Math.min(th, SPAN + G.step) * Math.PI / 180;
        const vis = a <= SPAN, f = 1 - smoothstep(SPAN * 0.55, SPAN, a), sc = 0.35 + 0.65 * f;
        const x = G.left ? G.R * Math.cos(c) - ITEM / 2 : innerWidth - G.R * Math.cos(c) + ITEM / 2 - G.w, y = G.cy + G.R * Math.sin(c) - ITEM / 2;
        e.style.transform = `translate3d(${x}px,${y}px,0) scale(${sc})`; e.style.opacity = vis ? String(f) : '0'; e._th = th;
        if (vis && a < bd) { bd = a; best = i; }
      });
      pick(away ? -1 : best);
    };
    const pick = (i) => { if (i === sel) return; els[sel]?.classList.remove('on'); sel = i; els[i]?.classList.add('on'); };
    const spinTo = (v, dur, done) => {
      if (w.gsap && !calm()) w.gsap.to(S, { off: v, duration: dur, ease: 'power3.out', overwrite: true, onUpdate: layout, onComplete: done });
      else { S.off = v; layout(); if (done) done(); }
    };
    const start = (el, id, x, y) => {
      const items = dialItems(); if (!items.length || layer) return false;
      const f = free(el), top = f.t, bot = f.b + (el.offsetHeight || 60), H = bot - top, W = innerWidth, r = el.getBoundingClientRect();
      const left = r.left + r.width / 2 < W / 2, list = calm() || H < 300 || W < 240;
      let R = Math.min(260, Math.max(110, W - 200)); R = Math.min(R, (H - ITEM - 8) / (2 * Math.sin(SPAN * Math.PI / 180)));
      const asList = list || R < 90, rows = Math.max(1, Math.floor((H + 8) / (ITEM + 8))), cnt = asList ? Math.min(items.length, rows) : items.length;
      const wd = Math.min(178, W - 24), cy = Math.min(bot - R * Math.sin(SPAN * Math.PI / 180) - ITEM / 2, Math.max(top + R * Math.sin(SPAN * Math.PI / 180) + ITEM / 2, r.top + r.height / 2));
      const lh = cnt * (ITEM + 8) - 8, ly = Math.min(bot - lh, Math.max(top, r.top + r.height / 2 - lh / 2));
      G = { left, list: asList, R, step: Math.min(30, GAP / R * 180 / Math.PI), cy, w: wd, lx: left ? 12 : W - 12 - wd, ly, top, rows };
      layer = d.createElement('div'); layer.className = 'dk-dial' + (asList ? ' list' : '') + (left ? '' : ' r'); layer.setAttribute('aria-hidden', 'true'); layer.style.setProperty('--dw', wd + 'px');
      layer.innerHTML = items.slice(0, cnt).map(([h, l, e]) => `<a class="dk-di" href="${esc(h)}" tabindex="-1"><i>${esc(e)}</i><b>${esc(l)}</b></a>`).join('');
      d.body.append(layer); els = [...layer.children]; n = els.length; S.off = 0; sel = -1; away = false; pid = id; x0 = x; y0 = y; o0 = 0;
      layout(); if (asList) pick(Math.min(n - 1, Math.max(0, Math.floor((y - ly) / (ITEM + 8)))));
      const L = w.NorexLenis; stopped = !!L && !L.isStopped;
      d.documentElement.classList.add('dk-dial-lock'); if (stopped) try { L.stop(); } catch {}
      d.addEventListener('wheel', block, { passive: false }); d.addEventListener('touchmove', block, { passive: false });
      try { navigator.vibrate?.(10); } catch {}
      return true;
    };
    const move = (x, y) => {
      if (!layer) return;
      away = Math.abs(x - x0) > CANCEL_PX || x < 0 || x > innerWidth || y < 0 || y > innerHeight; layer.classList.toggle('away', away);
      if (G.list) { const i = Math.min(n - 1, Math.max(0, Math.floor((y - G.ly) / (ITEM + 8)))); pick(away ? -1 : i); return; }
      spinTo(o0 + (y - y0) * (180 / Math.PI) / G.R, 0.16);
    };
    const close = (go) => {
      if (!layer) return;
      const L = w.NorexLenis, lay = layer, a = go && sel >= 0 ? els[sel] : null; layer = null;
      d.removeEventListener('wheel', block); d.removeEventListener('touchmove', block);
      const fin = () => { if (a) a.click(); lay.remove(); d.documentElement.classList.remove('dk-dial-lock'); if (stopped) try { L.start(); } catch {} stopped = false; };
      if (!a) { fin(); return; }
      layer = lay; // keep the layer while it snaps, then release it
      const th = a._th || 0; const done = () => { layer = null; fin(); };
      if (G.list) done(); else spinTo(S.off - th, 0.14, done);
    };
    return { open, prime, start, move, close, id: () => pid };
  })();
  let closeAll = () => {};
  function drag(el, key, withDial) {
    if (el._dk) return; el._dk = 1; FABS.set(el, key); at(el, key); settle(el);
    let st = null;
    const bounce = () => { if (!withDial || calm()) return; el.classList.remove('bounce'); void el.offsetWidth; el.classList.add('bounce'); };
    el.addEventListener('animationend', () => el.classList.remove('bounce'));
    el.addEventListener('pointerenter', () => { if (withDial) dial.prime(); }, { once: true });
    el.addEventListener('pointerdown', (e) => {
      if (e.button) return; const r = el.getBoundingClientRect(); st = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top, x0: e.clientX, y0: e.clientY, moved: false, dial: false, t: 0 };
      if (!withDial) return;
      el.classList.add('pressed'); dial.prime();
      st.t = setTimeout(() => { // hold still: the dial opens; the badge stays where it is
        if (!st || st.moved || st.dial) return;
        try { el.setPointerCapture(st.id); } catch {}
        if (dial.start(el, st.id, st.x0, st.y0)) { st.dial = true; el.classList.remove('pressed'); el.classList.add('dialing'); bounce(); closeAll(); }
      }, HOLD_MS);
    });
    el.addEventListener('pointermove', (e) => {
      if (!st || e.pointerId !== st.id) return;
      if (st.dial) { dial.move(e.clientX, e.clientY); return; }
      if (!st.moved) { if (Math.hypot(e.clientX - st.x0, e.clientY - st.y0) < MOVE_PX) return; clearTimeout(st.t); st.moved = true; el.classList.remove('pressed'); try { el.setPointerCapture(e.pointerId); } catch {} el.classList.add('dragging'); closeAll(); }
      put(el, e.clientX - st.dx, e.clientY - st.dy, free(el));
    });
    const end = (e) => {
      if (!st) return; clearTimeout(st.t); el.classList.remove('pressed');
      if (st.dial) { el.classList.remove('dialing'); dial.close(e.type === 'pointerup'); bounce(); el._moved = true; setTimeout(() => { el._moved = false; }, 400); }
      else if (st.moved) { el.classList.remove('dragging'); settle(el); save(el, key); el._moved = true; setTimeout(() => { el._moved = false; }, 60); }
      else if (e.type === 'pointerup') bounce();
      st = null;
    };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    el.addEventListener('contextmenu', (e) => { if (st) e.preventDefault(); });
    el.addEventListener('click', (e) => { if (el._moved) { e.stopImmediatePropagation(); e.preventDefault(); el._moved = false; } }, true);
    if (withDial) { // Esc or a second finger cancels the dial; the rest of the gesture is ignored until the finger lifts
      d.addEventListener('keydown', (e) => { if (e.key === 'Escape' && dial.open() && st?.dial) { dial.close(false); el.classList.remove('dialing'); st.dial = 'x'; } }, true);
      d.addEventListener('pointerdown', (e) => { if (dial.open() && e.pointerId !== dial.id()) { dial.close(false); el.classList.remove('dialing'); if (st) st.dial = 'x'; } }, true);
    }
    el.addEventListener('keydown', (e) => { // Shift + arrow keys move a badge for people who cannot drag
      const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!k || !e.shiftKey) return;
      e.preventDefault(); const r = el.getBoundingClientRect(); put(el, r.left + k[0] * 20, r.top + k[1] * 20, free(el)); settle(el); save(el, key);
    });
  }
  let rz = 0; addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { for (const [el, key] of FABS) at(el, key); for (const el of FABS.keys()) settle(el); }); });

  // ---------- PF-043: the phone tab bar hides on scroll down; a small bobbing arrow at the bottom centre brings it back ----------
  // Scroll down past TB_FROM px hides it, any scroll up (or the top or bottom of the page) shows it. It stays while the menu is open, the keyboard is up or focus is inside it.
  // Hidden = inert (no focus on invisible links). The arrow is a real button; its bob is two short bounces every TB_BOB_MS (finite, never endless; none for calm or off).
  const TB_FROM = 120, TB_DOWN = 14, TB_UP = 6, TB_BOB_MS = 7000;
  function tabHide() {
    const tb = d.querySelector('.tabbar'); if (!tb || tb._hide) return; tb._hide = 1;
    const back = d.createElement('button'); back.type = 'button'; back.className = 'tb-back'; back.hidden = true; back.setAttribute('aria-label', 'Show the navigation bar'); back.title = 'Show navigation';
    back.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 15l7-7 7 7"/></svg>'; d.body.append(back);
    let hidden = false, last = scrollY, acc = 0, raf = 0, bob = 0;
    const live = () => !!tb.offsetWidth && getComputedStyle(tb).display !== 'none';
    const set = (h) => {
      h = h && live(); if (h === hidden) return; hidden = h;
      d.documentElement.classList.toggle('tb-hide', h); tb.inert = h; back.hidden = !h;
      clearInterval(bob); bob = 0; back.classList.remove('bob');
      if (h) bob = setInterval(() => { if (calm() || d.hidden || (w.PhoenixFx && !w.PhoenixFx.on('dockbob'))) return; back.classList.remove('bob'); void back.offsetWidth; back.classList.add('bob'); }, TB_BOB_MS);
    };
    const blocked = () => d.documentElement.classList.contains('kb-open') || !!(rp && !rp.hidden) || tb.contains(d.activeElement);
    const step = () => {
      raf = 0; const y = scrollY, dy = y - last; last = y;
      if (blocked()) { set(false); acc = 0; return; }
      const max = d.documentElement.scrollHeight - innerHeight;
      if (y <= TB_FROM || (max > 0 && y >= max - 4)) { set(false); acc = 0; return; }
      acc = Math.sign(dy) === Math.sign(acc) ? acc + dy : dy;
      if (acc > TB_DOWN) set(true); else if (acc < -TB_UP) set(false);
    };
    addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(step); }, { passive: true });
    addEventListener('resize', () => { if (!live()) set(false); });
    tb.addEventListener('focusin', () => set(false));
    back.addEventListener('animationend', () => back.classList.remove('bob'));
    back.addEventListener('click', () => { set(false); acc = 0; tb.querySelector('a')?.focus({ preventScroll: true }); });
  }

  // ---------- mount ----------
  const place = (el, panel, open) => { el.setAttribute('aria-expanded', String(open)); panel.hidden = !open; el.classList.toggle('open', open); };
  function mount() {
    if (d.querySelector('.dk-ring')) return;
    d.documentElement.classList.add('pf-dock');
    ring = d.createElement('button'); ring.type = 'button'; ring.className = 'dk-fab dk-ring'; ring.setAttribute('aria-haspopup', 'dialog'); ring.setAttribute('aria-expanded', 'false'); ring.setAttribute('aria-label', 'Menu'); ring.title = 'Menu';
    ring.innerHTML = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle class="dk-trk" cx="32" cy="32" r="29"/><circle class="dk-bar" cx="32" cy="32" r="29" pathLength="100"/></svg><img src="crest-sm.png" alt="" width="26" height="36" decoding="async"><span class="dk-chip2" aria-hidden="true">🧭</span><i class="dk-n" hidden></i>';
    scrim = mk('dk-scrim', ''); scrim.hidden = true;
    rp = mk('dk-panel dk-nav dk-big', ''); rp.hidden = true; rp.setAttribute('role', 'dialog'); rp.setAttribute('aria-label', 'Menu');
    d.body.append(scrim, ring, rp); drag(ring, 'ring', true);
    const closeR = () => { place(ring, rp, false); scrim.hidden = true; };
    const paint = (focus) => { const y = rp.querySelector('.dk-body')?.scrollTop || 0; rp.innerHTML = bigBody(); const bd = rp.querySelector('.dk-body'); if (bd) bd.scrollTop = y; if (focus) rp.querySelector(focus)?.focus({ preventScroll: true }); };
    ring.onclick = () => { if (rp.hidden) { const sv = LS.get('phoenix.dockview'); view = VIEWS().includes(sv) ? sv : 'member'; paint(); scrim.hidden = false; place(ring, rp, true); rp.querySelector('a,button')?.focus({ preventScroll: true }); poll(); } else closeR(); };
    rp.addEventListener('click', (e) => {
      if (e.target.closest('[data-x]')) { closeR(); ring.focus(); return; }
      if (e.target.closest('[data-top]')) { goto(0); closeR(); return; }
      if (e.target.closest('[data-end]')) { goto(d.documentElement.scrollHeight); closeR(); return; }
      const v = e.target.closest('[data-view]'); if (v) { if (VIEWS().includes(v.dataset.view)) { view = v.dataset.view; LS.set('phoenix.dockview', view); paint(`[data-view="${view}"]`); } return; }
      if (e.target.closest('[data-issue]')) { closeR(); const f = d.querySelector('.nxr-fab button, .nxr-fab'); if (f) f.click(); return; }
      if (e.target.closest('[data-edit]')) { closeR(); d.querySelector('.gr-fab')?.click(); return; }
      const as = e.target.closest('.dk-chip[data-as]');
      if (as && canPreview()) { try { localStorage.setItem(API && !w.PF_MOCK ? 'phoenix.viewas' : 'phoenix.as', as.dataset.as); if (API && !w.PF_MOCK) localStorage.setItem('phoenix.viewas.t', String(Date.now())); } catch {} location.reload(); return; }
      const j = e.target.closest('[data-jump]'); if (j) { e.preventDefault(); const t = d.getElementById(j.getAttribute('href').slice(1)); if (t) { const y = scrollY + t.getBoundingClientRect().top - 90; goto(y); } closeR(); return; }
      const p = e.target.closest('[data-pin]'); if (p) { (p.dataset.ps === 's' ? pinsStaff : pinsNav).toggle(p.dataset.pin, p.dataset.l, p.dataset.e); paint(`[data-pin="${CSS.escape(p.dataset.pin)}"]`); }
    });
    closeAll = closeR; tabHide();
    addEventListener('scroll', () => { if (!progress.t) progress.t = requestAnimationFrame(() => { progress.t = 0; progress(); }); }, { passive: true }); progress();

    // the waiting count for managers and the owner rides on the one badge
    const bubble = ring.querySelector('.dk-n');
    const poll = async () => {
      if (d.hidden || !A?.token || !isStaff()) { bubble.hidden = true; return; }
      try { queue = await A.call('/api/manager/queue'); } catch { queue = queue || {}; }
      const n = waiting(); bubble.hidden = !n; bubble.textContent = n > 99 ? '99+' : String(n); ring.setAttribute('aria-label', n ? `Menu, ${n} waiting` : 'Menu');
      if (!rp.hidden && view === 'manager') paint();
    };
    (A?.ready || Promise.resolve()).then(() => { poll(); if (!poller) poller = setInterval(poll, 60e3); });
    d.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !rp.hidden) { closeR(); ring.focus(); } });
    // modal backdrop: while the menu is open everything outside it is inert. Taps on the blurred area are swallowed (no pass-through, no close); close with the ✕, Escape or the ring.
    ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click', 'contextmenu'].forEach((t) => d.addEventListener(t, (e) => {
      if (rp.hidden || rp.contains(e.target) || ring.contains(e.target)) return;
      e.stopPropagation(); if (e.cancelable) e.preventDefault();
    }, { capture: true, passive: false }));
  }
  // saved pins arrive with the profile; adopt them once the session is known, then mount
  const boot = () => { const pr = A?.prefs; if (pr) { if ('pins' in pr) pinsNav.adopt(pr.pins); if ('spins' in pr) pinsStaff.adopt(pr.spins); } mount(); };
  if (A?.ready) A.ready.then(boot, mount); else mount();
})();
