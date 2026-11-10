// Rush leaderboard page. Reads GET /api/lb (latest ladder, movement, insights, chart series, history) and draws it.
// Managers also get: photo upload (camera or gallery) → POST /api/lb/scan → a review table they can correct → POST /api/lb/save (stores, works out the
// insights and posts the leaderboard in Discord), removing a bad photo (POST /api/lb/remove) and the season clock (POST /api/lb/season).
(() => {
  const d = document, API = window.NOREX_API, A = window.NorexAuth, $ = (s, r = d) => r.querySelector(s);
  if (!$('#lb-msg')) return;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const n0 = (x) => (x == null || Number.isNaN(x) ? '—' : Math.round(x).toLocaleString('en-GB'));
  const sg = (x) => (x == null ? '—' : x === 0 ? '±0' : (x > 0 ? '+' : '−') + Math.abs(Math.round(x)).toLocaleString('en-GB'));
  const cls = (x) => (x > 0 ? 'up' : x < 0 ? 'dn' : 'eq');
  const when = (t) => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const call = async (path, body) => {
    const r = await fetch(API + path, { method: body ? 'POST' : 'GET', cache: 'no-store', headers: { Authorization: 'Bearer ' + A.token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(j.error || 'That did not work (' + r.status + ').'); e.data = j; e.status = r.status; throw e; } return j;
  };
  const msg = (t) => { $('#lb-msg').hidden = false; $('#lb-msg').textContent = t; };
  let V = null, tab = 'vp';

  // ---------- charts (plain SVG, no library) ----------
  const COLORS = ['#e8651a', '#efcf7a', '#6fb2ff', '#8be0a4'];
  const chartW = (el) => Math.max(300, Math.min(1100, (el?.clientWidth || 748) - 28));
  function lineChart(series, { yFmt = n0, invert = false, w = chartW($('#lb-chart')), h = w < 500 ? 250 : w < 800 ? 280 : 320 } = {}) {
    const pts = series.flatMap((s) => s.v.filter((p) => p.y != null));
    if (!pts.length) return '<p class="muted small" style="padding:18px">Not enough photos yet.</p>';
    const xs = series.flatMap((s) => s.v.map((p) => p.x)), x0 = Math.min(...xs), x1 = Math.max(...xs);
    let y0 = Math.min(...pts.map((p) => p.y)), y1 = Math.max(...pts.map((p) => p.y)); if (y0 === y1) { y0 -= 1; y1 += 1; }
    const pad = (y1 - y0) * 0.08; y0 -= pad; y1 += pad;
    const L = 56, R = 16, T = 14, B = 30, X = (x) => L + (x1 === x0 ? (w - L - R) / 2 : ((x - x0) / (x1 - x0)) * (w - L - R)), Y = (y) => T + ((invert ? y - y0 : y1 - y) / (y1 - y0)) * (h - T - B);
    const grid = [0, 1, 2, 3, 4].map((i) => { const y = y0 + ((y1 - y0) * i) / 4; return `<line x1="${L}" x2="${w - R}" y1="${Y(y)}" y2="${Y(y)}" class="lb-gl"/><text x="${L - 8}" y="${Y(y) + 4}" text-anchor="end" class="lb-ax">${esc(yFmt(y))}</text>`; }).join('');
    const xt = [x0, (x0 + x1) / 2, x1].map((x, i) => `<text x="${X(x)}" y="${h - 8}" text-anchor="${i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}" class="lb-ax">${esc(when(x))}</text>`).join('');
    const lines = series.map((s, i) => {
      const v = s.v.filter((p) => p.y != null), c = COLORS[i % COLORS.length];
      return `<polyline fill="none" stroke="${c}" stroke-width="${i === 0 ? 3 : 2}" stroke-linejoin="round" ${i ? 'opacity=".85"' : ''} points="${v.map((p) => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ')}"/>` + v.map((p) => `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="${i === 0 ? 4 : 3}" fill="${c}"><title>${esc(s.name)} · ${esc(when(p.x))} · ${esc(yFmt(p.y))}</title></circle>`).join('');
    }).join('');
    const key = series.map((s, i) => `<span><i style="background:${COLORS[i % COLORS.length]}"></i>${esc(s.name)}</span>`).join('');
    return `<svg viewBox="0 0 ${w} ${h}" class="lb-svg" role="img" aria-label="Chart of ${esc(series[0].name)} over time">${grid}${xt}${lines}</svg><div class="lb-key">${key}</div>`;
  }
  function chart() {
    const s = V.series, P = s.points, me = s.clubs?.[0] || 'Us';
    if (tab === 'vp') return lineChart(s.clubs.map((c) => ({ name: c, v: P.map((p) => ({ x: p.t, y: p.by?.[c] ?? null })) })));
    if (tab === 'rank') return lineChart([{ name: me, v: P.map((p) => ({ x: p.t, y: p.rank })) }], { yFmt: (y) => '#' + Math.round(y), invert: true });
    if (tab === 'gap') return lineChart([{ name: 'Gap to #1', v: P.map((p) => ({ x: p.t, y: p.gapLeader })) }, { name: 'Gap to the club above', v: P.map((p) => ({ x: p.t, y: p.gapAbove })) }]);
    return lineChart([{ name: me + ' VP per match', v: P.map((p) => ({ x: p.t, y: p.avg })) }], { yFmt: (y) => y.toFixed(1) });
  }

  // ---------- page ----------
  const kpi = (b, l, sub = '', c = '') => `<div class="sbt"><b class="${c}">${b}</b><span>${l}</span>${sub ? `<small class="${c}">${sub}</small>` : ''}</div>`;
  function draw() {
    const k = $('#lb-kpi'), I = V.insights;
    msg(V.latest ? `Photo taken ${when(V.latest.taken_at)}${V.latest.by ? ' by ' + V.latest.by : ''} · ${V.season?.name || ''}` : 'No leaderboard photo yet for this season.');
    $('#lb-msg').classList.toggle('muted', true);
    const c = V.clock; $('#lb-clock').innerHTML = c ? `<b>Day ${c.day}/${c.total}</b><span class="lb-bar"><i style="width:${c.pct}%"></i></span><small>${c.over ? 'Season over' : c.daysLeft + ' days left'}</small>` : '';
    $('#lb-up-sec').hidden = !V.canScan; $('#lb-set-sec').hidden = !V.canScan;
    if (!V.latest) { k.innerHTML = ''; ['adv', 'ch', 'tb', 'hist'].forEach((x) => ($(`#lb-${x}-sec`).hidden = true)); return; }
    const dl = I.delta;
    k.innerHTML = kpi('#' + I.rank, 'Our rank', dl ? (dl.rank ? (dl.rank > 0 ? '▲ ' : '▼ ') + Math.abs(dl.rank) + ' since last photo' : 'unchanged') : '', dl ? cls(dl.rank) : '')
      + kpi(n0(I.vp), 'Our VP', dl ? sg(dl.vp) + (dl.hours ? ` in ${dl.hours}h` : '') : '', dl ? cls(dl.vp) : '')
      + kpi(I.gaps.leader ? n0(I.gaps.leader) : '—', I.gaps.leader ? 'Behind #1' : 'We lead', dl?.leaderGap != null ? sg(dl.leaderGap) + ' vs last' : '', dl ? cls(dl.leaderGap) : '')
      + kpi(I.gaps.above != null ? n0(I.gaps.above) : '—', 'To the club above', dl?.aboveGap != null ? sg(dl.aboveGap) + ' vs last' : '', dl ? cls(dl.aboveGap) : '')
      + kpi(I.gaps.below != null ? n0(I.gaps.below) : '—', 'Cushion over the club below', dl?.belowGap != null ? sg(dl.belowGap) + ' vs last' : '', dl ? cls(dl.belowGap) : '')
      + kpi(I.pace?.mine != null ? I.pace.mine.toFixed(1) : '—', 'VP per hour', I.pace?.hours ? `over ${I.pace.hours}h` : '')
      + kpi(I.forecast?.projected != null ? n0(I.forecast.projected) : '—', 'Projected finish', I.forecast ? `${I.forecast.daysLeft} days left at this pace` : '')
      + kpi(I.efficiency?.avg != null ? I.efficiency.avg.toFixed(1) : '—', 'VP per match', I.efficiency?.leaderAvg ? `#1 earns ${I.efficiency.leaderAvg.toFixed(1)}` : '');
    $('#lb-adv-sec').hidden = !I.advice.length;
    $('#lb-adv').innerHTML = I.advice.map((a) => `<div class="lb-tip">${esc(a).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</div>`).join('') + (I.forecast ? `<div class="lb-tip lb-fc"><b>The numbers to beat</b><br>${I.forecast.needPerDayForAbove > 0 ? `Pass ${esc(I.near.above)}: <b>${n0(I.forecast.needPerDayForAbove)}</b> VP a day · ` : ''}${I.forecast.needPerDayForFirst > 0 ? `Reach #1: <b>${n0(I.forecast.needPerDayForFirst)}</b> VP a day · ` : ''}${I.efficiency.matchesToPassAbove ? `About <b>${I.efficiency.matchesToPassAbove}</b> matches at our average to pass the club above` : ''}</div>` : '');
    $('#lb-ch-sec').hidden = false; $('#lb-chart').innerHTML = chart();
    $('#lb-tb-sec').hidden = false;
    $('#lb-tb').innerHTML = `<table class="tb lb-tb"><thead><tr><th>#</th><th>Club</th><th>VP</th><th>Δ VP</th><th>Gap</th><th>GP</th><th>M</th><th>BFG</th><th>AVG</th></tr></thead><tbody>${V.ladder.map((r, i) => {
      const me = V.ladder.find((x) => x.us), gap = r.us ? '' : sg(r.vp - me.vp);
      return `<tr class="${r.us ? 'us' : ''}"><td class="num">${r.rank}${r.dRank ? ` <small class="${cls(r.dRank)}">${r.dRank > 0 ? '▲' : '▼'}${Math.abs(r.dRank)}</small>` : ''}</td><td><b>${esc(r.club)}</b></td><td class="num">${n0(r.vp)}</td><td class="num ${cls(r.dVp)}">${r.dVp == null ? '—' : sg(r.dVp)}</td><td class="num ${r.us ? '' : cls(-(r.vp - me.vp))}">${gap}</td><td class="num">${n0(r.gp)}</td><td class="num">${n0(r.m)}</td><td class="num">${n0(r.bfg)}</td><td class="num">${r.avg == null ? '—' : r.avg.toFixed(1)}</td></tr>`;
    }).join('')}</tbody></table>`;
    $('#lb-hist-sec').hidden = false;
    $('#lb-hist').innerHTML = V.history.map((h) => `<div class="lb-h"><span>${esc(when(h.taken_at))}</span><span>${esc(h.by || '')}</span><b>#${h.rank ?? '—'}</b><span class="num">${n0(h.vp)} VP</span>${V.canScan ? `<button type="button" class="btn ghost sm" data-rm="${h.id}">Remove</button>` : ''}</div>`).join('');
  }

  // ---------- manager tools ----------
  let draft = null;
  function review(res) {
    draft = { rows: res.rows.map((r) => ({ ...r })), us: res.us, qc: res.qc };
    const errs = (res.qc?.errors || []).map((e) => `<li class="bad">${esc(e)}</li>`).join(''), warns = (res.qc?.warnings || []).map((e) => `<li>${esc(e)}</li>`).join('');
    const fixed = (res.qc?.fixed || []).length ? `<p class="muted small">Tidied automatically: ${esc(res.qc.fixed.join(' · '))}</p>` : '';
    $('#lb-review').innerHTML = `<h3 class="lb-h3">Check what was read</h3>${errs || warns ? `<ul class="lb-qc">${errs}${warns}</ul>` : '<p class="lb-ok">✔ All the numbers add up.</p>'}${fixed}
      <p class="muted small">Fix anything that looks wrong, and tap the circle on our row.</p>
      <div class="tbx"><table class="tb lb-edit"><thead><tr><th>Us</th><th>#</th><th>Club</th><th>VP</th><th>GP</th><th>M</th><th>BFG</th><th>AVG</th></tr></thead><tbody>${draft.rows.map((r, i) => `<tr data-i="${i}"><td><input type="radio" name="us" ${i === draft.us ? 'checked' : ''} aria-label="This is us"></td><td class="num">${r.rank}</td><td><input data-f="club" value="${esc(r.club)}" aria-label="Club"></td>${['vp', 'gp', 'm', 'bfg'].map((f) => `<td><input data-f="${f}" inputmode="numeric" value="${r[f] ?? ''}" aria-label="${f}"></td>`).join('')}<td class="num">${r.avg ?? '—'}</td></tr>`).join('')}</tbody></table></div>
      <div class="lb-act"><button type="button" class="btn" id="lb-save">Save and post to Discord</button><button type="button" class="btn ghost" id="lb-save-q">Save without posting</button><button type="button" class="btn ghost" id="lb-cancel">Start over</button><span class="muted small" id="lb-sv" role="status"></span></div>`;
    $('#lb-review').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  async function save(post) {
    const rows = [...$('#lb-review').querySelectorAll('tbody tr')].map((tr, i) => {
      const o = { ...draft.rows[i] }; tr.querySelectorAll('input[data-f]').forEach((el) => { o[el.dataset.f] = el.dataset.f === 'club' ? el.value.trim() : (el.value.trim() === '' ? null : Number(el.value.replace(/[, ]/g, ''))); });
      if (o.vp != null && o.m) o.avg = Math.round((o.vp / o.m) * 100) / 100; return o;
    });
    const us = Math.max(0, [...$('#lb-review').querySelectorAll('input[name=us]')].findIndex((x) => x.checked));
    const edited = JSON.stringify(rows.map((r) => [r.club, r.vp, r.gp, r.m, r.bfg])) !== JSON.stringify(draft.rows.map((r) => [r.club, r.vp, r.gp, r.m, r.bfg]));
    const st = $('#lb-sv'); st.textContent = 'Saving…'; $('#lb-review').querySelectorAll('button').forEach((b) => (b.disabled = true));
    try {
      const r = await call('/api/lb/save', { rows, us, post, edited });
      st.textContent = r.posted?.ok ? 'Saved and posted ✔' : r.posted?.skipped ? 'Saved ✔' : 'Saved ✔ (nothing posted: ' + (r.posted?.error || 'no channel set') + ')';
      $('#lb-review').innerHTML = `<p class="lb-ok">${esc(st.textContent)}</p>`; up.reset(); draft = null; await load();
    } catch (e) {
      st.textContent = e.message; $('#lb-review').querySelectorAll('button').forEach((b) => (b.disabled = false));
      if (e.data?.qc) { const ul = $('#lb-review .lb-qc') || $('#lb-review .lb-ok'); if (ul) ul.outerHTML = `<ul class="lb-qc">${(e.data.qc.errors || []).map((x) => `<li class="bad">${esc(x)}</li>`).join('')}</ul>`; }
    }
  }
  let up = { reset() {} };
  function tools() {
    if (!V.canScan || tools.done) return; tools.done = true;
    up = window.PFScan.mount($('#lb-up'), async (url, say) => {
      const r = await call('/api/lb/scan', { image: url }); say(r.rows?.length ? `Read ${r.rows.length} clubs ✔` : 'Nothing readable.'); review(r);
    }, { label: 'the Rush leaderboard screen' });
    $('#lb-review').addEventListener('click', (e) => { const id = e.target.id; if (id === 'lb-save') save(true); else if (id === 'lb-save-q') save(false); else if (id === 'lb-cancel') { $('#lb-review').innerHTML = ''; up.reset(); } });
    $('#lb-hist').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-rm]'); if (!b) return;
      if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Tap again to remove'; setTimeout(() => { b.dataset.sure = ''; b.textContent = 'Remove'; }, 3500); return; }
      try { await call('/api/lb/remove', { id: Number(b.dataset.rm) }); await load(); } catch (er) { b.textContent = er.message; }
    });
  }
  function seasonForm() {
    if (!V.canScan) return;
    const s = V.season || {};
    $('#lb-set').innerHTML = `<form class="lb-form"><label>Season<input name="name" value="${esc(s.name || '')}" required></label><label>Starts<input type="date" name="start" value="${esc(s.start || '')}" required></label><label>Rolls over on<input type="date" name="end" value="${esc(s.end || '')}" required></label><label>Season cards are for<input name="cardsFor" value="${esc(s.cardsFor || s.name || '')}"></label><button class="btn" type="submit">Save season</button><span class="muted small" id="lb-ss" role="status"></span></form><p class="muted small">The end date is the day the season rolls over (it is not counted): 22 Oct to 3 Dec is 42 days. Starting a new season starts a fresh history.</p>`;
    $('#lb-set form').onsubmit = async (ev) => {
      ev.preventDefault(); const f = Object.fromEntries(new FormData(ev.target)); const st = $('#lb-ss'); st.textContent = 'Saving…';
      try { V = await call('/api/lb/season', f); st.textContent = 'Saved ✔'; draw(); seasonForm(); } catch (e) { st.textContent = e.message; }
    };
  }

  async function load() { V = await call('/api/lb'); draw(); tools(); seasonForm(); }
  $('#lb-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (!b) return; tab = b.dataset.c; $('#lb-tabs').querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === b)); if (V?.latest) $('#lb-chart').innerHTML = chart(); });
  let lastW = innerWidth; addEventListener('resize', () => { if (innerWidth === lastW) return; lastW = innerWidth; if (V?.latest) $('#lb-chart').innerHTML = chart(); });
  if (!API) msg('The leaderboard needs the live site.');
  else if (!A?.token) msg('Sign in with Discord to see the Rush leaderboard.');
  else load().catch((e) => msg(e.status === 404 ? 'The Rush leaderboard is not switched on yet.' : e.message));
})();
