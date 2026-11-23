// Staff › Control Center shell (PF-022 step 7, deck layout 2026-11-23). NO SIDEBAR: a top bar, a row of decks, the open deck's tool row, then the tool.
//   * the router: #<tool id> opens a tool in place, #deck-<id> opens a deck (a grid of its tools with live counts), #home is the Overview. Module kinds (staff manifest):
//     home | org + controlcenter:<panel> (controlcenter.js, orgpanel.js, ccsettings.js) | br (boardroom.js) | tl (tools.js) | rq (ccrequests.js) | pp (ccpeople.js)
//     | pg: a moved page (Schedule, Dugout, Desk, Content, Insights, Card artwork) whose own script is loaded the first time the tool opens
//   * the Overview: every deck as a card, then Health + Insights + the approvals queue + the audit log as ONE data layer (DL) with ONE filter state (F). Every tile, bar, chip and
//     the search box write F; every view reads rows through apply(), so a click anywhere cross-filters the rest. Only existing routes are used:
//       GET /api/admin/health   GET /api/insights?keys=   GET /api/manager/queue   GET /api/controlcenter/requests   and the audit rows of GET /api/controlcenter (shared through PFCC.data())
//   * reusable blocks: stat tile with sparkline, filter chips, sortable and exportable table, drawer, status pills, empty/error/loading, toast, confirm,
//     Ctrl+K palette, saved views (this browser), copy-link of a filtered view.
(() => {
  const d = document, w = window, root = d.getElementById('cx'); if (!root) return;
  const MAN = w.PFStaffManifest || { sections: [], tools: [] }, A = w.NorexAuth, M = w.NorexMotion, API = w.NOREX_API;
  const $ = (s, r = d) => r.querySelector(s), $$ = (s, r = d) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const ic = (id, cls = '') => `<svg class="cx-i${cls ? ' ' + cls : ''}" aria-hidden="true" focusable="false"><use href="#${id}"/></svg>`;
  const ago = (t) => { const s = Math.max(1, Math.round((Date.now() - t) / 1000)); return s < 90 ? 'just now' : s < 5400 ? Math.round(s / 60) + ' min ago' : s < 129600 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago'; };
  const call = (p) => A.call(p);
  const store = { get(k, f) { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  const tool = (id) => MAN.tools.find((t) => t.id === id);

  // ---------- blocks: toast, confirm, drawer, empty, skeleton ----------
  const toast = (m, err) => { if (M?.toast) return M.toast(m, { kind: err ? 'err' : 'ok' }); let e = $('#cxToast'); if (!e) { e = d.createElement('div'); e.id = 'cxToast'; e.setAttribute('role', 'status'); e.className = 'cx-toast'; root.appendChild(e); } e.textContent = m; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { e.hidden = true; }, 2600); };
  const empty = (icon, title, text) => `<div class="cx-empty">${ic(icon)}<div><b>${esc(title)}</b>${text ? esc(text) : ''}</div></div>`;
  const skel = '<div class="cx-skel" aria-label="Loading"></div>';
  const sheet = (html, onClose) => { closeSheet(); const e = d.createElement('div'); e.className = 'cx-drawer'; e.id = 'cxSheet'; e.setAttribute('role', 'dialog'); e.setAttribute('aria-modal', 'true'); e.innerHTML = `<button type="button" class="cx-x" data-x aria-label="Close">${ic('i-x')}</button>${html}`; e.onclose = onClose; root.appendChild(e); e.querySelector('[data-x]').addEventListener('click', closeSheet); (e.querySelector('[data-focus]') || e.querySelector('[data-x]')).focus(); return e; };
  const closeSheet = () => { const e = $('#cxSheet'); if (e) { e.remove(); e.onclose?.(); } };
  const confirmBox = (msg, yes = 'Remove') => new Promise((ok) => { const e = sheet(`<h3>${esc(msg)}</h3><div class="cx-chips"><button type="button" class="cx-chip on" data-focus data-y>${esc(yes)}</button><button type="button" class="cx-chip" data-n>Cancel</button></div>`, () => ok(false)); e.querySelector('[data-y]').onclick = () => { e.onclose = null; closeSheet(); ok(true); }; e.querySelector('[data-n]').onclick = closeSheet; });

  // ---------- router ----------
  const hashOf = () => { const tp = new URLSearchParams(location.search).get('tool'); if (tp && !location.hash) history.replaceState(null, '', location.pathname + '#' + tp); const h = location.hash.slice(1), [id, q] = h.split('?'); return { id: id || 'home', q: new URLSearchParams(q || '') }; };
  let cur = 'home';
  const deckTitle = (id) => (MAN.sections.find((x) => x[0] === id) || [])[1] || '';
  // old anchors (#switches, #hof, #bot ...) from the retired Boardroom and Tools pages and the owner button: one flat map built from the manifest
  const ALIAS = Object.assign({}, ...Object.values(MAN.legacyHash || {}).map((m) => Object.fromEntries(Object.entries(m).filter(([k]) => k))));
  // PF-022 step 9: who may use what comes from the manifest matrix (staffmanifest.js: matrix), for the role the Control Center treats you as (A.ccRole: the owner's View as preview included).
  // The Worker enforces the same matrix (bot/ccpermissions.js), so this only decides what to show.
  const eff = () => A?.ccRole || null;
  const may = (id) => !!(MAN.matrix || {})[eff()]?.includes(id);
  const owner = () => eff() === 'owner';
  const kindOf = (t) => (t.module === 'home' ? 'home' : /^(org|controlcenter:)/.test(t.module) ? 'cc' : t.module.split(':')[0]); // home | cc | br | tl | pg | rq | pp
  const HOSTS = { cc: '#ccLive', br: '#brLive', tl: '#tlLive', pg: '#pgLive', rq: '#rqLive', pp: '#ppLive' };
  // the tools a role may open in a deck: a deck with none for it (Organization for a manager) is hidden
  const deckTools = (id) => MAN.tools.filter((t) => t.section === id && may(t.id));
  const setNav = (id, deck) => {
    $$('.cx-deck', root).forEach((a) => { if (a.dataset.deck === deck) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    $$('.cx-tools', root).forEach((r) => { r.hidden = r.dataset.deck !== deck; });
    $$('.cx-nav', root).forEach((a) => { if (a.dataset.tool === id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    const on = $('.cx-nav[aria-current="page"]', root); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'center' });
  };
  const crumb = (deck, label) => { const el = $('#cxCrumb'); if (!el) return; el.innerHTML = deck && deck !== 'overview' ? `<a href="#home">Control Center</a><i>›</i><a href="#deck-${esc(deck)}">${esc(deckTitle(deck))}</a>${label ? `<i>›</i><span>${esc(label)}</span>` : ''}` : `<span>Control Center</span>${label && label !== 'Dashboard' ? `<i>›</i><span>${esc(label)}</span>` : ''}`; };
  const panes = () => { const home = $('#cxHome'), dk = $('#cxDeck'); if (home) home.hidden = true; if (dk) dk.hidden = true; for (const sel of Object.values(HOSTS)) { const el = $(sel); if (el) el.hidden = true; } };
  // a deck opens as a grid of its tools: name, what it does, and the count waiting where the Worker told us one
  function showDeck(id) {
    const def = MAN.sections.find((x) => x[0] === id); if (!def || id === 'overview' || !deckTools(id).length) return show('home');
    cur = 'deck-' + id; panes(); const el = $('#cxDeck'); el.hidden = false;
    $('#cxTitle').textContent = def[1]; $('#cxSubtitle').textContent = (def[3] || '') + '. Changes made in a tool apply at once: no deploy, no code change.'; crumb(id, '');
    el.innerHTML = `<div class="cx-decksgrid cx-toolcards">${deckTools(id).map((t) => `<a class="cx-dcard cx-tcard" href="${esc(t.href)}" data-tool="${esc(t.id)}" data-module="${esc(t.module)}"><header><h3>${ic(t.icon)} ${esc(t.label)}</h3><b class="cx-n" data-n="${esc(t.id)}" hidden></b></header><p>${esc(t.desc)}</p></a>`).join('')}</div>`;
    setNav('', id); badges();
  }
  function show(id) {
    id = ALIAS[id] || id;
    if (/^deck-/.test(id)) return showDeck(id.slice(5));
    let t = tool(id) && (tool(id).module || id === 'home') ? tool(id) : tool('home');
    if (!may(t.id)) t = tool('home'); // a tool the role may not use is not opened (the deck hides it, the Worker refuses it)
    id = t.id; cur = id;
    const kind = kindOf(t); panes();
    $('#cxTitle').textContent = t.label; $('#cxSubtitle').textContent = t.desc + '. Changes made in a tool apply at once: no deploy, no code change.';
    crumb(t.section, t.label); setNav(id, t.section);
    if (kind === 'home') $('#cxHome').hidden = false;
    else { const host = $(HOSTS[kind]); if (host) host.hidden = !ready; }
    if (kind === 'cc') w.PFCC?.go(t.module === 'org' ? 'org' : t.module.split(':')[1]);
    else if (kind === 'br') w.PFBoardroom?.open(t.module.split(':')[1]);
    else if (kind === 'tl') w.PFTools?.open(t.module.split(':')[1]);
    else if (kind === 'rq') w.PFCCRequests?.open(t.module.split(':')[1]);
    else if (kind === 'pp') w.PFCCPeople?.open(t.module.split(':')[1]);
    else if (kind === 'pg') openPage(t.id);
    else paintHome();
    w.scrollTo?.({ top: Math.max(0, ($('#cx')?.getBoundingClientRect().top || 0) + (w.scrollY || 0) - 72), behavior: 'auto' });
  }
  const go = (id, q) => { const t = tool(id); if (!t && !/^deck-/.test(id)) return; const next = '#' + id + (q ? '?' + q : ''); if (location.hash === next) show(id); else location.hash = next; };
  root.addEventListener('click', (ev) => {
    const a = ev.target.closest('a.cx-nav, a.cx-tcard, a.cx-deck, a.cx-lnk, .cx-crumb a'); if (!a || ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
    const to = a.dataset.tool || (a.dataset.deck ? (a.dataset.deck === 'overview' ? 'home' : 'deck-' + a.dataset.deck) : (a.getAttribute('href') || '').replace(/^.*#/, ''));
    if (to) { ev.preventDefault(); go(to); }
  });
  root.addEventListener('click', (ev) => { if (ev.target.closest('#cxFind')) palette(); });

  // ---------- the moved pages (Schedule, Dugout, Desk, Content, Insights, Card artwork): their own scripts, loaded the first time the tool opens ----------
  const PG = { schedule: { js: ['schedule.js'] }, dugout: { css: ['tactics.css'], js: ['pitch.js', 'dugout.js'] }, desk: { js: ['desk.js'] }, content: { css: ['content.css'], js: ['content.js'] }, insights: { js: ['intel.js'] }, artwork: { js: ['cardstudio.js'] } };
  const loadedPg = {};
  const addCss = (f) => new Promise((ok) => { if (d.querySelector(`link[href="${f}"]`)) return ok(); const l = d.createElement('link'); l.rel = 'stylesheet'; l.href = f; l.onload = l.onerror = ok; d.head.appendChild(l); });
  const addJs = (f) => new Promise((ok) => { if (d.querySelector(`script[src="${f}"]`)) return ok(); const s = d.createElement('script'); s.src = f; s.onload = s.onerror = ok; d.head.appendChild(s); });
  function openPage(id) {
    const host = $('#pgLive'); if (!host) return; host.hidden = !ready;
    const box = $(`.cx-pg[data-pg="${id}"]`, host); $$('.cx-pg', host).forEach((e) => { e.hidden = e !== box; }); if (!box) return;
    const mount = box.lastElementChild, wait = $('[data-pgload]', box), cfg = PG[id] || { js: [] };
    const up = () => mount.childElementCount > 0 && !mount.hidden;
    if (!loadedPg[id]) loadedPg[id] = (async () => { for (const f of cfg.css || []) await addCss(f); for (const f of cfg.js) await addJs(f); })();
    if (up()) { wait.hidden = true; return; }
    wait.hidden = false; wait.innerHTML = skel;
    loadedPg[id].then(() => { let n = 0; const t = setInterval(() => { n += 1; if (up() || n > 60) { clearInterval(t); if (up()) wait.hidden = true; else wait.innerHTML = empty('i-pulse', 'This tool did not open', 'Reload the page. If it keeps happening the live club server is not answering: check Health.'); } }, 150); });
  }

  // ---------- the one data layer ----------
  const DL = { health: undefined, notes: undefined, queue: undefined, requests: undefined, audit: undefined, ping: null, err: {} };
  const NOTE_KEYS = ['club', 'matches.last5', 'club.records', 'leaders.goals', 'leaders.rating', 'leaders.assists', 'leaders.motm'];
  const QUEUE_TOOL = { claims: ['People', 'Player claims', 'desk'], cards: ['Club content', 'Card Studio photos', 'artwork'], rush: ['People', 'Rush results', 'desk'], requests: ['People', 'Requests', 'desk'], ideas: ['Club content', 'Ideas to review', 'content'] };
  // what the Worker counts for the requests and uploads deck (GET /api/controlcenter/requests): [deck, what, tool]
  const REQ_TOOL = { emojis: ['Requests and uploads', 'Emoji and sticker suggestions', 'emojis'], absences: ['People', 'Absence notices to acknowledge', 'absences'], gifsRunning: ['Requests and uploads', 'GIFs being made', 'media'] };
  async function loadAll() {
    const t0 = performance.now();
    const [h, n, q, rq] = await Promise.allSettled([call('/api/admin/health'), call('/api/insights?keys=' + NOTE_KEYS.map(encodeURIComponent).join(',')), call('/api/manager/queue'), call('/api/controlcenter/requests')]);
    DL.health = h.status === 'fulfilled' ? h.value : null; DL.ping = h.status === 'fulfilled' ? Math.round(performance.now() - t0) : null; if (h.status === 'rejected') DL.err.health = h.reason?.message || 'failed';
    DL.notes = n.status === 'fulfilled' ? (n.value.insights || []) : null; if (n.status === 'rejected') DL.err.notes = n.reason?.message || 'failed';
    DL.queue = q.status === 'fulfilled' ? q.value : null; if (q.status === 'rejected') DL.err.queue = q.reason?.message || 'failed';
    DL.requests = rq.status === 'fulfilled' ? rq.value : null; if (rq.status === 'rejected') DL.err.requests = rq.reason?.message || 'failed';
    takeAudit(); paintHome(); badges();
  }
  const takeAudit = () => { const x = w.PFCC?.data?.(); if (x && Array.isArray(x.audit)) DL.audit = x.audit; };
  w.addEventListener('pfcc:data', () => { takeAudit(); if (cur === 'home') paintHome(); });
  const dayOf = (t) => new Date(t).toISOString().slice(0, 10);
  const statusOfRun = (r) => (!r ? 'grey' : r.conclusion === 'success' ? 'ok' : r.conclusion === 'failure' ? 'bad' : ['in_progress', 'queued'].includes(r.status) ? 'busy' : 'grey');
  /** every source flattened into one row shape: { id, type, what, detail, who, at, n, status, tool, url } */
  function rows() {
    const out = [], h = DL.health;
    if (h) {
      const runs = h.actions?.runs || [], run = (re) => runs.find((r) => re.test(r.name)), upd = run(/update/i), pages = run(/pages/i), bot = run(/bot|worker/i);
      const built = w.NOREX?.updated || d.querySelector('footer time[datetime]')?.getAttribute('datetime'), age = built ? Date.now() - Date.parse(built) : null;
      const hr = (id, what, status, detail, at, url) => out.push({ id: 'h:' + id, type: 'health', what, detail, who: '', at: at || null, n: 0, status, tool: 'home', url });
      hr('ea', 'EA data', age === null ? 'grey' : age < 30 * 6e4 ? 'ok' : age < 3 * 36e5 ? 'busy' : 'bad', built ? 'fetched ' + ago(Date.parse(built)) : 'unknown', built ? Date.parse(built) : 0, upd?.url);
      hr('build', 'Site build', statusOfRun(upd), upd ? `${upd.conclusion || upd.status} · ${ago(upd.at)}` : (h.actions?.ready === false ? h.actions.error : 'no runs found'), upd?.at, upd?.url);
      hr('pages', 'Pages', pages ? statusOfRun(pages) : statusOfRun(upd), pages ? `${pages.conclusion || pages.status} · ${ago(pages.at)}` : 'deploys with the build', pages?.at, (pages || upd)?.url);
      hr('bot', 'Bot', DL.ping !== null ? 'ok' : 'bad', DL.ping !== null ? `answering · ${DL.ping} ms` : 'not answering', 0, bot?.url);
    }
    if (DL.queue) for (const [k, v] of Object.entries(DL.queue)) { if (typeof v !== 'number' || k === 'at') continue; const m = QUEUE_TOOL[k] || ['Moderation and tools', k.replace(/_/g, ' '), 'submissions']; out.push({ id: 'q:' + k, type: 'queue', what: m[1], detail: `${v} waiting for a decision · ${m[0]}`, who: '', at: DL.queue.at || null, n: v, status: v ? 'bad' : 'ok', tool: m[2] }); }
    if (DL.requests) for (const [k, m] of Object.entries(REQ_TOOL)) { const v = +DL.requests[k] || 0; out.push({ id: 'q:' + k, type: 'queue', what: m[1], detail: `${v} waiting · ${m[0]}`, who: '', at: DL.requests.at || null, n: v, status: v ? 'bad' : 'ok', tool: m[2] }); }
    for (const [i, a] of (DL.audit || []).entries()) { const key = a.after?.key || a.before?.key || '', sw = a.before && a.after && a.before.enabled !== a.after.enabled ? (a.after.enabled ? ' · switched on' : ' · switched off') : ''; out.push({ id: 'a:' + i, type: 'change', what: key || a.action, detail: `${a.action}${sw}`, who: String(a.name || a.user_id || ''), at: +a.at || 0, n: 1, status: 'ok', tool: 'audit', day: a.at ? dayOf(+a.at) : '' }); }
    for (const n of DL.notes || []) out.push({ id: 'n:' + n.key, type: 'note', what: n.headline || n.key, detail: n.body || '', who: '', at: n.at || null, n: 1, status: 'ok', tool: 'insights', extra: n.watch });
    return out;
  }
  // ---------- the one filter state ----------
  const TYPES = { queue: 'Waiting', health: 'Systems', change: 'Changes', note: 'Insights' };
  const F = { type: '', who: '', day: '', status: '', q: '', range: 14, sort: 'at', dir: -1, n: 8 };
  const FKEYS = ['type', 'who', 'day', 'status', 'q', 'range'];
  const fromQuery = (q) => { for (const k of FKEYS) { const v = q.get(k); F[k] = k === 'range' ? (+v || 14) : (v || ''); } };
  const toQuery = () => { const p = new URLSearchParams(); for (const k of FKEYS) if (F[k] && !(k === 'range' && F[k] === 14)) p.set(k, F[k]); return p.toString(); };
  const setF = (patch) => { Object.assign(F, patch, 'n' in patch ? {} : { n: 8 }); const q = toQuery(), next = '#home' + (q ? '?' + q : ''); history.replaceState(null, '', next); paintHome(); };
  /** rows filtered by every dimension except `skip` (a view never filters itself, so its own choices stay visible) */
  function apply(skip) {
    const since = Date.now() - F.range * 864e5, q = F.q.trim().toLowerCase();
    return rows().filter((r) => (skip === 'type' || !F.type || r.type === F.type) && (skip === 'who' || !F.who || r.who === F.who) && (skip === 'day' || !F.day || r.day === F.day)
      && (skip === 'status' || !F.status || r.status === F.status) && (r.type !== 'change' || r.at >= since) && (!q || `${r.what} ${r.detail} ${r.who} ${r.type}`.toLowerCase().includes(q)));
  }
  // ---------- home ----------
  const spark = (vals) => { const max = Math.max(1, ...vals), W = 120, H = 26, pts = vals.map((v, i) => [vals.length < 2 ? 0 : (i / (vals.length - 1)) * W, H - 2 - (v / max) * (H - 6)]); const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' '); return `<svg class="cx-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path class="fill" d="${line} L${W} ${H} L0 ${H}Z"/><path d="${line}"/></svg>`; };
  const tile = (key, label, num, cls, sub, sp) => `<button type="button" class="cx-tile ${cls}" data-type="${key}" aria-pressed="${F.type === key}"><small>${esc(label)}</small><span class="cx-num">${esc(num)}</span>${sp || ''}<span class="cx-d">${esc(sub)}</span></button>`;
  const csv = (list) => ['type,what,detail,who,when,status'].concat(list.map((r) => [r.type, r.what, r.detail, r.who, r.at ? new Date(r.at).toISOString() : '', r.status].map((x) => '"' + String(x ?? '').replace(/"/g, '""') + '"').join(','))).join('\n');
  // every deck as a card with its tools: the launcher, so nothing a manager can control is more than two taps from the Overview
  const deckCards = () => `<div class="cx-decksgrid" role="list" aria-label="Decks">${MAN.sections.filter(([id]) => id !== 'overview' && deckTools(id).length).map(([id, title, emoji, sub]) => `<section class="cx-dcard" role="listitem" aria-label="${esc(title)}"><header><div><h3><a class="cx-lnk" href="#deck-${esc(id)}">${emoji} ${esc(title)}</a></h3><p>${esc(sub)}</p></div><b class="cx-n" data-dn="${esc(id)}" hidden></b></header><ul>${deckTools(id).map((t) => `<li><a class="cx-lnk" href="${esc(t.href)}" data-tool="${esc(t.id)}">${ic(t.icon)}<span>${esc(t.label)}</span><b class="cx-n" data-n="${esc(t.id)}" hidden></b></a></li>`).join('')}</ul></section>`).join('')}</div>`;
  function paintHome() {
    const el = $('#cxHome'); if (!el || cur !== 'home' || !ready) return;
    const loading = DL.health === undefined && DL.queue === undefined && DL.requests === undefined;
    if (loading) { el.innerHTML = `<div class="cx-tiles">${skel}${skel}${skel}${skel}</div>${skel}`; return; }
    const base = apply('type'), view = apply(), changes = base.filter((r) => r.type === 'change'), health = base.filter((r) => r.type === 'health'), queue = base.filter((r) => r.type === 'queue'), notes = base.filter((r) => r.type === 'note');
    const days = Array.from({ length: Math.min(F.range, 14) }, (_, i) => dayOf(Date.now() - (Math.min(F.range, 14) - 1 - i) * 864e5)), byDay = apply('day').filter((r) => r.type === 'change');
    const perDay = days.map((dd) => byDay.filter((r) => r.day === dd).length), mx = Math.max(1, ...perDay);
    const waiting = queue.reduce((s, r) => s + r.n, 0), okN = health.filter((r) => r.status === 'ok').length;
    const who = [...byDay.reduce((m, r) => m.set(r.who, (m.get(r.who) || 0) + 1), new Map())].sort((a, b) => b[1] - a[1]).slice(0, 6);
    const list = [...view].sort((a, b) => { const k = F.sort, x = k === 'at' ? a.at || 0 : String(a[k] ?? '').toLowerCase(), y = k === 'at' ? b.at || 0 : String(b[k] ?? '').toLowerCase(); return (x < y ? -1 : x > y ? 1 : 0) * F.dir; });
    const active = FKEYS.filter((k) => F[k] && !(k === 'range' && F.range === 14)), views = store.get('phoenix.cx.views', []);
    const th = (k, l) => `<th scope="col"><button type="button" data-sort="${k}"${F.sort === k ? ` aria-sort="${F.dir > 0 ? 'ascending' : 'descending'}"` : ''}>${l}${ic('i-sort', 'cx-i-s')}</button></th>`;
    const errs = Object.entries(DL.err).map(([k, m]) => `<span class="cx-pill grey" title="${esc(m)}">${esc(k)} unavailable</span>`).join(' ');
    el.innerHTML = `<div class="cx-filterbar" role="group" aria-label="Filters"><input type="search" data-q placeholder="Search the dashboard…" value="${esc(F.q)}" aria-label="Search the dashboard">
<div class="cx-chips">${[7, 14, 30].map((n) => `<button type="button" class="cx-chip${F.range === n ? ' on' : ''}" data-range="${n}">${n} d</button>`).join('')}${active.length ? `<button type="button" class="cx-chip" data-clear>${ic('i-x')}Clear (${active.length})</button>` : ''}<button type="button" class="cx-chip" data-link>${ic('i-link')}Copy link</button><button type="button" class="cx-chip" data-save>${ic('i-star')}Save view</button><button type="button" class="cx-chip" data-refresh>${ic('i-refresh')}Refresh</button></div>
${views.length ? `<div class="cx-chips" aria-label="Saved views">${views.map((v, i) => `<span class="cx-chip"><button type="button" class="cx-vb" data-view="${i}">${esc(v.name)}</button><button type="button" class="cx-vx" data-viewdel="${i}" aria-label="Remove ${esc(v.name)}">${ic('i-x')}</button></span>`).join('')}</div>` : ''}${errs ? `<div class="cx-chips">${errs}</div>` : ''}</div>
<div class="cx-tiles">${tile('queue', 'Waiting for you', waiting, waiting ? '' : 'ok', waiting ? `${queue.filter((r) => r.n).length} queues need a decision` : 'nothing waiting')}
${tile('health', 'Systems healthy', `${okN}/${health.length}`, okN === health.length && health.length ? 'ok' : '', health.some((r) => r.status === 'bad') ? 'something needs a look' : 'all running')}
${tile('change', `Changes · ${F.range} d`, changes.length, 'gold', `${who.length} people made changes`, spark(Array.from({ length: Math.min(F.range, 30) }, (_, i) => base.filter((r) => r.type === 'change' && r.day === dayOf(Date.now() - (Math.min(F.range, 30) - 1 - i) * 864e5)).length)))}
${tile('note', 'Club insights', notes.length, '', 'written from the stored stats')}</div>
${deckCards()}
<div class="cx-grid two"><section class="cx-card" aria-label="Changes by day"><h3>Changes by day</h3>${byDay.length || perDay.some(Boolean) ? `<div class="cx-bars">${days.map((dd, i) => `<button type="button" class="cx-bar1" data-day="${dd}" aria-pressed="${F.day === dd}" aria-label="${dd}: ${perDay[i]} changes"><b>${perDay[i] || ''}</b><i style="height:${Math.round((perDay[i] / mx) * 100)}%"></i><span>${dd.slice(8)}</span></button>`).join('')}</div>` : empty('i-chart', 'No changes in this range', 'Switches saved in the tools appear here.')}
${who.length ? `<div class="cx-chips" style="margin-top:10px">${who.map(([n, c]) => `<button type="button" class="cx-chip${F.who === n ? ' on' : ''}" data-who="${esc(n)}">${esc(n)} · ${c}</button>`).join('')}</div>` : ''}</section>
<section class="cx-card" aria-label="Health"><h3>Health</h3>${health.length ? `<div class="cx-health">${health.map((r) => `<button type="button" class="cx-h1 cx-rowb" data-row="${esc(r.id)}"><span class="cx-pill ${r.status}">${r.status === 'ok' ? 'ok' : r.status === 'bad' ? 'check' : r.status === 'busy' ? 'busy' : 'n/a'}</span><b>${esc(r.what)}</b><small>${esc(r.detail)}</small></button>`).join('')}</div>` : DL.health === null ? empty('i-alert', 'Health not available', DL.err.health) : empty('i-check', 'Nothing matches the filters')}</section></div>
<section class="cx-card" aria-label="Activity"><h3>Everything in view · ${list.length}</h3>${list.length ? `<div class="cx-tablewrap"><table class="cx-t"><caption class="sr">Activity</caption><thead><tr>${th('type', 'Type')}${th('what', 'What')}${th('who', 'Who')}${th('at', 'When')}</tr></thead><tbody>${list.slice(0, F.n).map((r) => `<tr data-row="${esc(r.id)}" tabindex="0"><td data-l="Type"><span class="cx-pill ${r.status}">${esc(TYPES[r.type])}</span></td><td class="what">${esc(r.what)}<br><small class="muted">${esc(r.detail.length > 90 ? r.detail.slice(0, 88) + '…' : r.detail)}</small></td><td data-l="Who">${esc(r.who || '·')}</td><td class="n" data-l="When">${r.at ? esc(ago(r.at)) : '·'}</td></tr>`).join('')}</tbody></table></div>
<div class="cx-more"><span class="muted small">${Math.min(F.n, list.length)} of ${list.length}</span><span class="cx-chips">${list.length > F.n ? `<button type="button" class="cx-chip" data-more>Show more</button>` : ''}<button type="button" class="cx-chip" data-csv>${ic('i-download')}Export CSV</button></span></div>` : empty('i-search', 'Nothing matches', active.length ? 'Clear a filter to see more.' : 'No data yet.')}</section>`;
    badges();
  }
  const byRow = (id) => rows().find((r) => r.id === id);
  function drawer(r) {
    const t = tool(r.tool), url = r.url ? `<a class="cx-chip" href="${esc(r.url)}" target="_blank" rel="noopener">Open run</a>` : '';
    sheet(`<h3>${esc(r.what)}</h3><span class="cx-pill ${r.status}">${esc(TYPES[r.type])}</span><dl><dt>Detail</dt><dd>${esc(r.detail || '·')}</dd>${r.who ? `<dt>Who</dt><dd>${esc(r.who)}</dd>` : ''}${r.at ? `<dt>When</dt><dd>${esc(new Date(r.at).toLocaleString())} (${esc(ago(r.at))})</dd>` : ''}${r.extra ? `<dt>Watch</dt><dd>${esc(r.extra)}</dd>` : ''}</dl><div class="cx-chips">${t && t.id !== 'home' ? `<button type="button" class="cx-chip on" data-focus data-open="${esc(t.id)}">Open ${esc(t.label)}</button>` : ''}${url}</div>`).addEventListener('click', (ev) => { const o = ev.target.closest('[data-open]'); if (o) { closeSheet(); go(o.dataset.open); } });
  }
  $('#cxHome').addEventListener('click', (ev) => {
    const t = ev.target.closest('button,tr[data-row]'); if (!t) return;
    if (t.dataset.type) return setF({ type: F.type === t.dataset.type ? '' : t.dataset.type });
    if (t.dataset.day) return setF({ day: F.day === t.dataset.day ? '' : t.dataset.day });
    if (t.dataset.who) return setF({ who: F.who === t.dataset.who ? '' : t.dataset.who });
    if (t.dataset.range) return setF({ range: +t.dataset.range });
    if ('clear' in t.dataset) return setF({ type: '', who: '', day: '', status: '', q: '', range: 14 });
    if (t.dataset.sort) return setF({ sort: t.dataset.sort, dir: F.sort === t.dataset.sort ? -F.dir : 1 });
    if ('more' in t.dataset) return setF({ n: F.n + 12 });
    if ('refresh' in t.dataset) { DL.health = DL.queue = DL.notes = DL.requests = undefined; paintHome(); w.PFCC?.reload?.(); return loadAll(); }
    if ('link' in t.dataset) { const u = location.href.split('#')[0] + '#home' + (toQuery() ? '?' + toQuery() : ''); return (navigator.clipboard?.writeText(u) || Promise.reject()).then(() => toast('Link to this view copied'), () => toast(u, false)); }
    if ('csv' in t.dataset) { const a = d.createElement('a'); a.href = URL.createObjectURL(new Blob([csv(apply())], { type: 'text/csv' })); a.download = 'control-center.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); return toast('CSV saved'); }
    if ('save' in t.dataset) { const e = sheet(`<h3>Save this view</h3><p class="muted small">Saved in this browser. It remembers the filters and the date range.</p><form class="cx-chips"><input data-focus name="n" maxlength="30" placeholder="Name, for example Last week's changes" aria-label="View name" required style="flex:1 1 200px;min-height:44px;padding:0 12px;border-radius:10px;border:1px solid var(--cx-line);background:rgba(0,0,0,.35);color:inherit"><button class="cx-chip on" type="submit">Save</button></form>`); e.querySelector('form').onsubmit = (x) => { x.preventDefault(); const n = e.querySelector('[name=n]').value.trim(); if (!n) return; const v = store.get('phoenix.cx.views', []).filter((y) => y.name !== n); v.push({ name: n, q: toQuery() }); store.set('phoenix.cx.views', v.slice(-12)); closeSheet(); paintHome(); toast('View saved'); }; return; }
    if (t.dataset.view !== undefined) { const v = store.get('phoenix.cx.views', [])[+t.dataset.view]; if (v) { fromQuery(new URLSearchParams(v.q)); return setF({}); } }
    if (t.dataset.viewdel !== undefined) { const i = +t.dataset.viewdel, v = store.get('phoenix.cx.views', []); return confirmBox(`Remove the saved view "${v[i]?.name}"?`).then((y) => { if (y) { v.splice(i, 1); store.set('phoenix.cx.views', v); paintHome(); } }); }
    const row = t.closest('[data-row]'); if (row) { const r = byRow(row.dataset.row); if (r) drawer(r); }
  });
  $('#cxHome').addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.matches('tr[data-row]')) ev.target.click(); });
  $('#cxHome').addEventListener('input', (ev) => { const t = ev.target; if (t.matches('[data-q]')) { const pos = t.selectionStart; setF({ q: t.value }); const n = $('[data-q]', $('#cxHome')); if (n) { n.focus(); n.setSelectionRange(pos, pos); } } });

  // ---------- sidebar badges: the queue counts per tool ----------
  function badges() {
    const by = {}, dn = {}; for (const r of rows()) if (r.type === 'queue' && r.n) { by[r.tool] = (by[r.tool] || 0) + r.n; const sec = tool(r.tool)?.section; if (sec) dn[sec] = (dn[sec] || 0) + r.n; }
    $$('.cx-n[data-n]', root).forEach((b) => { const n = by[b.dataset.n]; b.hidden = !n; b.textContent = n || ''; });
    $$('.cx-n[data-dn]', root).forEach((b) => { const n = dn[b.dataset.dn]; b.hidden = !n; b.textContent = n || ''; });
  }

  // ---------- Ctrl+K palette: searches the manifest ----------
  function palette() {
    if ($('#cxPal')) return; const e = d.createElement('div'); e.className = 'cx-pal'; e.id = 'cxPal';
    e.innerHTML = `<div role="dialog" aria-modal="true" aria-label="Search every tool"><input type="search" placeholder="Search tools, panels and pages…" aria-label="Search tools" autocomplete="off"><ul role="listbox"></ul></div>`; root.appendChild(e);
    const inp = $('input', e), ul = $('ul', e); let sel = 0, hit = [];
    const paint = () => { const q = inp.value.trim().toLowerCase(); hit = MAN.tools.filter((t) => may(t.id) && (!q || `${t.label} ${t.desc} ${t.keys || ''} ${t.section}`.toLowerCase().includes(q))).slice(0, 12); sel = Math.min(sel, Math.max(0, hit.length - 1));
      ul.innerHTML = hit.map((t, i) => `<li role="option"><a href="${esc(t.href)}" data-t="${esc(t.id)}" class="${i === sel ? 'sel' : ''}">${ic(t.icon)}<span>${esc(t.label)}</span><small>${esc((MAN.sections.find((s) => s[0] === t.section) || [])[1] || '')}</small></a></li>`).join('') || '<li class="muted" style="padding:14px">No tool matches.</li>'; };
    const close = () => { e.remove(); $('#cxFind')?.focus(); };
    inp.addEventListener('input', () => { sel = 0; paint(); });
    inp.addEventListener('keydown', (ev) => { if (ev.key === 'ArrowDown') { sel = Math.min(sel + 1, hit.length - 1); paint(); ev.preventDefault(); } else if (ev.key === 'ArrowUp') { sel = Math.max(0, sel - 1); paint(); ev.preventDefault(); } else if (ev.key === 'Enter' && hit[sel]) { close(); go(hit[sel].id); } else if (ev.key === 'Escape') close(); });
    e.addEventListener('click', (ev) => { const a = ev.target.closest('a[data-t]'); if (a) { ev.preventDefault(); close(); go(a.dataset.t); } else if (ev.target === e) close(); });
    paint(); inp.focus();
  }
  d.addEventListener('keydown', (ev) => { if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') { ev.preventDefault(); palette(); } else if (ev.key === 'Escape') { closeSheet(); $('#cxPal')?.remove(); } });

  // ---------- boot: staff only, after the session is known ----------
  let ready = false;
  w.addEventListener('hashchange', () => { const { id, q } = hashOf(); if (id === 'home') fromQuery(q); if (ready) show(id); });
  // ---------- sign-in, wrong role and View as (PF-022 step 9) ----------
  const gate = $('#cxGate'), viewBar = $('#cxView');
  const showGate = (state) => { // out = signed out, role = signed in but not staff, preview = the owner looking as a member
    const who = (A?.name ? ' as ' + A.name : '') + (A?.roleLabel ? ' (' + A.roleLabel + ')' : '');
    const G = { out: ['Staff sign-in', 'The Control Center is for managers and the owner. Sign in with Discord to continue; you land back here, on the same tool.', 'Sign in with Discord'],
      role: ['Managers and the owner only', `You are signed in${who}. The Control Center is for managers and the owner, so none of its tools are open to you.`, ''],
      preview: ['Previewing as a member', 'This is what a member sees: none of the Control Center. Pick Owner or Manager above to see the tools again.', ''] }[state];
    gate.dataset.state = state; gate.hidden = false; $('#cxGateT').textContent = G[0]; $('#cxGateP').textContent = G[1];
    const go = $('#cxGateGo'); go.textContent = G[2] || 'Back to the site';
    if (G[2]) { go.href = A?.loginUrl ? A.loginUrl() : '#'; go.setAttribute('data-login', ''); } else { go.href = 'index.html'; go.removeAttribute('data-login'); }
    $('#cxGate .cx-gate-b').hidden = !G[2];
    $('#cx')?.setAttribute('hidden', ''); root.hidden = true;
  };
  const paintView = () => { // the owner's View as strip: real owners only, always reachable so there is a way back
    if (!viewBar || !A?.session || A.role !== 'owner') return;
    viewBar.hidden = false; const cur = A.ccView || 'owner';
    $$('[data-view]', viewBar).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === cur)));
    $('#cxViewN').textContent = cur === 'owner' ? 'Preview what a manager or a member sees. Requests are answered as that role; your real permissions do not change.' : `Previewing as ${cur === 'manager' ? 'a manager' : 'a member'}: the Worker answers as that role. Your real permissions do not change.`;
    viewBar.classList.toggle('on', cur !== 'owner');
  };
  viewBar?.addEventListener('click', (ev) => { const b = ev.target.closest('[data-view]'); if (b) A.setCcView(b.dataset.view === 'owner' ? '' : b.dataset.view); });
  (async () => {
    await A?.ready?.catch?.(() => {});
    paintView();
    if (!A?.session) { showGate('out'); return; } // signed out: the sign-in gate
    if (eff() !== 'owner' && eff() !== 'manager') { showGate(A.ccView === 'member' ? 'preview' : 'role'); return; } // wrong role: no tools, no requests
    gate.hidden = true;
    $$('a.cx-nav[data-tool]', root).forEach((a) => { a.hidden = !may(a.dataset.tool); }); // a tool the role may not use is not drawn (the Worker refuses it too)
    $$('.cx-deck', root).forEach((a) => { a.hidden = a.dataset.deck !== 'overview' && !deckTools(a.dataset.deck).length; }); // Organization has nothing for a manager
    if (!API || !A?.token) return;
    ready = true;
    const { id, q } = hashOf(); fromQuery(q); show(id); loadAll();
  })();
})();
