// Staff › Control Center › Requests and uploads (deck layout 2026-11-23): everything members send the bot or the site that a manager looks at, one tool each (PFCCRequests.open(tab)).
//   emojis  Emoji and stickers   GET /api/emoji/review, GET /api/emoji/review/file?id=, POST /api/emoji/review/decide {id, action: approve|reject}
//   media   GIFs and highlights  GET /api/controlcenter/media, POST /api/controlcenter/media/remove {kind: gif|highlight, id}; files open from GET /media/<key>
//   board   Rush leaderboard     GET /api/lb, POST /api/lb/scan|save|remove|season  (the photo upload, check, post and season clock that used to sit on rushboard.html)
//   season  Season stat cards    GET /api/seasoncard, POST /api/seasoncard/remove    (the manager dashboard that used to sit on seasoncards.html; members still send their own card there)
// Every route keeps its own role check on the Worker; hiding a tool here is never the only lock (bot/ccpermissions.js).
(() => {
  const d = document, root = d.getElementById('rqLive'); if (!root) return;
  const A = window.NorexAuth, API = window.NOREX_API;
  if (!API || !A?.token) return;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const call = (path, body) => (body ? A.call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) : A.call(path));
  const toast = (m, err) => (window.PhoenixNotices ? window.PhoenixNotices.toast(m, err) : console.log(m));
  const ago = (t) => { const s = Math.max(1, Math.round((Date.now() - t) / 1000)); return s < 90 ? 'just now' : s < 5400 ? Math.round(s / 60) + ' min ago' : s < 129600 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago'; };
  const empty = (icon, title, text) => `<div class="panel sq-empty"><span>${icon}</span><div><b>${esc(title)}</b><p class="muted small">${esc(text || '')}</p></div></div>`;
  const skel = '<div class="dg-skel"><i></i></div>';
  const n0 = (x) => (x == null || Number.isNaN(x) ? '—' : Math.round(x).toLocaleString('en-GB'));
  const pc = (x) => (x == null ? '—' : Math.round(x * 100) + '%');
  const sg = (x) => (x == null ? '—' : x === 0 ? '±0' : (x > 0 ? '+' : '−') + Math.abs(Math.round(x)).toLocaleString('en-GB'));
  const mb = (b) => (!b ? '0 MB' : b >= 1e9 ? (b / 1e9).toFixed(2) + ' GB' : (Math.max(0.1, b / 1e6)).toFixed(b < 1e7 ? 1 : 0) + ' MB');
  const when = (t) => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const act = async (fn) => { try { await fn(); } catch (e) { toast(e.message || 'That did not work', true); } };
  const css = (f) => { if (!d.querySelector(`link[href="${f}"]`)) d.head.appendChild(Object.assign(d.createElement('link'), { rel: 'stylesheet', href: f })); };
  const js = (f) => new Promise((ok) => { if (d.querySelector(`script[src="${f}"]`)) return ok(); d.head.appendChild(Object.assign(d.createElement('script'), { src: f, onload: ok, onerror: ok })); });
  // two taps for anything destructive: the first arms the button, the second does it
  const two = (key, label, attrs = '') => `<button class="chip danger" type="button" ${attrs} data-two="${esc(key)}">${S.ask === key ? 'Sure? Tap again' : label}</button>`;
  const S = { tab: 'emojis', emojis: null, media: null, board: null, season: null, err: {}, ask: '', look: {}, sv: 'people', fl: '', by: 'vp', draft: null, boardTab: 'ladder' };
  const TABS = ['emojis', 'media', 'board', 'season'];
  const failed = (k, what) => (S.err[k] ? empty(S.err[k] === 'off' ? '🔌' : '⚠️', S.err[k] === 'off' ? `${what} is not switched on yet` : `Could not load ${what}`, S.err[k] === 'off' ? 'The owner turns it on under Site access; until then members cannot use it, so there is nothing to review.' : S.err[k]) : null);

  // ---------- emoji and stickers ----------
  async function loadEmojis() { S.emojis = null; paint(); try { S.emojis = await call('/api/emoji/review'); S.err.emojis = ''; } catch (e) { S.err.emojis = e.status === 404 ? 'off' : e.message; } paint(); }
  const emojiCard = (x) => `<div class="panel cc-rq" data-id="${x.id}"><div class="cc-rq-i" data-pic="${x.id}" aria-label="Image of ${esc(x.name)}"><button type="button" class="chip" data-look="${x.id}">👁️ Look</button></div>
<div class="cc-rq-b"><b>:${esc(x.name)}:</b> <span class="chip">${x.kind === 'sticker' ? 'Sticker' : 'Emoji'}</span>${x.animated ? ' <span class="chip">Animated</span>' : ''}<p class="muted small">${esc(x.user || 'A member')} · ${x.width}×${x.height} · ${n0(x.size / 1024)} KB · ${ago(x.createdAt)}</p></div>
<div class="cc-rq-a"><button type="button" class="btn" data-decide="approve" data-id="${x.id}">Approve</button><button type="button" class="btn ghost" data-decide="reject" data-id="${x.id}">Reject</button></div></div>`;
  function emojisHtml() {
    const E = S.emojis; if (S.err.emojis) return failed('emojis', 'Emoji and stickers'); if (!E) return skel;
    const wait = E.items.filter((x) => x.status === 'pending'), done = E.items.filter((x) => x.status !== 'pending');
    return `<p class="muted small">Look at each image before you decide. An approved emoji or sticker is kept for the server importer; a rejected one is dropped. Limits: emoji ${n0(E.limits?.emojiKb)} KB, sticker ${n0(E.limits?.stickerKb)} KB.</p>
<h3 class="cc-h3">Waiting <span class="chip gold">${wait.length}</span></h3>${wait.length ? `<div class="cc-rq-g">${wait.map(emojiCard).join('')}</div>` : empty('✅', 'Nothing waiting', 'New suggestions from /emoji show up here and on the Overview.')}
<h3 class="cc-h3">Decided</h3>${done.length ? `<div class="tablewrap"><table class="tbl cc-tbl"><caption class="sr">Decided emoji and sticker suggestions</caption><thead><tr><th scope="col">Name</th><th scope="col">From</th><th scope="col">Decision</th><th scope="col">By</th><th scope="col"></th></tr></thead><tbody>${done.map((x) => `<tr><td><b>:${esc(x.name)}:</b> <span class="muted small">${x.kind === 'sticker' ? 'sticker' : 'emoji'}</span></td><td>${esc(x.user)}</td><td>${x.status === 'approved' ? '✅ Approved' : '⛔ Rejected'}</td><td>${esc(x.reviewedBy || '')} <span class="muted small">${x.reviewedAt ? ago(x.reviewedAt) : ''}</span></td><td class="r"><button type="button" class="chip" data-look="${x.id}">Look</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">Nothing decided yet.</p>'}`;
  }

  // ---------- GIFs and highlights ----------
  async function loadMedia() { S.media = null; paint(); try { S.media = await call('/api/controlcenter/media'); S.err.media = ''; } catch (e) { S.err.media = e.message; } paint(); }
  function mediaHtml() {
    const M = S.media; if (S.err.media) return failed('media', 'GIFs and highlights'); if (!M) return skel;
    const used = M.storage?.used, cap = M.storage?.refuseAt, pctUsed = used != null && cap ? Math.min(100, Math.round((used / cap) * 100)) : null;
    const link = (key, label) => (key ? `<a class="chip" href="${esc(API.replace(/\/$/, ''))}/media/${esc(key)}" target="_blank" rel="noopener">${label}</a>` : '');
    const gifs = M.gifs.map((g) => `<tr><td>#${g.id}</td><td><b>${esc(g.title || 'Untitled')}</b></td><td>${esc(g.user)}</td><td>${g.status === 'done' ? '✅ Done' : g.status === 'failed' ? `⛔ Failed${g.error ? ' · ' + esc(g.error) : ''}` : '⏳ ' + esc(g.status)}</td><td class="num">${g.status === 'done' ? `${mb(g.outSize)}${g.secs != null ? ' · ' + g.secs.toFixed(1) + ' s' : ''}` : mb(g.inSize)}</td><td>${ago(g.createdAt)}</td><td class="r">${link(g.key, 'Open')} ${g.status === 'done' ? two('gif:' + g.id, 'Remove', `data-rm="gif" data-id="${g.id}"`) : ''}</td></tr>`).join('');
    const clips = M.clips.map((c) => `<tr><td>#${c.id}</td><td><b>${esc(c.title || 'Untitled')}</b>${c.note ? `<div class="muted small">${esc(c.note)}</div>` : ''}</td><td>${esc(c.user)}</td><td>${c.status === 'stored' ? '✅ Stored' : c.status === 'failed' ? '⛔ Failed' : '⏳ ' + esc(c.status)}</td><td class="num">${mb(c.size)}</td><td>${ago(c.createdAt)}</td><td class="r">${link(c.key, 'Open')} ${c.status === 'stored' ? two('highlight:' + c.id, 'Remove', `data-rm="highlight" data-id="${c.id}"`) : ''}</td></tr>`).join('');
    const tbl = (title, body, n) => `<h3 class="cc-h3">${title} <span class="chip">${n}</span></h3>${n ? `<div class="tablewrap"><table class="tbl cc-tbl"><caption class="sr">${title}</caption><thead><tr><th scope="col">#</th><th scope="col">Title</th><th scope="col">From</th><th scope="col">Status</th><th scope="col">Size</th><th scope="col">When</th><th scope="col"></th></tr></thead><tbody>${body}</tbody></table></div>` : `<p class="muted small">None yet. Members make them with /gif make and /highlight upload.</p>`}`;
    return `<p class="muted small">Everything members made with the GIF maker and the highlight upload. Open shows the file; Remove deletes it from storage for good (a copy already posted in Discord stays there). Limits and switches live under Bot commands and Site access.</p>
${pctUsed != null ? `<div class="cc-meter" role="img" aria-label="Media storage ${pctUsed}% of the safe limit"><i style="width:${pctUsed}%"></i></div><p class="muted small">Media storage: ${mb(used)} of the ${mb(cap)} safe limit.</p>` : ''}
${tbl('GIFs', gifs, M.gifs.length)}${tbl('Highlight clips', clips, M.clips.length)}`;
  }

  // ---------- Rush leaderboard (photo upload, check, post, remove, season clock) ----------
  async function loadBoard() { S.board = null; paint(); try { S.board = await call('/api/lb'); S.err.board = ''; } catch (e) { S.err.board = e.status === 404 ? 'off' : e.message; } paint(); mountUp('board'); }
  const reviewBoard = (res) => {
    S.draft = { kind: 'board', rows: res.rows.map((r) => ({ ...r })), us: res.us, qc: res.qc };
    const errs = (res.qc?.errors || []).map((e) => `<li class="bad">${esc(e)}</li>`).join(''), warns = (res.qc?.warnings || []).map((e) => `<li>${esc(e)}</li>`).join(''), fixed = (res.qc?.fixed || []).length ? `<p class="muted small">Tidied automatically: ${esc(res.qc.fixed.join(' · '))}</p>` : '';
    const el = d.getElementById('rqReview'); if (!el) return;
    el.innerHTML = `<h3 class="cc-h3">Check what was read</h3>${errs || warns ? `<ul class="lb-qc">${errs}${warns}</ul>` : '<p class="lb-ok">✔ All the numbers add up.</p>'}${fixed}<p class="muted small">Fix anything that looks wrong, and tap the circle on our row.</p>
<div class="tablewrap"><table class="tbl lb-edit"><caption class="sr">Clubs read from the photo</caption><thead><tr><th scope="col">Us</th><th scope="col">#</th><th scope="col">Club</th><th scope="col">VP</th><th scope="col">GP</th><th scope="col">M</th><th scope="col">BFG</th><th scope="col">AVG</th></tr></thead><tbody>${S.draft.rows.map((r, i) => `<tr data-i="${i}"><td><input type="radio" name="us" aria-label="Our club" ${i === S.draft.us ? 'checked' : ''}></td><td>${esc(r.rank)}</td>${['club', 'vp', 'gp', 'm', 'bfg', 'avg'].map((f) => `<td><input data-f="${f}" aria-label="${f} for rank ${esc(r.rank)}" value="${esc(r[f] ?? '')}"${f === 'club' ? '' : ' inputmode="decimal" size="6"'}></td>`).join('')}</tr>`).join('')}</tbody></table></div>
<div class="cc-acts"><button type="button" class="btn" data-bsave="1">Save and post to Discord</button><button type="button" class="btn ghost" data-bsave="0">Save without posting</button><button type="button" class="btn ghost" data-bcancel>Start over</button><span class="muted small" id="rqSv" role="status"></span></div>`;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  async function saveBoard(post) {
    const el = d.getElementById('rqReview'), draft = S.draft; if (!draft) return;
    const rows = [...el.querySelectorAll('tbody tr')].map((tr, i) => { const o = { ...draft.rows[i] }; tr.querySelectorAll('input[data-f]').forEach((x) => { o[x.dataset.f] = x.dataset.f === 'club' ? x.value.trim() : (x.value.trim() === '' ? null : Number(x.value.replace(/[, ]/g, ''))); }); if (o.vp != null && o.m) o.avg = Math.round((o.vp / o.m) * 100) / 100; return o; });
    const us = Math.max(0, [...el.querySelectorAll('input[name=us]')].findIndex((x) => x.checked)), edited = JSON.stringify(rows.map((r) => [r.club, r.vp, r.gp, r.m, r.bfg])) !== JSON.stringify(draft.rows.map((r) => [r.club, r.vp, r.gp, r.m, r.bfg]));
    const st = d.getElementById('rqSv'); st.textContent = 'Saving…'; el.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    try { const r = await call('/api/lb/save', { rows, us, post, edited }); toast(r.posted?.ok ? 'Saved and posted to Discord' : r.posted?.skipped ? 'Saved' : 'Saved (nothing posted: ' + (r.posted?.error || 'no channel set') + ')'); S.draft = null; el.innerHTML = ''; await loadBoard(); }
    catch (e) { st.textContent = e.message; el.querySelectorAll('button').forEach((b) => { b.disabled = false; }); }
  }
  function boardHtml() {
    const V = S.board; if (S.err.board) return failed('board', 'The Rush leaderboard'); if (!V) return skel;
    const s = V.season || {}, c = V.clock, L = V.latest, ladder = V.ladder || [], me = ladder.find((x) => x.us);
    const kpi = (b, l, sub = '') => `<div class="sbt"><b>${b}</b><span>${l}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
    return `<p class="muted small">Photograph the global Rush leaderboard, check what the bot read, then post it. Members read the result on the Rush leaderboard page; only managers can add or remove photos, and only here.</p>
${L ? `<div class="lb-kpi">${kpi(me ? '#' + me.rank : '—', 'Our position', me ? n0(me.vp) + ' VP' : '')}${kpi(V.insights?.gaps?.above != null ? n0(V.insights.gaps.above) : '—', 'Behind the club above')}${kpi(V.insights?.pace?.mine != null ? V.insights.pace.mine.toFixed(1) : '—', 'VP per hour')}${kpi(c ? (c.over ? 'Over' : c.daysLeft + ' d') : '—', 'Season left', esc(s.name || ''))}</div><p class="muted small">Last photo ${esc(when(L.taken_at))}${L.by ? ' by ' + esc(L.by) : ''}. <a href="rushboard.html">See the page members see</a></p>` : empty('🏁', 'No photo yet this season', 'Take the first one below and the page fills in for everyone.')}
<h3 class="cc-h3">New photo</h3><div class="panel flat"><div id="rqUp"></div><div id="rqReview"></div></div>
<h3 class="cc-h3">Photos taken <span class="chip">${(V.history || []).length}</span></h3>${(V.history || []).length ? `<div class="tablewrap"><table class="tbl cc-tbl"><caption class="sr">Leaderboard photos</caption><thead><tr><th scope="col">Taken</th><th scope="col">By</th><th scope="col">Rank</th><th scope="col">VP</th><th scope="col"></th></tr></thead><tbody>${V.history.map((h) => `<tr><td>${esc(when(h.taken_at))}</td><td>${esc(h.by || '')}</td><td class="num">#${h.rank ?? '—'}</td><td class="num">${n0(h.vp)}</td><td class="r">${two('lb:' + h.id, 'Remove', `data-rmboard="${h.id}"`)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">No photos yet.</p>'}
<h3 class="cc-h3">Season clock</h3><form class="lb-form" data-seasonform><label>Season<input name="name" value="${esc(s.name || '')}" required></label><label>Starts<input type="date" name="start" value="${esc(s.start || '')}" required></label><label>Rolls over on<input type="date" name="end" value="${esc(s.end || '')}" required></label><label>Season cards are for<input name="cardsFor" value="${esc(s.cardsFor || s.name || '')}"></label><button class="btn" type="submit">Save season</button></form>
<p class="muted small">The end date is the day the season rolls over (it is not counted): 22 Oct to 3 Dec is 42 days. Starting a new season starts a fresh history.</p>`;
  }

  // ---------- Season stat cards (manager dashboard) ----------
  async function loadSeason() { S.season = null; paint(); try { S.season = await call('/api/seasoncard'); S.err.season = ''; } catch (e) { S.err.season = e.status === 404 ? 'off' : e.message; } paint(); }
  const GRADE = { star: '⭐ Praise', concern: '⚠️ Work on' };
  function seasonHtml() {
    const V = S.season; if (S.err.season) return failed('season', 'Season cards'); if (!V) return skel;
    if (!V.canManage) return empty('🔒', 'Managers only', 'The season dashboard is for managers and the owner.');
    const T = V.totals, ps = V.people.filter((p) => !S.fl || (S.fl === 'flag' ? (p.flags || []).length : p.grade === S.fl)), kpi = (b, l, sub = '') => `<div class="sbt"><b>${b}</b><span>${l}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
    const chips = (list, cur, key) => `<div class="chips" role="group" aria-label="${key}">${list.map(([v, l]) => `<button type="button" class="chip${cur === v ? ' on' : ''}" data-${key}="${v}">${l}</button>`).join('')}</div>`;
    let body;
    if (S.sv === 'missing') body = V.missing?.length ? `<p class="muted small">Active members with no card for ${esc(V.season.name)} yet (${V.missing.length}).</p><ul class="sc-miss">${V.missing.map((m) => `<li>${esc(m.name)}</li>`).join('')}</ul>` : '<p class="lb-ok">✔ Everyone active has sent a card.</p>';
    else if (S.sv === 'share') { const top = [...ps].sort((a, b) => b.vp - a.vp), tot = top.reduce((x, p) => x + p.vp, 0) || 1; body = top.length ? `<div class="sc-share">${top.map((p) => `<div class="sc-sh"><span>${esc(p.name)}</span><span class="lb-bar"><i style="width:${Math.max(1, (p.vp / tot) * 100).toFixed(1)}%"></i></span><b>${pc(p.vp / tot)}</b><small>${n0(p.vp)} VP</small></div>`).join('')}</div>` : '<p class="muted small">Nobody matches that filter.</p>'; }
    else body = ps.length ? `<div class="tablewrap"><table class="tbl cc-tbl"><caption class="sr">Season verdicts</caption><thead><tr><th scope="col">Player</th><th scope="col">Verdict</th><th scope="col">Matches</th><th scope="col">Win rate</th><th scope="col">Goals / match</th><th scope="col">VP</th><th scope="col">VP / match</th><th scope="col">Share</th><th scope="col">Checks</th><th scope="col"></th></tr></thead><tbody>${ps.map((p) => `<tr><td><b>${esc(p.name)}</b></td><td>${esc(GRADE[p.grade] || '')}</td><td class="num">${n0(p.matches)}</td><td class="num">${pc(p.winRate)}</td><td class="num">${p.gpm.toFixed(2)}</td><td class="num">${n0(p.vp)}</td><td class="num">${p.vpm.toFixed(1)}</td><td class="num">${pc(p.share)}</td><td class="small">${(p.flags || []).length ? `🧐 ${esc(p.flags[0])}` : '<span class="lb-ok">✔</span>'}</td><td class="r">${two('sc:' + p.id, 'Remove', `data-rmcard="${p.id}"`)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">Nobody matches that filter.</p>';
    return `<p class="muted small">Members send their own end-of-season Rush stats photo on the Season cards page; the bot reads it and posts the card in Discord. Everything a manager does with those cards happens here.</p>
${T.people ? `<div class="lb-kpi">${kpi(T.people, 'Cards in', esc(V.season.name))}${kpi(n0(T.matches), 'Matches played')}${kpi(pc(T.winRate), 'Win rate')}${kpi(n0(T.goals), 'Goals')}${kpi(n0(T.vp), 'VP from members', T.clubVp ? 'club total ' + n0(T.clubVp) : '')}${kpi(n0(T.median?.vp), 'Median VP')}</div>` : empty('🗃️', `No cards in for ${V.season.name} yet`, 'They appear here as members send them. Who has not sent one is under Missing.')}
${chips([['people', 'People'], ['share', 'Share of club VP'], ['missing', `Missing (${V.missing?.length || 0})`]], S.sv, 'sv')}${S.sv === 'missing' ? '' : chips([['', 'Everyone'], ['star', '⭐ Praise'], ['concern', '⚠️ Work on'], ['flag', '🧐 Flagged']], S.fl, 'fl')}
<div class="panel flat">${body}</div><p class="small"><a href="seasoncards.html">See the page members see</a></p>`;
  }

  // ---------- painting ----------
  const HEAD = { emojis: ['😀', 'Emoji and stickers'], media: ['🎞️', 'GIFs and highlights'], board: ['🏁', 'Rush leaderboard'], season: ['🗃️', 'Season stat cards'] };
  function paint() {
    const h = { emojis: emojisHtml, media: mediaHtml, board: boardHtml, season: seasonHtml }[S.tab];
    root.innerHTML = `<div class="cc-rq-wrap" data-tab="${S.tab}">${h()}</div>`;
    if (S.tab === 'board' && S.board && !S.err.board) mountUp('board');
  }
  // the shared photo picker (scanup.js) for the Rush leaderboard photo
  async function mountUp() {
    const el = d.getElementById('rqUp'); if (!el || el.dataset.up) return; el.dataset.up = '1'; css('rushboard.css'); await js('scanup.js');
    if (!window.PFScan) { el.innerHTML = '<p class="muted small">The photo picker did not load. Reload the page.</p>'; return; }
    window.PFScan.mount(el, async (url, say) => { const r = await call('/api/lb/scan', { image: url }); say(r.rows?.length ? `Read ${r.rows.length} clubs ✔` : 'Nothing readable.'); reviewBoard(r); }, { label: 'the Rush leaderboard screen' });
  }
  const NEED = { emojis: loadEmojis, media: loadMedia, board: loadBoard, season: loadSeason };
  root.addEventListener('click', (ev) => act(async () => {
    const t = ev.target.closest('button'); if (!t) return;
    if (t.dataset.look) { const id = t.dataset.look, slot = root.querySelector(`[data-pic="${id}"]`) || t; t.disabled = true; try { const f = await call('/api/emoji/review/file?id=' + id); const img = d.createElement('img'); img.src = f.dataUrl; img.alt = 'Suggested image'; img.className = 'cc-rq-img'; if (slot === t) t.replaceWith(img); else { slot.innerHTML = ''; slot.appendChild(img); } } catch (e) { t.disabled = false; throw e; } return; }
    if (t.dataset.decide) { await call('/api/emoji/review/decide', { id: +t.dataset.id, action: t.dataset.decide }); toast(t.dataset.decide === 'approve' ? 'Approved' : 'Rejected'); return loadEmojis(); }
    if (t.dataset.two) { const k = t.dataset.two; if (S.ask !== k) { S.ask = k; paint(); setTimeout(() => { if (S.ask === k) { S.ask = ''; paint(); } }, 3500); return; } S.ask = '';
      if (t.dataset.rm) { await call('/api/controlcenter/media/remove', { kind: t.dataset.rm, id: +t.dataset.id }); toast('Removed'); return loadMedia(); }
      if (t.dataset.rmboard) { await call('/api/lb/remove', { id: +t.dataset.rmboard }); toast('Photo removed'); return loadBoard(); }
      if (t.dataset.rmcard) { S.season = await call('/api/seasoncard/remove', { id: +t.dataset.rmcard }); toast('Card taken down'); return paint(); } return; }
    if ('bsave' in t.dataset) return saveBoard(t.dataset.bsave === '1');
    if ('bcancel' in t.dataset) { S.draft = null; d.getElementById('rqReview').innerHTML = ''; return; }
    if (t.dataset.sv !== undefined) { S.sv = t.dataset.sv; return paint(); }
    if (t.dataset.fl !== undefined) { S.fl = t.dataset.fl; return paint(); }
  }));
  root.addEventListener('submit', (ev) => { if (!ev.target.matches('[data-seasonform]')) return; ev.preventDefault(); act(async () => { S.board = await call('/api/lb/season', Object.fromEntries(new FormData(ev.target))); toast('Season saved'); paint(); }); });
  window.PFCCRequests = { tabs: TABS, head: HEAD, open: (k) => { if (!TABS.includes(k) || !['manager', 'owner'].includes(A.ccRole || A.role)) return false; S.tab = k; S.ask = ''; root.hidden = false; NEED[k](); return true; }, reload: () => NEED[S.tab]?.() };
})();
