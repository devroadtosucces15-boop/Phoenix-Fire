// Staff › Control Center › People and music (deck layout 2026-11-23): three read-only views the Worker already had routes for and the site never drew (PF-024 Items 14, 17 and 5).
//   absences   Absences   GET /api/intel/absences   (notices with the private reason; the acknowledge button stays on the Discord card, so a notice is answered where it was sent)
//   counselor  Counselor  GET /api/intel/counselor  (team tendencies and flags from the weekly public-channel sample; numbers only, no message text)
//   dj         Music/DJ   GET /api/music/status     (the DJ bridge: online, last push, open commands, the recent command log)
// PFCCPeople.open(tab) is called by ccshell.js. The reason text is private to managers: it is drawn here and never copied anywhere.
(() => {
  const d = document, root = d.getElementById('ppLive'); if (!root) return;
  const A = window.NorexAuth, API = window.NOREX_API;
  if (!API || !A?.token) return;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const call = (path) => A.call(path);
  const ago = (t) => { const s = Math.max(1, Math.round((Date.now() - t) / 1000)); return s < 90 ? 'just now' : s < 5400 ? Math.round(s / 60) + ' min ago' : s < 129600 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago'; };
  const empty = (icon, title, text) => `<div class="panel sq-empty"><span>${icon}</span><div><b>${esc(title)}</b><p class="muted small">${esc(text || '')}</p></div></div>`;
  const skel = '<div class="dg-skel"><i></i></div>';
  const S = { tab: 'absences', absences: null, counselor: null, dj: null, err: {} };
  const TABS = ['absences', 'counselor', 'dj'];
  const KIND = { away: '🌴 Away', less: '📉 Playing less', matches: '🎮 Missing matches', other: '💬 Other' };
  const off = (what) => empty('🔌', `${what} is not switched on yet`, 'The owner turns it on under Site access; until then there is nothing to show.');
  const bad = (k, what) => (S.err[k] === 'off' ? off(what) : empty('⚠️', `Could not load ${what}`, S.err[k]));
  // names for the Discord ids inside a flag ("<@123> – ..."), from the registry the Control Center already loaded; anything unknown stays generic
  const members = () => new Map(((window.PFCC && window.PFCC.data && window.PFCC.data()) || {}).members?.map((m) => [String(m.id), m.name]) || []);
  const nice = (t) => { const m = members(); return String(t || '').replace(/<@!?(\d+)>/g, (x, id) => '@' + (m.get(id) || 'a member')).replace(/<#\d+>/g, 'a channel'); };

  const absencesHtml = () => {
    if (S.err.absences) return bad('absences', 'Absence notices'); const A_ = S.absences; if (!A_) return skel;
    const live = A_.filter((x) => x.active), past = A_.filter((x) => !x.active);
    const row = (x) => `<tr><td><b>${esc(x.name)}</b></td><td>${esc(KIND[x.kind] || x.kind)}</td><td>${esc(x.from || 'now')} → ${esc(x.until || 'open ended')}</td><td class="cc-reason">${x.reason ? esc(x.reason) : '<span class="muted">no reason given</span>'}</td><td>${x.status === 'acknowledged' ? `✅ Seen${x.ackBy ? ' by ' + esc(x.ackBy) : ''}` : x.status === 'open' ? '🕒 Not acknowledged' : esc(x.status)}</td><td>${ago(x.createdAt)}</td></tr>`;
    const tbl = (list) => `<div class="tablewrap"><table class="tbl cc-tbl"><caption class="sr">Absence notices</caption><thead><tr><th scope="col">Member</th><th scope="col">Kind</th><th scope="col">When</th><th scope="col">Reason (private)</th><th scope="col">Status</th><th scope="col">Sent</th></tr></thead><tbody>${list.map(row).join('')}</tbody></table></div>`;
    return `<p class="muted small">Who told the club they are away or will play less. The reason is private to managers. A notice is acknowledged with the button on its Discord card, so it is answered in the place it was posted; the lineup tools read the same list.</p>
<h3 class="cc-h3">Away now <span class="chip gold">${live.length}</span></h3>${live.length ? tbl(live) : empty('🌴', 'Nobody has an active notice', 'Members file one with /away. It appears here at once.')}
${past.length ? `<h3 class="cc-h3">Earlier</h3>${tbl(past)}` : ''}`;
  };
  const counselorHtml = () => {
    if (S.err.counselor) return bad('counselor', 'The Counselor'); const C = S.counselor; if (!C) return skel;
    const p = C.profile; if (!p) return empty('🧭', 'Nothing sampled yet', C.status?.detail ? `Last run: ${C.status.detail}` : 'When the weekly sample has run, the team tendencies and flags show here.');
    const pcn = (x) => (p.n ? Math.round((x / p.n) * 100) + '%' : '—');
    return `<p class="muted small">Sampled ${ago(p.at)} from ${p.n} public-channel messages. Numbers only: no message text is stored. A flag compares someone with their own usual numbers: it is a prompt to check in kindly, not a verdict.</p>
<div class="lb-kpi"><div class="sbt"><b>${p.n}</b><span>Messages sampled</span></div><div class="sbt"><b>${pcn(p.tone?.warm ?? 0)}</b><span>Warm</span></div><div class="sbt"><b>${pcn(p.tone?.heated ?? 0)}</b><span>Heated</span></div><div class="sbt"><b>${(p.flags || []).length}</b><span>Flags</span></div></div>
<h3 class="cc-h3">How the team is doing</h3>${(p.tendencies || []).length ? `<div class="cc-rq-g">${p.tendencies.map((t) => `<div class="panel"><b>${esc(t.what)}</b><p class="muted small">${esc(t.how)}</p></div>`).join('')}</div>` : '<p class="muted small">Not enough messages to say yet.</p>'}
${p.narrative ? `<p class="muted small">${esc(p.narrative)}</p>` : ''}
<h3 class="cc-h3">Flags <span class="chip gold">${(p.flags || []).length}</span></h3>${(p.flags || []).length ? `<div class="cc-rq-g">${p.flags.map((f) => `<div class="panel"><b>${esc(nice(f.text))}</b><p class="muted small">${esc(f.approach)}</p></div>`).join('')}</div>` : empty('✅', 'No anomalies this week', 'Nothing stands out from anyone’s usual numbers.')}
${C.status && C.status.state !== 'ok' ? `<p class="muted small">Last run: ${esc(C.status.detail || C.status.state)}</p>` : ''}`;
  };
  const djHtml = () => {
    if (S.err.dj) return bad('dj', 'The DJ status'); const J = S.dj; if (!J) return skel;
    return `<p class="muted small">The club DJ bots run on their own host and report to the site. Their commands (play, skip, volume…) are switched and limited under Bot commands; members use the rooms on the Music page.</p>
<div class="lb-kpi"><div class="sbt"><b>${J.online ? '🟢 Online' : '🔴 Offline'}</b><span>Bridge</span></div><div class="sbt"><b>${J.lastPush ? ago(J.lastPush) : 'never'}</b><span>Last push</span></div><div class="sbt"><b>${J.rooms ?? 0}</b><span>Rooms</span></div><div class="sbt"><b>${J.queued ?? 0}</b><span>Commands waiting</span></div></div>
<h3 class="cc-h3">Recent commands</h3>${(J.recent || []).length ? `<div class="tablewrap"><table class="tbl cc-tbl"><caption class="sr">Recent DJ commands</caption><thead><tr><th scope="col">#</th><th scope="col">Command</th><th scope="col">Room</th><th scope="col">By</th><th scope="col">Status</th><th scope="col">When</th></tr></thead><tbody>${J.recent.map((r) => `<tr><td>${r.id}</td><td>${esc(r.type)}</td><td>${esc(r.room_id)}</td><td>${esc(r.by_name || '')}</td><td>${esc(r.status)}</td><td>${ago(r.created_at)}</td></tr>`).join('')}</tbody></table></div>` : empty('🎧', 'No commands yet', 'Commands members send from the Music page or Discord are listed here.')}
<p class="small"><a href="hub-music.html">Open the Music page members see</a></p>`;
  };
  const LOAD = {
    absences: async () => { const r = await call('/api/intel/absences'); S.absences = r.absences || []; },
    counselor: async () => { S.counselor = await call('/api/intel/counselor'); },
    dj: async () => { S.dj = await call('/api/music/status'); },
  };
  const VIEW = { absences: absencesHtml, counselor: counselorHtml, dj: djHtml };
  const paint = () => { root.innerHTML = `<div class="cc-rq-wrap" data-tab="${S.tab}">${VIEW[S.tab]()}</div>`; };
  async function load(k) { S[k] = null; S.err[k] = ''; paint(); try { await LOAD[k](); } catch (e) { S.err[k] = e.status === 404 ? 'off' : e.message || 'failed'; } if (S.tab === k) paint(); }
  window.PFCCPeople = { tabs: TABS, open: (k) => { if (!TABS.includes(k) || !['manager', 'owner'].includes(A.ccRole || A.role)) return false; S.tab = k; root.hidden = false; load(k); return true; }, reload: () => load(S.tab) };
})();
