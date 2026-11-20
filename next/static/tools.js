// Staff › Tools: the moderation tools, mounted inside the Control Center (PF-022 step 8), one tool per sidebar entry (PFTools.open(tab)); the in-page tab chips are hidden there.
//   Submissions – GET /api/admin/submissions?type=&q=  (+ CSV export in the browser)          (the Boardroom Audit's Submissions view was this one, retired)
//   Reports     – GET /api/admin/reports, POST /api/feed/delete|unreport, /api/feedback/hide, /api/chats/reports/:id {action: clear|remove}   (likewise)
//   Game data   – GET /api/game/admin, POST /api/game/publish, /api/game/dismiss
//   Awards      – GET /api/awards, POST /api/awards/category|category/remove|close|settings, GET /api/events/discord (channels)
// The Bot tab (settings, notification routing, commands) moved to the Control Center's Bot settings and Bot commands panels (GET/POST /api/controlcenter/settings...).
(() => {
  const d = document, root = d.getElementById('tlLive'); if (!root) return;
  const A = window.NorexAuth, M = window.NorexMotion, API = window.NOREX_API;
  if (!API || !A?.token) return;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const call = (path, body) => (body ? A.call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) : A.call(path));
  const toast = (m, err) => M?.toast ? M.toast(m, err ? { kind: 'err' } : { kind: 'ok' }) : console.log(m);
  const ago = (t) => { const s = Math.max(1, Math.round((Date.now() - t) / 1000)); return s < 90 ? 'just now' : s < 5400 ? Math.round(s / 60) + ' min ago' : s < 129600 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago'; };
  const empty = (icon, title, text) => `<div class="panel sq-empty"><span>${icon}</span><div><b>${esc(title)}</b><p class="muted small">${esc(text || '')}</p></div></div>`;
  const skel = '<div class="dg-skel"><i></i></div>';
  const TABS = [['subm', '📥 Submissions'], ['reports', '🚩 Reports'], ['game', '🎮 Game data'], ['awards', '🏆 Awards']];
  const SUBM = { feedback: '💌 Feedback', ratings: '🌟 Ratings', awardVotes: '🏆 Award votes', predictions: '🔮 Predictions', suggestions: '💡 Suggestions', builds: '🧬 Builds' };
  const SRC = { post: '📰 Post', feedback: '💌 Feedback', message: '💬 Message' };
  const GRP = { GK: '🧤 Keepers', DEF: '🛡️ Defenders', MID: '🎯 Midfielders', FWD: '⚽ Forwards', any: '👥 Anyone' };
  const S = { tab: 'subm', type: 'feedback', q: '', rows: null, reports: null, game: null, form: null, awards: null, channels: null, ask: null, busy: false, err: {} };
  const bump = (v) => { const m = String(v || 'fc27').match(/^(.*?)(\d+)$/); return m && /-v$|-tu$|\.$/.test(m[1]) ? m[1] + (+m[2] + 1) : `${v}-v2`; };
  const sel = (list, cur) => list.map(([v, l]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`).join('');
  const failed = (k, what) => (S.err[k] ? empty('⚠️', `Could not load ${what}`, S.err[k]) : null);
  // two taps for anything destructive: the first arms the button (it says so), the second does it
  const two = (key, label, cls = 'chip danger', attrs = '') => `<button class="${cls}" type="button" ${attrs} data-two="${esc(key)}">${S.ask === key ? 'Sure? Tap again' : label}</button>`;

  // ---------- Submissions ----------
  async function loadSubm(type = S.type, q = S.q) {
    S.type = type; S.q = q; S.rows = null; paint();
    try { S.rows = (await call(`/api/admin/submissions?type=${encodeURIComponent(type)}&q=${encodeURIComponent(q)}`)).rows || []; S.err.subm = null; } catch (e) { S.err.subm = e.message; S.rows = []; }
    if (S.tab === 'subm') paint();
  }
  function subm() {
    const rows = S.rows;
    return `<form class="chips dk-row" data-subm-form><select name="type" aria-label="Type">${sel(Object.entries(SUBM), S.type)}</select><input name="q" value="${esc(S.q)}" placeholder="Search author, text…" aria-label="Search" style="flex:1;min-width:160px"><button class="chip" type="submit">Search</button><button class="chip" type="button" data-csv${rows?.length ? '' : ' disabled'}>⬇️ Export CSV</button></form>
${S.err.subm ? empty('⚠️', 'Could not load submissions', S.err.subm) : rows === null ? skel : rows.length ? `<div class="panel" style="overflow-x:auto;margin-top:14px"><table class="tbl"><caption class="sr">Submissions</caption><thead><tr><th scope="col">When</th><th scope="col">Author</th><th scope="col">Subject</th><th scope="col">Detail</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${ago(r.at)}</td><td>${esc(r.author ?? '–')}</td><td>${esc(r.subject ?? '–')}</td><td>${r.kind ? `<span class="pill">${esc(r.kind)}</span> ` : ''}${esc((r.body || '').slice(0, 160))}${r.reported ? ' <span class="pill loss">🚩 reported</span>' : ''}</td></tr>`).join('')}</tbody></table></div>` : empty('📭', 'Nothing here', 'No submissions of this type match.')}`;
  }
  function csv() {
    const cols = ['at', 'author', 'subject', 'kind', 'body'], cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const text = [cols.join(','), ...S.rows.map((r) => cols.map((c) => cell(c === 'at' ? new Date(r.at).toISOString() : r[c])).join(','))].join('\r\n');
    const a = Object.assign(d.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type: 'text/csv' })), download: `${(window.NOREX?.slug || 'club')}-${S.type}-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- Reports ----------
  function reports() {
    const f = failed('reports', 'reports'); if (f) return f;
    if (!S.reports) return skel;
    return `<p class="muted small">Everything a member has flagged, across the feed, anonymous feedback and chats.</p>${S.reports.length ? `<div class="dk-grid">${S.reports.map((r) => { const key = `${r.source}:${r.id}`; return `<article class="panel dk-card"><div><span class="pill">${SRC[r.source] ?? esc(r.source)}</span> <b>${esc(r.author ?? '–')}</b>${r.reason ? ` <span class="muted">“${esc(r.reason)}”</span>` : ''}</div><p class="muted small">${esc(r.excerpt || '')}</p><small class="muted">${ago(r.at)}</small>
<div class="dk-btns">${r.link && /^[\w./#?=&%-]+$/.test(r.link) ? `<a class="chip" href="${esc(r.link)}">Open</a>` : ''}<button class="chip" type="button" data-rep="clear" data-src="${esc(r.source)}" data-id="${esc(r.id)}">✓ Clear report</button>${two('rm:' + key, '🗑 Remove', 'chip danger', `data-rep="remove" data-src="${esc(r.source)}" data-id="${esc(r.id)}"`)}</div></article>`; }).join('')}</div>` : empty('🎉', 'Nothing reported', 'No content is waiting for review.')}`;
  }
  async function repAct(src, id, remove) {
    if (src === 'post') await call(remove ? '/api/feed/delete' : '/api/feed/unreport', { id: Number(id) });
    else if (src === 'feedback') await call('/api/feedback/hide', { id: Number(id), hidden: remove });
    else await call(`/api/chats/reports/${encodeURIComponent(id)}`, { action: remove ? 'remove' : 'clear' });
    S.reports = S.reports.filter((r) => !(r.source === src && String(r.id) === String(id)));
    paint(); toast(remove ? 'Removed' : 'Report cleared');
  }

  // ---------- Game data ----------
  function game() {
    const f = failed('game', 'game data'); if (f) return f;
    if (!S.game) return skel;
    const { current: c, versions, pending, keys } = S.game, cap = c.levelCap || {}, pend = pending.filter((p) => !p.same);
    const fm = S.form ??= { version: bump(c.version), levelCap: cap.value ?? '', verified: !!cap.verified, source: cap.verified ? cap.source : '', note: '', changes: '', pending: null, notify: true };
    return `<div class="panel dk-card"><div><small class="muted">🔝 Max level now</small><div style="font:700 34px Oswald">${esc(cap.value ?? '–')} ${cap.verified ? '<span class="pill win">✓ Official</span>' : '<span class="pill">Unverified</span>'}</div></div><p class="muted small">Version <code>${esc(c.version)}</code>${c.publishedBy ? ` · by ${esc(c.publishedBy)} ${ago(c.publishedAt)}` : ' · starting dataset'}. The builder and Pro Builds read this; changing the max level here changes it everywhere, no code change.</p></div>
<h4 class="dk-h">📢 From EA's patch notes${pend.length ? ` (${pend.length})` : ''}</h4>
${pend.length ? `<div class="dk-grid">${pend.map((p) => `<article class="panel dk-card"><div><b>${esc(p.title)}</b><br><small class="muted">${esc(String(p.published).slice(0, 10))} · ${esc(p.section)}</small></div><q class="small">${esc(p.quote)}</q>
<div class="dk-btns">${p.value ? `<span class="pill gold">Level ${esc(p.value)}</span>` : '<small class="muted">No number in this sentence.</small>'}<a class="chip" href="${esc(p.url)}" target="_blank" rel="noopener">Open note ↗</a><button class="chip danger" type="button" data-g="dismiss" data-id="${esc(p.id)}">Dismiss</button>${p.value ? two('ga:' + p.id, `✅ Set max level ${p.value}`, 'btn', `data-g="apply" data-id="${esc(p.id)}"`) : `<button class="btn" type="button" data-g="use" data-id="${esc(p.id)}">Use in form</button>`}</div></article>`).join('')}</div>` : empty('🎉', 'Nothing to confirm', 'When EA’s Pitch Notes mention a level cap, it shows up here for one-click confirmation.')}
<h4 class="dk-h">🛠 Publish a new version</h4>
<form class="panel dk-nf" data-g-form><label>Version name<input name="version" value="${esc(fm.version)}" maxlength="40" required pattern="[a-z0-9][a-z0-9.\\-]*" placeholder="fc27-tu2"></label>
<label>Max level<input name="levelCap" type="number" min="1" max="200" value="${esc(fm.levelCap)}" required></label>
<label><input name="verified" type="checkbox"${fm.verified ? ' checked' : ''}> Confirmed by an official EA note</label><label><input name="notify" type="checkbox"${fm.notify !== false ? ' checked' : ''}> 🔔 Tell members what changed</label>
<label>Source link<input name="source" type="url" value="${esc(fm.source || '')}" placeholder="https://www.ea.com/games/ea-sports-fc/fc-27/news/…"></label>
<label>Note<input name="note" value="${esc(fm.note)}" maxlength="300" placeholder="What changed, e.g. Title Update 2: cap raised"></label>
<label>Changed values <small class="muted">(optional JSON – replaces: ${keys.map(esc).join(', ')})</small><textarea name="changes" rows="4" spellcheck="false" placeholder='{"apPerLevel": [2, 2, 3]}'>${esc(fm.changes)}</textarea></label>
<div class="dk-btns"><button class="btn" type="submit"${S.busy ? ' disabled' : ''}>🚀 Publish version</button><button class="chip" type="button" data-g="download">⬇ Current dataset (JSON)</button></div></form>
<h4 class="dk-h">🗂 History</h4><div class="panel" style="overflow-x:auto"><table class="tbl"><caption class="sr">Version history</caption><thead><tr><th scope="col">Version</th><th scope="col">Max level</th><th scope="col">Status</th><th scope="col">Note</th><th scope="col">By</th><th scope="col">When</th></tr></thead><tbody>${versions.map((v, i) => `<tr><td><code>${esc(v.version)}</code>${i ? '' : ' <span class="pill win">live</span>'}</td><td><b>${esc(v.cap ?? '–')}</b></td><td>${v.verified ? `<a href="${esc(v.source)}" target="_blank" rel="noopener">✓ official</a>` : 'unverified'}</td><td>${esc(v.note || '–')}</td><td>${esc(v.by || '–')}</td><td>${v.at ? ago(v.at) : '–'}</td></tr>`).join('')}</tbody></table></div>`;
  }
  const readGame = () => { const f = root.querySelector('[data-g-form]'); if (f) S.form = { ...S.form, version: f.version.value.trim(), levelCap: f.levelCap.value, verified: f.verified.checked, source: f.source.value.trim(), note: f.note.value, changes: f.changes.value, notify: f.notify.checked }; };
  async function publish(extra = {}) {
    readGame(); const body = { ...S.form, levelCap: Number(S.form.levelCap), ...extra }; S.busy = true; paint();
    try { S.game = await call('/api/game/publish', body); S.form = null; toast(`Published ${body.version} – max level ${body.levelCap}${S.game.told ? ` · ${S.game.told} told` : ''}`); } catch (e) { toast(e.message, true); }
    S.busy = false; paint();
  }

  // ---------- Awards ----------
  function awards() {
    const f = failed('awards', 'the awards'); if (f) return f;
    const a = S.awards; if (!a) return skel;
    if (!a.canManage) return empty('🔒', 'Managers only', 'Awards admin is for managers and the owner.');
    return `<div class="panel dk-card"><div><b>🏆 This week</b><p class="muted small" style="margin:4px 0 0">${a.closed ? '🔒 Voting is closed – results are out.' : `Voting closes Sunday 24:00 UTC · ${a.voters ?? 0} member${a.voters === 1 ? '' : 's'} voted so far.`}</p></div><div class="dk-btns">${a.closed ? '' : two('aw:close', '🔒 Close this week now', 'btn', 'data-aw="close"')}</div></div>
<h4 class="dk-h">Categories on the ballot</h4><ul class="dk-log">${a.categories.map((c) => `<li><span>${esc(c.icon)} <b>${esc(c.name)}</b> <small class="muted">${GRP[c.grp] || GRP.any}${c.builtin ? ' · stats-based' : ''}</small></span>${c.builtin ? '' : two('aw:rm:' + c.id, 'Retire', 'chip danger', `data-aw="retire" data-id="${esc(c.id)}"`)}</li>`).join('')}</ul>
<h4 class="dk-h">➕ New fun award</h4><form class="panel dk-nf" data-aw-form><label>Name<input name="name" maxlength="40" placeholder="Most Non-Sleeper" required></label><label>Icon<input name="icon" maxlength="4" placeholder="😴"></label><label>Nominees<select name="grp">${sel(Object.entries(GRP), 'any')}</select></label><div class="dk-btns"><button class="btn" type="submit">Add to this week’s ballot</button></div></form>
<h4 class="dk-h">📣 Where results are posted</h4><label class="panel dk-nf">Discord channel<select data-aw-ch aria-label="Discord channel for the results"><option value="">Don’t post</option>${(S.channels || []).map((c) => `<option value="${esc(c.id)}"${c.id === a.channel ? ' selected' : ''}>${c.news ? '📢' : '#'} ${esc(c.name)}</option>`).join('')}</select></label>`;
  }

  // ---------- shell ----------
  function paint() {
    if (!root.isConnected) return;
    const focus = d.activeElement?.name ? { n: d.activeElement.name } : null;
    root.innerHTML = `<div class="chips dk-tabs">${TABS.map(([k, n]) => `<button class="chip${S.tab === k ? ' on' : ''}" type="button" data-tab="${k}" data-dl="${k}" data-dl-to=".dk-pane">${n}${k === 'reports' && S.reports?.length ? ` <span class="dk-n">${S.reports.length}</span>` : ''}</button>`).join('')}</div><div class="dk-pane">${{ subm, reports, game, awards }[S.tab]()}</div>`;
    if (focus) root.querySelector(`[name="${focus.n}"]`)?.focus({ preventScroll: true });
  }
  const guard = async (k, fn) => { try { const r = await fn(); S.err[k] = null; return r; } catch (e) { S.err[k] = e.message; return null; } };
  const need = async (tab) => {
    if (tab === 'subm' && S.rows === null && !S.err.subm) return loadSubm();
    if (tab === 'reports' && !S.reports) S.reports = (await guard('reports', () => call('/api/admin/reports')))?.items ?? null;
    if (tab === 'game' && !S.game) S.game = await guard('game', () => call('/api/game/admin'));
    if (tab === 'awards') {
      if (!S.awards) S.awards = await guard('awards', () => call('/api/awards'));
      if (!S.channels) S.channels = await call('/api/events/discord').then((t) => (t.ready ? t.channels : [])).catch(() => []);
    }
    if (S.tab === tab) paint();
  };
  const act = async (fn) => { try { await fn(); } catch (e) { S.busy = false; paint(); toast(e.message, true); } };

  root.addEventListener('click', (ev) => {
    const t = ev.target.closest('button'); if (!t) return; const k = t.dataset;
    if (k.two !== undefined && S.ask !== k.two) { S.ask = k.two; paint(); setTimeout(() => { if (S.ask === k.two) { S.ask = null; paint(); } }, 4000); return; }
    S.ask = null;
    if (k.tab) { S.tab = k.tab; paint(); need(k.tab); }
    else if (k.csv !== undefined) csv();
    else if (k.rep) act(() => repAct(k.src, k.id, k.rep === 'remove'));
    else if (k.g === 'download') { const a = Object.assign(d.createElement('a'), { href: URL.createObjectURL(new Blob([JSON.stringify(S.game.current, null, 1)], { type: 'application/json' })), download: `${S.game.current.version}.json` }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
    else if (k.g) {
      const hit = S.game.pending.find((p) => p.id === k.id); if (!hit) return;
      if (k.g === 'apply') act(() => publish({ levelCap: hit.value, verified: true, source: hit.url, note: `${hit.title}: max level ${hit.value}`, pending: hit.id }));
      else if (k.g === 'use') { readGame(); S.form = { ...S.form, verified: true, source: hit.url, note: hit.title, pendingId: hit.id }; paint(); root.querySelector('[name=levelCap]')?.focus(); }
      else if (k.g === 'dismiss') act(async () => { S.game = await call('/api/game/dismiss', { id: hit.id }); paint(); toast('Dismissed'); });
    } else if (k.aw === 'close') act(async () => { S.awards = await call('/api/awards/close', {}); paint(); toast('Week closed – winners are out'); });
    else if (k.aw === 'retire') act(async () => { S.awards = await call('/api/awards/category/remove', { id: Number(k.id) }); paint(); toast('Award retired'); });
  });
  root.addEventListener('submit', (ev) => {
    ev.preventDefault(); const f = ev.target;
    if (f.matches('[data-subm-form]')) loadSubm(f.type.value, f.q.value.trim());
    else if (f.matches('[data-g-form]')) act(() => publish(S.form?.pendingId ? { pending: S.form.pendingId } : {}));
    else if (f.matches('[data-aw-form]')) act(async () => { const el = f.elements; S.awards = await call('/api/awards/category', { name: el.namedItem('name').value, icon: el.namedItem('icon').value, grp: el.namedItem('grp').value }); paint(); toast('Award added to this week’s ballot'); });
  });
  root.addEventListener('change', (ev) => {
    if (ev.target.matches('[data-aw-ch]')) act(async () => { S.awards = await call('/api/awards/settings', { channel: ev.target.value }); paint(); toast(ev.target.value ? 'Results will be posted there' : 'No Discord post'); });
  });
  let started = false;
  const start = () => { if (started) return; started = true; d.getElementById('tlLocal')?.setAttribute('hidden', ''); root.hidden = false; paint(); };
  // the Control Center sidebar opens a tool: PFTools.open('reports'); false when it does not exist or the viewer is not staff
  window.PFTools = { tabs: TABS.map(([k]) => k), open: (k) => { if (!TABS.some(([t]) => t === k) || !['manager', 'owner'].includes(A.ccRole || A.role)) return false; start(); S.tab = k; paint(); need(k); return true; } };
  (async () => {
    await A.ready?.catch?.(() => {});
    if (!['manager', 'owner'].includes(A.ccRole || A.role)) return;
    if (!root.closest('.cx')) { start(); need('subm'); } // a stand-alone page keeps the first tab; inside the Control Center the sidebar picks
  })();
})();
