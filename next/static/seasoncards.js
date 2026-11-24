// Season cards page. Reads GET /api/seasoncard. Every signed-in member can upload their own end-of-season screenshot
// (POST /api/seasoncard/scan → review/correct → POST /api/seasoncard/save, which posts the card in Discord) and sees the rankings.
// The manager dashboard (people table, charts, who has not sent a card, removing a card) lives in Staff › Control Center › Season stat cards; nothing manager-only is drawn here.
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
  let V = null, by = 'vp';
  const GRADE = { star: '⭐ Praise', concern: '⚠️ Work on', ok: '', null: '' };
  const kpi = (b, l, sub = '') => `<div class="sbt"><b>${b}</b><span>${l}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;

  function person(p) { return `<span class="sc-who">${p.avatar ? `<img src="${esc(p.avatar)}" alt="" width="22" height="22" loading="lazy">` : ''}<b>${esc(p.name)}</b></span>`; }

  function drawRank() {
    const list = [...V.people].sort((a, b) => (b[by] ?? 0) - (a[by] ?? 0) || b.vp - a.vp);
    const fmt = { winRate: pc, vpm: (x) => (x == null ? '—' : x.toFixed(1)), gpm: (x) => x.toFixed(2) }[by] || n0;
    $('#sc-rank').innerHTML = list.length ? `<table class="tb"><caption class="sr">Season ranking</caption><thead><tr><th scope="col">#</th><th scope="col">Player</th><th scope="col">${esc({ vp: 'VP', wins: 'Wins', goals: 'Goals', winRate: 'Win rate', vpm: 'VP / match', matches: 'Matches' }[by])}</th><th scope="col">Matches</th><th scope="col">Wins</th><th scope="col">Goals</th><th scope="col">VP</th></tr></thead><tbody>${list.map((p, i) => `<tr class="${V.mine && p.user_id === V.mine.user_id ? 'us' : ''}"><td class="num">${i + 1}${i < 3 ? ' ' + ['🥇', '🥈', '🥉'][i] : ''}</td><td>${person(p)}</td><td class="num"><b>${fmt(p[by])}</b></td><td class="num">${n0(p.matches)}</td><td class="num">${n0(p.wins)}</td><td class="num">${n0(p.goals)}</td><td class="num">${n0(p.vp)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted" style="padding:18px">No cards in yet. Be the first.</p>';
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
    $('#sc-mgr').hidden = !V.canManage;
    msg(T.people ? `${T.people} card${T.people === 1 ? '' : 's'} in for ${V.season.name}.` : `No cards in for ${V.season.name} yet.`);
    $('#sc-kpi').innerHTML = T.people ? kpi(T.people, 'Cards in') + kpi(n0(T.matches), 'Matches played') + kpi(pc(T.winRate), 'Win rate') + kpi(n0(T.goals), 'Goals') + kpi(n0(T.vp), 'VP from members', T.clubVp ? 'club total ' + n0(T.clubVp) : '') + kpi(n0(T.median?.vp), 'Median VP') : '';
    $('#sc-mine-sec').hidden = false; drawMine();
    $('#sc-rank-sec').hidden = !T.people; if (T.people) drawRank();
  }
  async function load() { V = await call('/api/seasoncard'); draw(); if (!load.done) { load.done = true; up = window.PFScan.mount($('#sc-up'), async (url, say) => { const r = await call('/api/seasoncard/scan', { image: url }); say('Read ✔'); review(r); }, { label: 'your end-of-season Rush stats screen (any language)' }); } }

  $('#sc-by').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (!b) return; by = b.dataset.k; $('#sc-by').querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === b)); if (V) drawRank(); });
  $('#sc-review').addEventListener('click', (e) => { if (e.target.id === 'sc-save') save(); else if (e.target.id === 'sc-cancel') { $('#sc-review').innerHTML = ''; up.reset(); } });

    if (!API) msg('Season cards need the live site.');
  else if (!A?.token) msg('Sign in with Discord to send your season card and see the rankings.');
  else load().catch((e) => msg(e.status === 404 ? 'Season cards are not switched on yet.' : e.message));
})();
