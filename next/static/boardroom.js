// Staff › Boardroom: the owner's tools, mounted inside the Control Center (PF-022 step 8). One tab per tool, picked by the Control Center sidebar (PFBoardroom.open(tab));
// the in-page tab chips are hidden there. The Switches, Audit and Organization tabs were retired: the Control Center's Site access, Audit log and Organization panels are the single versions.
//   Tools     – the owner's finder (every staff tool from the staff manifest, links outside the site, features by name)   GET /api/admin/overview (flags, for the finder)
//   Health    – GET /api/admin/health (Cloudflare analytics + GitHub Actions + club crawl)
//   Announce  – POST /api/notify/announce (preview + confirm), Discord post of a club doc: GET /api/events/discord,
//               GET /api/docs, POST /api/docs/discord {id, preview} then {id, channel, role}
//   Hall of Fame – GET /api/hof, POST /api/hof {kind, player|name, title, text, date}, POST /api/hof/remove {id}; each entry gets a
//               designed trophy (trophy.js picks the shape from its wording)
//   Medals    – GET/POST /api/admin/medals: edit/hide built-in medals, add counting or owner-awarded special medals, award/revoke,
//               and a "Got them all" collector medal (ops save · hide · reset · delete · award · revoke)
//   Backup    – downloads one JSON copy (switches + medal definitions + Hall of Fame) from the routes above; medal definitions can be restored from it
//               (club data itself lives in D1 and the git archive, which are not editable from here)
(() => {
  const d = document, root = d.getElementById('brLive'); if (!root) return;
  const A = window.NorexAuth, M = window.NorexMotion, API = window.NOREX_API;
  if (!API || !A?.token) return;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const call = (path, body) => (body ? A.call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) : A.call(path));
  const toast = (m, err) => M?.toast ? M.toast(m, err ? { kind: 'err' } : { kind: 'ok' }) : console.log(m);
  const ago = (t) => { const s = Math.max(1, Math.round((Date.now() - (t > 1e12 ? t : Date.parse(t))) / 1000)); return s < 90 ? 'just now' : s < 5400 ? Math.round(s / 60) + ' min ago' : s < 129600 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago'; };
  const FREE = { requests: 100000 };
  const S = { tab: 'tools', flags: null, health: undefined, ping: null, filter: '', busy: false, err: {},
    ann: { title: '', body: '', audience: 'all', ack: false, preview: false }, docs: null, targets: undefined, dc: { doc: '', channel: '', role: '', preview: null },
    hof: null, hofForm: { kind: 'legend', player: '', name: '', title: '', text: '' },
    med: null, medQ: '', medTier: '', medForm: null, bak: { busy: false, last: null } };
  const TR = (o) => (window.NorexTrophy ? window.NorexTrophy.svg(o) : `<span class="br-emo">${esc(o.icon || '🏆')}</span>`);
  const empty = (icon, title, text) => `<div class="panel sq-empty"><span>${icon}</span><div><b>${esc(title)}</b><p class="muted small">${esc(text || '')}</p></div></div>`;
  const skel = '<div class="dg-skel"><i></i></div>';
  const act = async (fn) => { try { await fn(); } catch (er) { toast(er.message, true); } };
  const nice = (k) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

  // where each switch lives, and the staff pages: one copy in the staff manifest (next/lib/flagwhere.mjs, next/lib/staffmanifest.mjs)
  const MAN = window.PFStaffManifest || { tools: [], where: {} }, WHERE = MAN.where || {};
  const go = (page, find, hash) => page + (find ? `?nx=${encodeURIComponent('~' + find)}` : '') + (hash ? '#' + hash : '');
  const LINKS = { discord: '', botPortal: '', apply: '', youtube: '', twitch: '', ...(window.NOREX?.links || {}) }; // from config.json via the page shell; empty = not set
  const TOOLS = [
    ['🏠 Staff tools', MAN.tools.filter((t) => t.id !== 'boardroom').map((t) => [t.emoji + ' ' + t.label, t.desc, t.href])],
    ['🔗 Outside the site', [['💬 Discord server', 'Open the club server', LINKS.discord], ['🤖 Discord bot', 'Developer portal for the bot', LINKS.botPortal], ['☁️ Cloudflare', 'Worker, KV, D1, analytics', 'https://dash.cloudflare.com/'], ['📺 YouTube', LINKS.youtube ? LINKS.youtube.match(/youtube\.com\/(@[\w.-]+)/)?.[1] || 'Channel' : 'Channel', LINKS.youtube], ['🎮 Twitch', LINKS.twitch.match(/twitch\.tv\/([\w]{3,25})/)?.[1] || 'Channel', LINKS.twitch], ['📨 Apply link', 'The Discord invite for new players', LINKS.apply]]],
    ['📊 The public site', [['🏆 Hall of Fame', 'As guests see it', 'halloffame.html'], ['⚽ Squad', 'Card stack', 'squad.html'], ['📈 Stats', 'League and Rush', 'stats.html'], ['🧩 Tactics', 'Formations and 3D pitch', 'tactics.html'], ['🔥 Burners', 'Unofficial clubs', 'burners.html'], ['🚪 Join', 'Recruitment page', 'join.html']]],
  ];

  function tools() {
    const q = S.filter.toLowerCase();
    const card = ([n, sub, href]) => { if (!href) return `<span class="br-tool" aria-disabled="true"><b>${esc(n)}</b><small>Not set – add it to config.json</small></span>`; const ext = /^https?:/.test(href); return `<a class="br-tool" href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ''}><b>${esc(n)}</b><small>${esc(sub)}</small><span aria-hidden="true">${ext ? '↗' : '→'}</span></a>`; };
    const groups = TOOLS.map(([t, items]) => [t, items.filter((it) => !q || `${it[0]} ${it[1]}`.toLowerCase().includes(q))]).filter(([, it]) => it.length);
    const jump = Object.keys(S.flags || {}).filter((k) => q && (k.toLowerCase().includes(q) || nice(k).toLowerCase().includes(q)) && WHERE[k]).slice(0, 8);
    return `<div class="br-bar"><input type="search" class="br-in" data-filter placeholder="Find a tool or a feature…" value="${esc(S.filter)}" aria-label="Find a tool or feature"></div>
${jump.length ? `<h4 class="dk-h">🎯 Features</h4><div class="br-tools">${jump.map((k) => card([nice(k), 'Go to where it lives', go(...WHERE[k])])).join('')}</div>` : ''}
${groups.map(([t, it]) => `<h4 class="dk-h">${esc(t)}</h4><div class="br-tools">${it.map(card).join('')}</div>`).join('') || '<p class="muted small">Nothing matches.</p>'}
<p class="muted small">Every feature switch also has its own <b>Go to</b> and <b>Show me</b> buttons under Site access in the Control Center.</p>`;
  }
  // ---------- ② health ----------
  function health() {
    const h = S.health;
    if (h === undefined) return skel;
    if (h === null) return empty('🩺', 'Could not load health data', S.err.health || 'Try the refresh button.');
    const runs = h.actions?.runs || [], run = (re) => runs.find((r) => re.test(r.name));
    const upd = run(/update/i), pages = run(/pages/i), bot = run(/bot|worker/i);
    const st = (r) => (!r ? 'grey' : r.conclusion === 'success' ? 'ok' : r.conclusion === 'failure' ? 'bad' : ['in_progress', 'queued'].includes(r.status) ? 'busy' : 'grey');
    const tile = (name, cls, sub, url) => `<div class="br-dot ${cls}"><i aria-hidden="true"></i><b>${esc(name)}</b><small>${esc(sub)}</small>${cls === 'bad' && url ? `<a class="chip" href="${esc(url)}" target="_blank" rel="noopener">Open run</a>` : ''}</div>`;
    const built = window.NOREX?.updated || d.querySelector('footer time[datetime]')?.getAttribute('datetime');
    const age = built ? Date.now() - Date.parse(built) : null;
    const tiles = [
      tile('EA data', age === null ? 'grey' : age < 30 * 6e4 ? 'ok' : age < 3 * 36e5 ? 'busy' : 'bad', built ? `fetched ${ago(built)}` : 'unknown', upd?.url),
      tile('Site build', st(upd), upd ? `${upd.conclusion || upd.status} · ${ago(upd.at)}` : (h.actions?.ready === false ? h.actions.error : 'no runs found'), upd?.url),
      tile('Pages', pages ? st(pages) : st(upd), pages ? `${pages.conclusion || pages.status} · ${ago(pages.at)}` : 'deploys with the build', (pages || upd)?.url),
      tile('Bot', S.ping !== null ? 'ok' : 'bad', S.ping !== null ? `answering · ${S.ping} ms` : 'not answering', bot?.url),
    ].join('');
    const a = h.analytics, c = h.crawl;
    const bar = (label, n, max, txt) => `<div class="br-use"><span>${esc(label)}</span><b>${esc(txt)}</b><span class="br-track"><i class="${n / max > 0.8 ? 'hot' : n / max > 0.5 ? 'warm' : ''}" style="width:${Math.min(100, (n / max) * 100).toFixed(1)}%"></i></span></div>`;
    return `<div class="br-dots">${tiles}</div>
<h4 class="dk-h">📦 Free-tier usage · last 24 h</h4>
${a?.ready ? `${bar('Worker requests', a.requests, FREE.requests, `${a.requests.toLocaleString()} / ${FREE.requests.toLocaleString()}`)}${bar('Worker errors', a.errors, Math.max(1, a.requests), a.errors.toLocaleString())}<p class="muted small">CPU p50 ${esc(a.cpuP50)} ms · p99 ${esc(a.cpuP99)} ms · ${esc(a.subrequests?.toLocaleString?.() ?? a.subrequests)} sub-requests</p>`
      : `<p class="muted small">⚠️ ${esc(a?.error || 'Cloudflare usage is not available yet.')}</p>`}
<div class="br-use"><span>GitHub Actions minutes</span><b>unlimited (public repo)</b><span class="br-track"><i class="free" style="width:100%"></i></span></div>
${c?.ready ? `<h4 class="dk-h">🧭 Club crawl</h4><p class="small"><b>${c.indexed.toLocaleString()}</b> clubs indexed · cursor at ID <b>${c.cursor.toLocaleString()}</b> · <b>${c.perDay.toLocaleString()}</b> per day${c.lastAt ? ` · last hit ${esc(ago(c.lastAt))}` : ''}</p>` : ''}
${runs.length ? `<h4 class="dk-h">Recent runs</h4><ul class="dk-log">${runs.slice(0, 6).map((r) => `<li><span>${r.conclusion === 'success' ? '✅' : r.conclusion === 'failure' ? '❌' : '⏳'} <b>${esc(r.name)}</b></span><small>${esc(r.conclusion || r.status)} · ${esc(ago(r.at))}</small></li>`).join('')}</ul>` : ''}`;
  }
  async function loadHealth() {
    S.health = undefined; if (S.tab === 'health') paint();
    const t0 = performance.now();
    try { S.health = await call('/api/admin/health'); S.ping = Math.round(performance.now() - t0); S.err.health = ''; } catch (er) { S.health = null; S.ping = null; S.err.health = er.message; }
    if (S.tab === 'health') paint();
  }

  // ---------- ④ announcements ----------
  function announce() {
    const a = S.ann, ok = a.title.trim().length >= 3, dc = S.dc;
    const sendTo = a.audience === 'managers' ? 'all managers' : 'every member';
    const docs = (S.docs || []).filter((x) => x.area === 'announce' || x.area === 'rules' || x.area === 'faq');
    const T = S.targets;
    return `<div class="grid g2"><form class="panel br-form" data-form="ann"><h4 class="dk-h" style="margin:0">📣 Announce to members</h4>
<p class="muted small">Goes to the Squad Hub bell and, where they allow it, a Discord DM.</p>
<input class="br-in" aria-label="Title" name="title" maxlength="120" placeholder="Title (at least 3 letters)" value="${esc(a.title)}" required>
<textarea class="br-in" aria-label="Announcement text" name="body" maxlength="1500" rows="4" placeholder="What do you want to say?">${esc(a.body)}</textarea>
<div class="dk-row"><select class="br-in" name="audience" aria-label="Who gets it"><option value="all"${a.audience === 'all' ? ' selected' : ''}>Every member</option><option value="managers"${a.audience === 'managers' ? ' selected' : ''}>Managers only</option></select>
<label class="small br-chk"><input type="checkbox" name="ack"${a.ack ? ' checked' : ''}> Must be acknowledged</label></div>
${a.preview ? `<div class="br-prev"><small class="muted">Preview · what members will see</small><b>📣 ${esc(a.title || 'Title')}</b><p>${esc(a.body || '(no message)')}</p><small>${a.ack ? '✔ They must tap “I have read this”. ' : ''}Sent to ${esc(sendTo)}.</small></div>` : ''}
<div class="dk-btns"><button type="button" class="chip" data-ann="preview"${ok ? '' : ' disabled'}>👁️ ${a.preview ? 'Hide preview' : 'Preview'}</button><button type="button" class="btn" data-ann="send"${ok && a.preview ? '' : ' disabled'}>📣 Send to ${esc(sendTo)}</button></div>
${a.preview ? '' : '<p class="muted tiny">Preview first, then Send unlocks. You will be asked to confirm.</p>'}</form>
<div class="panel br-form"><h4 class="dk-h" style="margin:0">💬 Post a club doc to Discord</h4>
<p class="muted small">Posts one of the announcements or rules written in Club docs as a rich message.</p>
${T === undefined ? skel : !T?.ready ? empty('💬', 'Discord is not connected', T?.error || 'The bot token or server is not set up, so nothing can be posted from here.') : !docs.length ? empty('📄', 'No announcements written yet', 'Write one in Club docs first, then post it here.') : `
<select class="br-in" data-dc="doc" aria-label="Doc to post"><option value="">Pick an announcement…</option>${docs.map((x) => `<option value="${x.id}"${String(x.id) === String(dc.doc) ? ' selected' : ''}>${esc(x.title)}</option>`).join('')}</select>
<div class="dk-row"><select class="br-in" data-dc="channel" aria-label="Channel"><option value="">Pick a channel…</option>${T.channels.map((c) => `<option value="${esc(c.id)}"${c.id === dc.channel ? ' selected' : ''}>#${esc(c.name)}${c.news ? ' 📢' : ''}</option>`).join('')}</select>
<select class="br-in" data-dc="role" aria-label="Who to ping"><option value="">Ping nobody</option>${T.roles.map((r) => `<option value="${esc(r.id)}"${r.id === dc.role ? ' selected' : ''}>Ping ${esc(r.name)}</option>`).join('')}</select></div>
${dc.preview ? `<div class="br-prev">${dc.preview.ping ? `<small class="muted">Pings ${esc(dc.preview.ping)}</small>` : ''}${(dc.preview.embeds || []).map((e) => `<b>${esc(e.title)}</b><p>${esc(String(e.description || '').slice(0, 500))}</p><small class="muted">${esc(e.footer?.text || '')}</small>`).join('')}</div>` : ''}
<div class="dk-btns"><button type="button" class="chip" data-dcgo="preview"${dc.doc ? '' : ' disabled'}>👁️ Preview</button><button type="button" class="btn" data-dcgo="send"${dc.doc && dc.channel && dc.preview ? '' : ' disabled'}>💬 Post to Discord</button></div>`}</div></div>`;
  }
  async function loadAnnounce() {
    if (S.targets !== undefined) return;
    const [t, dcs] = await Promise.all([call('/api/events/discord').catch((er) => ({ ready: false, error: er.message })), call('/api/docs').catch(() => null)]);
    S.targets = t; S.docs = dcs?.items || []; if (S.tab === 'announce') paint();
  }
  const readAnn = (f) => { const fd = new FormData(f); S.ann.title = fd.get('title') || ''; S.ann.body = fd.get('body') || ''; S.ann.audience = fd.get('audience'); S.ann.ack = !!fd.get('ack'); };

  // ---------- ⑤ hall of fame ----------
  function hof() {
    if (!S.hof) return S.err.hof ? empty('🏛️', S.err.hof.includes('available') ? 'Hall of Fame is switched off' : 'Could not load the Hall of Fame', S.err.hof.includes('available') ? 'Turn the hallOfFame switch on for the owner to edit it here.' : S.err.hof) : skel;
    const h = S.hofForm, players = window.NOREX?.players || [], entry = (x) => `<li><span class="br-tro">${TR({ shape: window.NorexTrophy?.pick(`${x.title || ''} ${x.n}`, x.kind), tier: x.kind === 'legend' ? 'epic' : 'rare', icon: x.kind === 'legend' ? '⭐' : '📜', size: 44, label: x.n })}</span><span>${x.kind === 'legend' ? '⭐' : '📜'} <b>${esc(x.n)}</b>${x.title ? ` · ${esc(x.title)}` : ''}<br><small class="muted">${esc(x.text || '')}</small></span><small>${esc(x.date || '')}${x.by ? ` · ${esc(x.by)}` : ''}</small><button class="chip danger" data-hofdel="${x.id}" data-name="${esc(x.n)}">Remove</button></li>`;
    return `<form class="panel br-form" data-form="hof"><h4 class="dk-h" style="margin:0">Add to the Hall of Fame</h4>
<div class="chips"><button type="button" class="chip${h.kind === 'legend' ? ' on' : ''}" data-hofkind="legend">⭐ Legend</button><button type="button" class="chip${h.kind === 'moment' ? ' on' : ''}" data-hofkind="moment">📜 Club moment</button></div>
${h.kind === 'legend' ? `<select class="br-in" name="player" aria-label="Player"><option value="">Pick a player…</option>${players.map((p) => `<option value="${esc(p.k)}"${p.k === h.player ? ' selected' : ''}>${esc(p.n)}</option>`).join('')}</select>` : `<input class="br-in" aria-label="Moment title" name="name" maxlength="60" placeholder="Moment title" value="${esc(h.name)}">`}
<input class="br-in" aria-label="Title" name="title" maxlength="80" placeholder="${h.kind === 'legend' ? 'Plaque title – e.g. The engine room' : 'Short label (optional)'}" value="${esc(h.title)}">
<textarea class="br-in" aria-label="Text" name="text" maxlength="400" rows="3" placeholder="${h.kind === 'legend' ? 'Citation – why they are a legend' : 'What happened?'}">${esc(h.text)}</textarea>
<div class="dk-btns"><button class="btn" type="submit">${h.kind === 'legend' ? '⭐ Induct' : '📜 Add moment'}</button></div></form>
<h4 class="dk-h">Legends · ${S.hof.legends.length}</h4>${S.hof.legends.length ? `<ul class="dk-log">${S.hof.legends.map(entry).join('')}</ul>` : empty('⭐', 'No legends yet', 'Induct the first one above.')}
<h4 class="dk-h">Club moments · ${S.hof.moments.length}</h4>${S.hof.moments.length ? `<ul class="dk-log">${S.hof.moments.map(entry).join('')}</ul>` : empty('📜', 'No moments yet', 'Add a milestone above.')}`;
  }
  async function loadHof() { if (S.hof || S.err.hof) return; try { S.hof = await call('/api/hof'); } catch (er) { S.err.hof = er.message; } if (S.tab === 'hof') paint(); }


  // ---------- ⑥ medals ----------
  const TIER_NAME = (k) => S.med?.tiers?.[k]?.label || k;
  const counts = (m) => (m.fact === 'manual' ? 'Awarded by you' : m.fact === 'others' ? `Unlock all ${m.goal} regular medals` : `${S.med.facts[m.fact] || m.fact} ≥ ${m.goal}`);
  const blankMed = () => ({ id: '', icon: '🏅', name: '', desc: '', tier: 'rare', fact: 'goals', goal: 10, source: 'custom' });
  function medCard(m) {
    const held = `${m.holders} member${m.holders === 1 ? '' : 's'}`;
    return `<article class="br-med${m.hidden ? ' off' : ''}" data-tier="${esc(m.tier)}">${TR({ shape: window.NorexTrophy?.pick(`${m.name} ${m.desc}`, 'medal'), tier: m.tier, icon: m.icon, size: 54, label: m.name })}
<div class="br-medt"><b>${esc(m.name)}</b>${m.source === 'custom' ? '<span class="br-tag">custom</span>' : ''}${m.edited ? '<span class="br-tag">edited</span>' : ''}${m.fact === 'manual' ? '<span class="br-tag">special</span>' : ''}<small>${esc(m.desc || '')}</small><small class="muted">${esc(TIER_NAME(m.tier))} · ${esc(m.pts)} pts · ${esc(counts(m))} · held by ${esc(held)}</small></div>
<div class="dk-btns">${m.hidden ? `<button class="chip" data-medop="show" data-id="${esc(m.id)}">👁️ Show again</button>` : `<button class="chip" data-medop="edit" data-id="${esc(m.id)}">✏️ Edit</button>${m.fact === 'manual' ? `<button class="chip" data-medop="award" data-id="${esc(m.id)}">🎁 Award</button>` : ''}${m.edited ? `<button class="chip" data-medop="reset" data-id="${esc(m.id)}">↺ Reset</button>` : ''}${m.source === 'custom' ? `<button class="chip danger" data-medop="delete" data-id="${esc(m.id)}" data-name="${esc(m.name)}">Delete</button>` : `<button class="chip" data-medop="hide" data-id="${esc(m.id)}" data-name="${esc(m.name)}">🙈 Hide</button>`}`}</div></article>`;
  }
  function medals() {
    const M0 = S.med;
    if (!M0) return S.err.med ? empty('⚠️', 'Could not load the medals', S.err.med) : skel;
    const q = S.medQ.trim().toLowerCase(), hit = M0.defs.filter((m) => (!S.medTier || m.tier === S.medTier) && (!q || `${m.name} ${m.desc} ${m.id}`.toLowerCase().includes(q)));
    const f = S.medForm, tiers = Object.entries(M0.tiers);
    const form = f ? `<form class="panel br-form" data-form="med"><h4 class="dk-h" style="margin:0">${f.id ? 'Edit medal' : 'New medal'}</h4>
<div class="br-medprev" data-tier="${esc(f.tier)}">${TR({ shape: window.NorexTrophy?.pick(`${f.name} ${f.desc}`, 'medal'), tier: f.tier, icon: f.icon, size: 64, label: f.name || 'Preview' })}<div><b>${esc(f.name || 'Medal name')}</b><small class="muted">${esc(f.desc || 'How to get it')} · ${esc(TIER_NAME(f.tier))} · ${esc(M0.tiers[f.tier]?.pts)} pts</small></div></div>
<div class="dk-row"><input class="br-in" name="icon" maxlength="8" placeholder="🏅" value="${esc(f.icon)}" aria-label="Emoji" style="max-width:84px;text-align:center;font-size:20px"><input class="br-in" name="name" maxlength="${40}" placeholder="Medal name" value="${esc(f.name)}" required aria-label="Name"></div>
<input class="br-in" name="desc" maxlength="120" placeholder="How to earn it (shown to members)" value="${esc(f.desc)}" aria-label="How to earn it">
<div class="dk-row"><select class="br-in" name="tier" aria-label="Rarity">${tiers.map(([k, v]) => `<option value="${k}"${k === f.tier ? ' selected' : ''}>${esc(v.label)} · ${v.pts} pts</option>`).join('')}</select>
${f.source === 'built-in' ? `<span class="muted small">Counts: ${esc(f.fact === 'others' ? 'all regular medals' : M0.facts[f.fact] || f.fact)}</span>` : `<select class="br-in" name="fact" aria-label="What it counts">${Object.entries(M0.facts).map(([k, v]) => `<option value="${k}"${k === f.fact ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select>`}</div>
${f.fact === 'manual' || f.fact === 'others' ? '' : `<label class="small br-chk">Target <input class="br-in" name="goal" type="number" min="1" step="any" value="${esc(f.goal)}" style="max-width:120px"> <span class="muted">reach this to unlock</span></label>`}
<div class="dk-btns"><button class="btn" type="submit">${f.id ? '💾 Save medal' : '➕ Add medal'}</button><button class="chip" type="button" data-medop="cancel">Cancel</button></div></form>` : '';
    const hidden = M0.hidden.length ? `<h4 class="dk-h">🙈 Hidden · ${M0.hidden.length}</h4><div class="br-meds">${M0.hidden.map(medCard).join('')}</div>` : '';
    const aw = S.award ? `<div class="panel br-form"><h4 class="dk-h" style="margin:0">🎁 Award “${esc(S.award.name)}”</h4><div class="dk-row"><select class="br-in" data-awto aria-label="Member"><option value="">Pick a member…</option>${M0.members.map((u) => `<option value="${esc(u.id)}">${esc(u.n)}</option>`).join('')}</select><button class="btn" data-medop="awardgo"${S.award.to ? '' : ' disabled'}>🎁 Award</button><button class="chip" data-medop="revokego"${S.award.to ? '' : ' disabled'}>Take back</button><button class="chip" data-medop="cancel">Close</button></div></div>` : '';
    return `<div class="br-bar"><input type="search" class="br-in" data-medq placeholder="Find a medal…" value="${esc(S.medQ)}" aria-label="Find a medal"><select class="br-in" data-medtier aria-label="Rarity"><option value="">All rarities</option>${tiers.map(([k, v]) => `<option value="${k}"${k === S.medTier ? ' selected' : ''}>${esc(v.label)}</option>`).join('')}</select><button class="btn" data-medop="new">➕ New medal</button></div>
<p class="muted small">${M0.defs.length} medals live · members earn them automatically from their stats; “special” medals are handed out by you. “Got them all” unlocks once someone holds every regular medal. Edits show for members within seconds; no deploy.</p>
${form}${aw}<div class="br-meds">${hit.map(medCard).join('') || '<p class="muted small">No medal matches.</p>'}</div>${hidden}`;
  }
  async function loadMedals() { if (S.med || S.err.med) return; try { S.med = await call('/api/admin/medals'); } catch (er) { S.err.med = er.message; } if (S.tab === 'medals') paint(); }
  const readMed = (f) => { const fd = new FormData(f), m = S.medForm; for (const k of ['icon', 'name', 'desc', 'tier', 'fact']) if (fd.has(k)) m[k] = fd.get(k); if (fd.has('goal')) m.goal = fd.get('goal'); };
  async function medOp(k) {
    const op = k.medop, id = k.id;
    if (op === 'new') { S.medForm = blankMed(); S.award = null; return paint(); }
    if (op === 'cancel') { S.medForm = null; S.award = null; return paint(); }
    const m = (S.med.defs.concat(S.med.hidden)).find((x) => x.id === id);
    if (op === 'edit') { S.medForm = { ...m }; S.award = null; paint(); return root.querySelector('[data-form="med"]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    if (op === 'award') { S.award = { id, name: m.name, to: '' }; S.medForm = null; return paint(); }
    if (op === 'awardgo' || op === 'revokego') {
      const who = S.med.members.find((u) => u.id === S.award.to);
      if (!confirm(`${op === 'awardgo' ? 'Give' : 'Take back'} “${S.award.name}” ${op === 'awardgo' ? 'to' : 'from'} ${who?.n}?\n\n${op === 'awardgo' ? 'They are notified.' : ''}`)) return;
      S.med = await call('/api/admin/medals', { op: op === 'awardgo' ? 'award' : 'revoke', id: S.award.id, to: S.award.to }); paint(); return toast(op === 'awardgo' ? `🎁 Awarded to ${who?.n}` : 'Taken back');
    }
    const ask = { hide: `Hide “${k.name}” from every member? Anyone who earned it keeps the record; it can be shown again.`, delete: `Delete the medal “${k.name}” for good? Everyone who holds it loses it.`, reset: `Put “${m?.name}” back to the built-in wording and target?`, show: '' }[op];
    if (ask && !confirm(ask)) return;
    S.med = await call('/api/admin/medals', { op: op === 'show' ? 'hide' : op, id, hidden: op === 'hide' ? true : op === 'show' ? false : undefined });
    paint(); toast({ hide: 'Hidden', show: 'Visible again', delete: 'Deleted', reset: 'Reset' }[op]);
  }

  // ---------- ⑦ backup ----------
  function backup() {
    const b = S.bak;
    return `<div class="grid g2"><div class="panel br-form"><h4 class="dk-h" style="margin:0">💾 Download a copy</h4>
<p class="muted small">One file with the feature switch levels, every medal definition (your edits, hidden and custom medals) and the Hall of Fame. Keep it somewhere safe before big changes.</p>
<div class="dk-btns"><button class="btn" data-bak="dl"${b.busy ? ' disabled' : ''}>${b.busy ? 'Collecting…' : '⬇️ Download backup'}</button></div>${b.last ? `<p class="small">✅ Saved <b>${esc(b.last.name)}</b> · ${esc(b.last.flags)} switches, ${esc(b.last.medals)} medal changes, ${esc(b.last.hof)} Hall of Fame entries.</p>` : ''}</div>
<div class="panel br-form"><h4 class="dk-h" style="margin:0">♻️ Restore medals</h4>
<p class="muted small">Pick a backup file to bring back medal definitions. You see what will change first. Switches and the Hall of Fame are not overwritten from here; use their tabs.</p>
<input type="file" class="br-in" accept="application/json,.json" data-bakfile aria-label="Backup file">${b.plan ? `<div class="br-prev"><b>${esc(b.plan.file)}</b><p>${b.plan.ops.length ? `${b.plan.ops.length} medal change${b.plan.ops.length === 1 ? '' : 's'}: ${esc(b.plan.ops.map((o) => o.name).slice(0, 8).join(', '))}${b.plan.ops.length > 8 ? '…' : ''}` : 'Nothing to restore, the medals already match.'}</p></div><div class="dk-btns"><button class="btn" data-bak="restore"${b.plan.ops.length ? '' : ' disabled'}>♻️ Restore these</button></div>` : ''}${b.err ? `<p class="small" style="color:#ff9d94">${esc(b.err)}</p>` : ''}</div></div>
<p class="muted small">Club results and stats are kept in the database and the git archive, which update themselves. They are not part of this file.</p>`;
  }
  async function downloadBackup() {
    S.bak.busy = true; paint();
    try {
      const [ov, med, hofD] = await Promise.all([call('/api/admin/overview'), call('/api/admin/medals'), call('/api/hof').catch(() => ({ legends: [], moments: [] }))]);
      const medals = { custom: med.defs.filter((m) => m.source === 'custom'), edited: med.defs.filter((m) => m.source === 'built-in' && m.edited), hidden: med.hidden.map((m) => m.id) };
      const data = { kind: 'norex-boardroom-backup', version: 1, at: new Date().toISOString(), flags: ov.flags || {}, medals, hallOfFame: hofD };
      const name = `${(window.NOREX?.slug || 'club')}-backup-${data.at.slice(0, 10)}.json`, url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })), a = d.createElement('a');
      a.href = url; a.download = name; d.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
      S.bak.last = { name, flags: Object.keys(data.flags).length, medals: medals.custom.length + medals.edited.length + medals.hidden.length, hof: (hofD.legends?.length || 0) + (hofD.moments?.length || 0) };
    } finally { S.bak.busy = false; paint(); }
  }
  async function planRestore(file) {
    S.bak.plan = null; S.bak.err = '';
    try {
      const j = JSON.parse(await file.text()); if (j.kind !== 'norex-boardroom-backup' || !j.medals) throw new Error('This is not a Boardroom backup file.');
      const cur = S.med || (S.med = await call('/api/admin/medals')), ops = [];
      const same = (a, b) => ['icon', 'name', 'desc', 'tier', 'goal', 'fact'].every((k) => String(a[k]) === String(b[k]));
      for (const m of j.medals.custom || []) { const c = cur.defs.concat(cur.hidden).find((x) => x.id === m.id); if (!c || !same(c, m)) ops.push({ name: m.name, body: { op: 'save', ...m } }); }
      for (const m of j.medals.edited || []) { const c = cur.defs.find((x) => x.id === m.id); if (c && !same(c, m)) ops.push({ name: m.name, body: { op: 'save', ...m } }); }
      for (const id of j.medals.hidden || []) if (cur.defs.some((x) => x.id === id)) ops.push({ name: `hide ${id}`, body: { op: 'hide', id, hidden: true } });
      S.bak.plan = { file: file.name, ops };
    } catch (er) { S.bak.err = er.message; }
    paint();
  }

  // ---------- frame ----------
  const TABS = [['tools', '🧰 Tools'], ['health', '🩺 Health'], ['announce', '📣 Announce'], ['hof', '🏛️ Hall of Fame'], ['medals', '🏅 Medals'], ['backup', '💾 Backup']];
  function paint() {
    if (!root.isConnected) return;
    const keep = d.activeElement?.matches?.('input[data-filter],input[data-medq]') ? (d.activeElement.dataset.filter !== undefined ? 'data-filter' : 'data-medq') : null;
    root.innerHTML = `<div class="chips dk-tabs">${TABS.map(([k, n]) => `<button class="chip${S.tab === k ? ' on' : ''}" data-tab="${k}">${n}</button>`).join('')}${S.tab === 'health' ? '<button class="chip" data-hrefresh>↻ Refresh</button>' : ''}</div><div class="dk-pane">${{ tools, health, announce, hof, medals, backup }[S.tab]()}</div>`;
    if (keep) { const i = root.querySelector(`[${keep}]`); if (i) { i.focus(); const n = i.value.length; i.setSelectionRange(n, n); } }
  }
  const openTab = (k) => { S.tab = k; paint(); if (k === 'health' && S.health === undefined) loadHealth(); if (k === 'announce') loadAnnounce(); if (k === 'hof') loadHof(); if (k === 'medals') loadMedals(); };

  root.addEventListener('click', (ev) => {
    const t = ev.target.closest('button'); if (!t) return; const k = t.dataset;
    if (k.tab) openTab(k.tab);
    else if ('hrefresh' in k) loadHealth();
    else if (k.ann === 'preview') { readAnn(t.closest('form')); S.ann.preview = !S.ann.preview; paint(); }
    else if (k.ann === 'send') act(async () => {
      readAnn(t.closest('form')); const a = S.ann;
      if (!confirm(`Send “${a.title}” to ${a.audience === 'managers' ? 'all managers' : 'every member'}${a.ack ? ' (must be acknowledged)' : ''}?\n\nThis notifies real people and can send Discord DMs. It cannot be unsent.`)) return;
      const r = await call('/api/notify/announce', { title: a.title, body: a.body, audience: a.audience, ack: a.ack });
      S.ann = { title: '', body: '', audience: 'all', ack: false, preview: false }; paint(); toast(`📣 Sent to ${r.sent ?? 0} member${r.sent === 1 ? '' : 's'}`);
    });
    else if (k.dcgo === 'preview') act(async () => { const r = await call('/api/docs/discord', { preview: true, id: Number(S.dc.doc), role: S.dc.role }); S.dc.preview = r.preview; paint(); });
    else if (k.dcgo === 'send') act(async () => {
      const ch = S.targets.channels.find((c) => c.id === S.dc.channel), ro = S.targets.roles.find((r) => r.id === S.dc.role);
      if (!confirm(`Post this to #${ch?.name} on Discord${ro ? `, pinging ${ro.name}` : ''}?\n\nIt goes to the real server and cannot be unsent from here.`)) return;
      await call('/api/docs/discord', { id: Number(S.dc.doc), channel: S.dc.channel, role: S.dc.role }); S.dc.preview = null; paint(); toast('💬 Posted to Discord');
    });
    else if (k.medop) act(() => medOp(k));
    else if (k.bak === 'dl') act(downloadBackup);
    else if (k.bak === 'restore') act(async () => {
      const ops = S.bak.plan.ops; if (!confirm(`Restore ${ops.length} medal change${ops.length === 1 ? '' : 's'} from ${S.bak.plan.file}?\n\nMembers see them straight away.`)) return;
      for (const o of ops) S.med = await call('/api/admin/medals', o.body);
      S.bak.plan = null; paint(); toast(`♻️ Restored ${ops.length}`);
    });
    else if (k.hofkind) { S.hofForm.kind = k.hofkind; paint(); }
    else if (k.hofdel) act(async () => { if (!confirm(`Remove “${k.name}” from the Hall of Fame? It is kept in the database but disappears from the site.`)) return; S.hof = await call('/api/hof/remove', { id: Number(k.hofdel) }); paint(); toast('Removed'); });
  });
  root.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t.matches('[data-filter]')) { S.filter = t.value; paint(); }
    else if (t.matches('[data-medq]')) { S.medQ = t.value; paint(); }
    else if (t.closest('[data-form="med"]')) { readMed(t.closest('form')); const pv = root.querySelector('.br-medprev'); if (pv) { pv.dataset.tier = S.medForm.tier; pv.innerHTML = `${TR({ shape: window.NorexTrophy?.pick(`${S.medForm.name} ${S.medForm.desc}`, 'medal'), tier: S.medForm.tier, icon: S.medForm.icon, size: 64, label: S.medForm.name || 'Preview' })}<div><b>${esc(S.medForm.name || 'Medal name')}</b><small class="muted">${esc(S.medForm.desc || 'How to get it')} · ${esc(TIER_NAME(S.medForm.tier))} · ${esc(S.med.tiers[S.medForm.tier]?.pts)} pts</small></div>`; } }
    else if (t.closest('[data-form="ann"]')) { S.ann.preview = false; const f = t.closest('form'); readAnn(f); f.querySelector('[data-ann="preview"]').disabled = S.ann.title.trim().length < 3; const s = f.querySelector('[data-ann="send"]'); s.disabled = true; f.querySelector('.br-prev')?.remove(); }
    else if (t.closest('[data-form="hof"]') && t.name) S.hofForm[t.name] = t.value;
  });
  root.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.matches('[data-medtier]')) { S.medTier = t.value; paint(); }
    else if (t.matches('[data-awto]')) { S.award.to = t.value; paint(); }
    else if (t.matches('[data-bakfile]')) { if (t.files[0]) planRestore(t.files[0]); }
    else if (t.closest('[data-form="med"]') && (t.name === 'tier' || t.name === 'fact')) { readMed(t.closest('form')); if (t.name === 'fact' && S.medForm.fact === 'manual') S.medForm.goal = 1; paint(); }
    else if (t.dataset.dc) { S.dc[t.dataset.dc] = t.value; S.dc.preview = null; paint(); }
    else if (t.closest('[data-form="hof"]') && t.name) { S.hofForm[t.name] = t.value; }
    else if (t.closest('[data-form="ann"]')) { readAnn(t.closest('form')); S.ann.preview = false; paint(); }
  });
  root.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const mf = ev.target.closest('[data-form="med"]');
    if (mf) return act(async () => { readMed(mf); const m = S.medForm; S.med = await call('/api/admin/medals', { op: 'save', id: m.id || undefined, icon: m.icon, name: m.name, desc: m.desc, tier: m.tier, fact: m.fact, goal: Number(m.goal) }); S.medForm = null; paint(); toast('🏅 Medal saved'); });
    const f = ev.target.closest('[data-form="hof"]'); if (!f) return;
    act(async () => {
      const h = S.hofForm, player = h.kind === 'legend' ? h.player : undefined;
      if (h.kind === 'legend' && !player) throw new Error('Pick a player first.');
      const pl = (window.NOREX?.players || []).find((p) => p.k === player);
      if (!confirm(`Add ${h.kind === 'legend' ? `${pl?.n || 'this player'} as a legend` : `“${h.name}” as a club moment`} to the public Hall of Fame?`)) return;
      S.hof = await call('/api/hof', { kind: h.kind, player, name: h.kind === 'moment' ? h.name : undefined, title: h.title, text: h.text });
      S.hofForm = { kind: h.kind, player: '', name: '', title: '', text: '' }; paint(); toast(h.kind === 'legend' ? '⭐ Inducted' : '📜 Added');
    });
  });

  const load = async () => { // the feature names the finder searches (the switches themselves are edited in Site access)
    try { const ov = await call('/api/admin/overview'); S.flags = ov.flags || null; } catch { S.flags = null; }
    if (S.tab === 'tools') paint();
  };
  let started = false;
  const start = () => { if (started) return; started = true; root.hidden = false; paint(); load(); };
  // the Control Center sidebar opens a tab: PFBoardroom.open('health'); false when the tab does not exist or the viewer is not the owner
  window.PFBoardroom = { tabs: TABS.map(([k]) => k), open: (k) => { if (!TABS.some(([t]) => t === k) || (A.ccRole || A.role) !== 'owner') return false; start(); openTab(k); return true; } };
  (async () => {
    await A.ready?.catch?.(() => {});
    if ((A.ccRole || A.role) !== 'owner') return;
    start();
  })();
})();
