// Season cards page. Reads GET /api/seasoncard. Every signed-in member can upload their own end-of-season screenshot
// (POST /api/seasoncard/scan → review/correct → POST /api/seasoncard/save, which posts the card in Discord) and sees the rankings.
// Managers also get the dashboard: people table with grades and flags, a matches-vs-VP chart, share of club VP, filters and who has not sent a card.
(() => {
  const d = document, API = window.NOREX_API, A = window.NorexAuth, $ = (s, r = d) => r.querySelector(s);
  if (!$('#sc-msg')) return;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const n0 = (x) => (x == null || Number.isNaN(x) ? '—' : Math.round(x).toLocaleString('en-GB'));
  const pc = (x) => (x == null ? '—' : Math.round(x * 100) + '%');
  const call = async (path, body) => {
    const r = await fetch(API + path, { method: body ? 'POST' : 'GET', cache: 'no-store', headers: { Authorization: 'Bearer ' + A.token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(j.error || 'That did not work (' + r.status + ').'); e.data = j; e.status = r.status; throw e; } return j;
  };
  const msg = (t) => { $('#sc-msg').hidden = false; $('#sc-msg').textContent = t; };
  let V = null, by = 'vp', view = 'people', fl = '';
  const GRADE = { star: '⭐ Praise', concern: '⚠️ Work on', ok: '', null: '' };
  const kpi = (b, l, sub = '') => `<div class="sbt"><b>${b}</b><span>${l}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;

  function person(p) { return `<span class="sc-who">${p.avatar ? `<img src="${esc(p.avatar)}" alt="" width="22" height="22" loading="lazy">` : ''}<b>${esc(p.name)}</b></span>`; }

  function drawRank() {
    const list = [...V.people].sort((a, b) => (b[by] ?? 0) - (a[by] ?? 0) || b.vp - a.vp);
    const fmt = { winRate: pc, vpm: (x) => (x == null ? '—' : x.toFixed(1)), gpm: (x) => x.toFixed(2) }[by] || n0;
    $('#sc-rank').innerHTML = list.length ? `<table class="tb"><thead><tr><th>#</th><th>Player</th><th>${esc({ vp: 'VP', wins: 'Wins', goals: 'Goals', winRate: 'Win rate', vpm: 'VP / match', matches: 'Matches' }[by])}</th><th>Matches</th><th>Wins</th><th>Goals</th><th>VP</th></tr></thead><tbody>${list.map((p, i) => `<tr class="${V.mine && p.user_id === V.mine.user_id ? 'us' : ''}"><td class="num">${i + 1}${i < 3 ? ' ' + ['🥇', '🥈', '🥉'][i] : ''}</td><td>${person(p)}</td><td class="num"><b>${fmt(p[by])}</b></td><td class="num">${n0(p.matches)}</td><td class="num">${n0(p.wins)}</td><td class="num">${n0(p.goals)}</td><td class="num">${n0(p.vp)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted" style="padding:18px">No cards in yet. Be the first.</p>';
  }

  function scatter(people) {
    if (!people.length) return '<p class="muted small" style="padding:18px">Nothing to show.</p>';
    const w = Math.max(300, Math.min(1100, ($('#sc-dash')?.clientWidth || 720) - 8)), h = w < 500 ? 280 : w < 800 ? 320 : 360, L = 56, R = 16, T = 14, B = 46, mx = Math.max(...people.map((p) => p.matches)) * 1.08 || 1, my = Math.max(...people.map((p) => p.vp)) * 1.08 || 1;
    const X = (x) => L + (x / mx) * (w - L - R), Y = (y) => T + (1 - y / my) * (h - T - B), col = { star: '#8be0a4', concern: '#ff7d72' };
    const gx = [0, 1, 2, 3, 4].map((i) => `<line x1="${L}" x2="${w - R}" y1="${Y((my * i) / 4)}" y2="${Y((my * i) / 4)}" class="lb-gl"/><text x="${L - 8}" y="${Y((my * i) / 4) + 4}" text-anchor="end" class="lb-ax">${n0((my * i) / 4)}</text><text x="${X((mx * i) / 4)}" y="${h - 26}" text-anchor="middle" class="lb-ax">${n0((mx * i) / 4)}</text>`).join('');
    return `<svg viewBox="0 0 ${w} ${h}" class="lb-svg" role="img" aria-label="Matches played against VP earned, one dot per player">${gx}${people.map((p) => `<circle cx="${X(p.matches).toFixed(1)}" cy="${Y(p.vp).toFixed(1)}" r="${5 + (p.winRate || 0) * 6}" fill="${col[p.grade] || '#e8651a'}" fill-opacity=".8"><title>${esc(p.name)} · ${p.matches} matches · ${n0(p.vp)} VP · ${pc(p.winRate)} wins</title></circle>`).join('')}<text x="${w / 2}" y="${h - 6}" text-anchor="middle" class="lb-ax">Matches played →  (bigger dot = higher win rate)</text></svg><div class="lb-key"><span><i style="background:#8be0a4"></i>Praise</span><span><i style="background:#e8651a"></i>Steady</span><span><i style="background:#ff7d72"></i>Work on</span></div>`;
  }

  function drawDash() {
    let ps = V.people.filter((p) => !fl || (fl === 'flag' ? (p.flags || []).length : p.grade === fl));
    const box = $('#sc-dash');
    if (view === 'scatter') { box.innerHTML = scatter(ps); return; }
    if (view === 'share') {
      const top = [...ps].sort((a, b) => b.vp - a.vp), tot = top.reduce((s, p) => s + p.vp, 0) || 1;
      box.innerHTML = top.length ? `<div class="sc-share">${top.map((p) => `<div class="sc-sh"><span>${esc(p.name)}</span><span class="lb-bar"><i style="width:${Math.max(1, (p.vp / tot) * 100).toFixed(1)}%"></i></span><b>${pc(p.vp / tot)}</b><small>${n0(p.vp)} VP</small></div>`).join('')}</div>` : '<p class="muted" style="padding:18px">Nobody matches that filter.</p>';
      return;
    }
    if (view === 'missing') {
      box.innerHTML = V.missing?.length ? `<p class="muted small" style="padding:14px 16px 0">Active members with no card for ${esc(V.season.name)} yet (${V.missing.length}).</p><ul class="sc-miss">${V.missing.map((m) => `<li>${esc(m.name)}</li>`).join('')}</ul>` : '<p class="lb-ok" style="padding:18px">✔ Everyone active has sent a card.</p>';
      return;
    }
    box.innerHTML = ps.length ? `<table class="tb"><thead><tr><th>Player</th><th>Verdict</th><th>Matches</th><th>Win rate</th><th>Goals / match</th><th>VP</th><th>VP / match</th><th>Share</th><th>Checks</th><th></th></tr></thead><tbody>${ps.map((p) => `<tr><td>${person(p)}</td><td>${esc(GRADE[p.grade] || '')}</td><td class="num">${n0(p.matches)}</td><td class="num">${pc(p.winRate)}</td><td class="num">${p.gpm.toFixed(2)}</td><td class="num">${n0(p.vp)}</td><td class="num">${p.vpm.toFixed(1)}</td><td class="num">${pc(p.share)}</td><td class="small">${(p.flags || []).map((f) => `<span class="sc-flag" title="${esc(f)}">🧐</span>`).join('') || '<span class="lb-ok">✔</span>'}${(p.flags || []).length ? `<div class="muted small">${esc(p.flags[0])}</div>` : ''}</td><td><button type="button" class="btn ghost sm" data-rm="${p.id}">Remove</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted" style="padding:18px">Nobody matches that filter.</p>';
  }

  function drawMine() {
    const m = V.mine, s = m?.stats;
    $('#sc-mine').innerHTML = s ? `<div class="lb-kpi">${kpi(n0(s.matches), 'Matches')}${kpi(`${n0(s.wins)} (${pc(s.matches ? s.wins / s.matches : 0)})`, 'Wins')}${kpi(n0(s.goals), 'Goals')}${kpi(n0(s.myVp), 'Your VP', s.clubVp ? pc(s.myVp / s.clubVp) + ' of the club' : '')}</div><p class="muted small">Sent ${new Date(m.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}${m.posted ? ' · posted in Discord' : ''}. Sent it wrong? Upload again and it replaces this one.</p>` : '<p class="muted">You have not sent your card for this season yet.</p>';
  }

  let draft = null, up = { reset() {} };
  const FIELDS = [['club', 'Club', 'text'], ['tier', 'Tier', 'text'], ['matches', 'Matches', 'num'], ['wins', 'Wins', 'num'], ['goals', 'Goals', 'num'], ['clubVp', 'Club total VP', 'num'], ['myVp', 'Your contribution (VP)', 'num']];
  function review(res) {
    draft = res;
    const errs = (res.qc?.errors || []).map((e) => `<li class="bad">${esc(e)}</li>`).join(''), warns = (res.qc?.warnings || []).map((e) => `<li>${esc(e)}</li>`).join('');
    $('#sc-review').innerHTML = `<h3 class="lb-h3">Check what was read</h3>${errs || warns ? `<ul class="lb-qc">${errs}${warns}</ul>` : '<p class="lb-ok">✔ Everything needed is there and adds up.</p>'}
      <form class="lb-form" id="sc-form">${FIELDS.map(([k, l, t]) => `<label>${l}<input name="${k}" ${t === 'num' ? 'inputmode="numeric"' : ''} value="${esc(res.stats?.[k] ?? '')}"></label>`).join('')}</form>
      <div class="lb-act"><button type="button" class="btn" id="sc-save">Send my card</button><button type="button" class="btn ghost" id="sc-cancel">Start over</button><span class="muted small" id="sc-sv" role="status"></span></div>`;
    $('#sc-review').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  async function save() {
    const f = Object.fromEntries(new FormData($('#sc-form'))), stats = {};
    FIELDS.forEach(([k, , t]) => { stats[k] = t === 'num' ? (f[k].trim() === '' ? null : Number(f[k].replace(/[, ]/g, ''))) : f[k].trim(); });
    const edited = JSON.stringify(stats) !== JSON.stringify(Object.fromEntries(FIELDS.map(([k]) => [k, draft.stats?.[k] ?? (k === 'club' || k === 'tier' ? '' : null)])));
    const st = $('#sc-sv'); st.textContent = 'Sending…'; $('#sc-review').querySelectorAll('button').forEach((b) => (b.disabled = true));
    try {
      const r = await call('/api/seasoncard/save', { stats, edited });
      $('#sc-review').innerHTML = `<p class="lb-ok">Sent ✔ You are #${r.rank?.vp ?? '—'} by VP of ${r.of}.${r.posted?.ok ? ' Your card is up in Discord.' : ''}</p>`; up.reset(); draft = null; await load();
    } catch (e) {
      st.textContent = e.message; $('#sc-review').querySelectorAll('button').forEach((b) => (b.disabled = false));
      if (e.data?.qc?.errors?.length) { const q = $('#sc-review .lb-qc') || $('#sc-review .lb-ok'); if (q) q.outerHTML = `<ul class="lb-qc">${e.data.qc.errors.map((x) => `<li class="bad">${esc(x)}</li>`).join('')}</ul>`; }
    }
  }

  function draw() {
    const T = V.totals, c = V.season.clock;
    $('#sc-season').innerHTML = `<b>${esc(V.season.name)}</b>${c && !c.over ? `<small>${V.season.current === V.season.name ? 'running · ' + c.daysLeft + ' days left' : ''}</small>` : ''}`;
    msg(T.people ? `${T.people} card${T.people === 1 ? '' : 's'} in for ${V.season.name}.` : `No cards in for ${V.season.name} yet.`);
    $('#sc-kpi').innerHTML = T.people ? kpi(T.people, 'Cards in') + kpi(n0(T.matches), 'Matches played') + kpi(pc(T.winRate), 'Win rate') + kpi(n0(T.goals), 'Goals') + kpi(n0(T.vp), 'VP from members', T.clubVp ? 'club total ' + n0(T.clubVp) : '') + kpi(n0(T.median?.vp), 'Median VP') : '';
    $('#sc-mine-sec').hidden = false; drawMine();
    $('#sc-rank-sec').hidden = !T.people; if (T.people) drawRank();
    $('#sc-dash-sec').hidden = !V.canManage; if (V.canManage) drawDash();
  }
  async function load() { V = await call('/api/seasoncard'); draw(); if (!load.done) { load.done = true; up = window.PFScan.mount($('#sc-up'), async (url, say) => { const r = await call('/api/seasoncard/scan', { image: url }); say('Read ✔'); review(r); }, { label: 'your end-of-season Rush stats screen (any language)' }); } }

  $('#sc-by').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (!b) return; by = b.dataset.k; $('#sc-by').querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === b)); if (V) drawRank(); });
  $('#sc-view').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; view = b.dataset.v; $('#sc-view').querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === b)); $('#sc-fl').hidden = view === 'missing'; if (V) drawDash(); });
  $('#sc-fl').addEventListener('click', (e) => { const b = e.target.closest('[data-g]'); if (!b) return; fl = b.dataset.g; $('#sc-fl').querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === b)); if (V) drawDash(); });
  $('#sc-review').addEventListener('click', (e) => { if (e.target.id === 'sc-save') save(); else if (e.target.id === 'sc-cancel') { $('#sc-review').innerHTML = ''; up.reset(); } });
  $('#sc-dash').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-rm]'); if (!b) return;
    if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Tap again'; setTimeout(() => { b.dataset.sure = ''; b.textContent = 'Remove'; }, 3500); return; }
    try { V = await call('/api/seasoncard/remove', { id: Number(b.dataset.rm) }); draw(); } catch (er) { b.textContent = er.message; }
  });

  let lastW = innerWidth; addEventListener('resize', () => { if (innerWidth === lastW) return; lastW = innerWidth; if (V && view === 'scatter') drawDash(); });
  if (!API) msg('Season cards need the live site.');
  else if (!A?.token) msg('Sign in with Discord to send your season card and see the rankings.');
  else load().catch((e) => msg(e.status === 404 ? 'Season cards are not switched on yet.' : e.message));
})();
