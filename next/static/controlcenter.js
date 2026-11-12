// Staff › Control Center: one place to switch, aim and restrict every output, without asking for a code change.
//   GET  /api/controlcenter            the registry (every command, button, automated post, scheduled job, DM and site section) + the rows set so far + audit
//   GET  /api/controlcenter/discord    channels and roles of the server, for the pickers
//   POST /api/controlcenter/save|reset|create     one output row / make a channel or role in Discord
//   Site access   POST /api/admin/flags, /api/admin/flags/reset   (owner)      Organization   /api/org/config/*  (owner, shared panel next/static/orgpanel.js)
// A slicer row of buttons swaps the panel in place. Every output panel is the same filterable table; Edit opens the row's editor under it.
// The same rows are written by the /setup output command, and the Worker reads them at runtime, so a save applies at once (no deploy).
(() => {
  const d = document, root = d.getElementById('ccLive'); if (!root) return;
  const A = window.NorexAuth, M = window.NorexMotion, API = window.NOREX_API;
  if (!API || !A?.token) return;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const call = (path, body) => (body ? A.call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) : A.call(path));
  const toast = (m, err) => M?.toast ? M.toast(m, err ? { kind: 'err' } : { kind: 'ok' }) : console.log(m);
  const ago = (t) => { const s = Math.max(1, Math.round((Date.now() - t) / 1000)); return s < 90 ? 'just now' : s < 5400 ? Math.round(s / 60) + ' min ago' : s < 129600 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago'; };
  const act = async (fn) => { try { await fn(); } catch (er) { toast(er.message, true); } };
  const empty = (icon, title, text) => `<div class="panel sq-empty"><span>${icon}</span><div><b>${esc(title)}</b><p class="muted small">${esc(text || '')}</p></div></div>`;
  const skel = '<div class="dg-skel"><i></i></div>';

  const PANELS = [['access', '🎛️', 'Site access', null], ['command', '🤖', 'Bot commands', 'command'], ['component', '🔘', 'Buttons & menus', 'component'], ['automated', '📣', 'Automated posts', 'automated'],
    ['scheduled', '⏱️', 'Scheduled', 'scheduled'], ['dm', '🔔', 'DMs & notifications', 'dm'], ['org', '🏢', 'Organization', null], ['audit', '🛡️', 'Audit log', null]];
  const WHO = { command: 'Who can use it', component: 'Who can use it', automated: 'Who gets it', scheduled: 'Runs', dm: 'Who gets it' };
  const LEVELS = ['off', 'owner', 'managers', 'members', 'public'];
  const LVL = { off: 'Nobody', owner: 'Owner only', managers: 'Managers + owner', members: 'Signed-in members', public: 'Everyone' };
  const METHOD_LABEL = { site: '🔔 Site', dm: '💬 Discord DM', push: '📲 Push' };
  const LISTS = { allow_roles: ['roles', 'Roles who can'], allow_members: ['members', 'Members who can'], deny_roles: ['roles', 'Roles who cannot'], deny_members: ['members', 'Members who cannot'], allow_channels: ['channels', 'Usable only in'], deny_channels: ['channels', 'Never usable in'], post_channels: ['channels', 'Posts go to'] };

  const S = { data: null, panel: (location.hash.slice(1) || 'access'), q: '', app: '', state: '', edit: null, draft: null, open: new Set(), discord: null, flagQ: '', err: null };
  if (!PANELS.some(([k]) => k === S.panel)) S.panel = 'access';

  const rowOf = (i) => i.row ?? { enabled: true, rules: {} };
  const rules = (i) => ({ allow_roles: [], allow_members: [], deny_roles: [], deny_members: [], allow_channels: [], deny_channels: [], post_channels: [], allow_levels: [], deny_levels: [], methods: { site: true, dm: true, push: true }, windows: [], ...(rowOf(i).rules || {}) });
  const customised = (i) => !!i.row;
  const nameOf = (kind, id) => { const list = kind === 'roles' ? S.discord?.roles : kind === 'channels' ? S.discord?.channels : S.data?.members; const x = list?.find((y) => String(y.id) === String(id)); return x ? (kind === 'channels' ? `#${x.name}` : kind === 'roles' ? `@${x.name}` : x.name) : id; };
  const kindOfList = (f) => LISTS[f][0];

  // ---------- Site access (the feature levels: who can see each section) ----------
  const siteAccess = () => {
    const f = S.data.flags, can = S.data.me.flags, q = S.flagQ.toLowerCase();
    const rows = S.data.items.filter((i) => i.kind === 'site' && (!q || i.key.toLowerCase().includes(q))).map((i) => { const flag = i.flag, live = f.live[flag] ?? i.level, base = f.committed[flag]; return `<tr><td><b>${esc(flag)}</b>${live !== base ? ' <span class="chip gold">changed</span>' : ''}</td><td class="muted small">${esc(i.summary)}</td><td><div class="seg" role="radiogroup" aria-label="${esc(flag)}">${LEVELS.map((l) => `<button type="button" role="radio" class="${live === l ? 'on' : ''}" aria-checked="${live === l}" data-lvl="${esc(flag)}:${l}"${can ? '' : ' disabled'} title="${esc(LVL[l])}">${l}</button>`).join('')}</div></td><td>${live !== base && can ? `<button class="chip" data-lvlreset="${esc(flag)}">Reset to ${esc(base)}</button>` : ''}</td></tr>`; }).join('');
    return `<p class="muted small">Who can see each section of the site, per level: <b>${LEVELS.map((l) => `${l} = ${LVL[l]}`).join(' · ')}</b>. ${can ? 'Changes apply on the next page load.' : 'Only the owner changes these; you can see them.'}</p>
<div class="cc-filters"><input type="search" data-flagq placeholder="Find a section…" value="${esc(S.flagQ)}" aria-label="Find a section"></div>
<div class="tablewrap"><table class="tbl cc-tbl"><thead><tr><th>Section</th><th>What it is</th><th>Who sees it</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="muted">No match.</td></tr>'}</tbody></table></div>`;
  };

  // ---------- one output panel: filters + table + the open editor ----------
  const summaryOf = (i) => {
    const r = rules(i), bits = [];
    const names = (k, ids) => ids.slice(0, 3).map((x) => esc(nameOf(kindOfList(k), x))).join(', ') + (ids.length > 3 ? ` +${ids.length - 3}` : '');
    if (r.allow_roles.length) bits.push(`roles: ${names('allow_roles', r.allow_roles)}`);
    if (r.allow_members.length) bits.push(`members: ${names('allow_members', r.allow_members)}`);
    if (r.allow_levels.length) bits.push(`levels: ${esc(r.allow_levels.join(', '))}`);
    if (r.min) bits.push(`${esc(r.min)}+`);
    if (r.deny_roles.length || r.deny_members.length || r.deny_levels.length) bits.push(`except ${r.deny_roles.length + r.deny_members.length + r.deny_levels.length}`);
    return bits.length ? bits.join(' · ') : '<span class="muted">default rules</span>';
  };
  const chanSummary = (i) => {
    const r = rules(i), bits = [];
    if (r.post_channels.length) bits.push(`posts → ${r.post_channels.slice(0, 2).map((x) => esc(nameOf('channels', x))).join(', ')}${r.post_channels.length > 2 ? ` +${r.post_channels.length - 2}` : ''}`);
    else if (i.purposes?.length) bits.push(`<span class="muted">purpose: ${esc(i.purposes[0].replace(/_/g, ' '))}</span>`);
    if (r.allow_channels.length) bits.push(`only in ${r.allow_channels.length}`);
    if (r.deny_channels.length) bits.push(`not in ${r.deny_channels.length}`);
    return bits.join('<br>') || '<span class="muted">anywhere</span>';
  };
  const outputPanel = (kind) => {
    const all = S.data.items.filter((i) => i.kind === kind), q = S.q.toLowerCase();
    const apps = [...new Set(all.map((i) => i.app))].sort();
    const rows = all.filter((i) => (!S.app || i.app === S.app) && (!q || `${i.key} ${i.name} ${i.summary} ${i.trigger}`.toLowerCase().includes(q))
      && (!S.state || (S.state === 'on' && rowOf(i).enabled) || (S.state === 'off' && !rowOf(i).enabled) || (S.state === 'custom' && customised(i))));
    const body = rows.map((i) => {
      const on = rowOf(i).enabled, open = S.edit === i.key;
      return `<tr class="${on ? '' : 'cc-off'}" data-key="${esc(i.key)}"><td><b>${esc(i.name)}</b>${customised(i) ? ' <span class="chip gold">set</span>' : ''}<div class="muted small cc-key">${esc(i.key)}${i.summary ? ' · ' + esc(i.summary) : ''}</div></td>
<td>${esc(S.data.apps[i.app] || i.app)}</td><td class="small">${esc(i.kind === 'scheduled' ? i.schedule : (i.trigger === i.name ? '' : i.trigger) || '')}${i.kind !== 'scheduled' && i.schedule ? `<div class="muted">${esc(i.schedule)}</div>` : ''}</td>
<td class="c"><label class="cc-sw"><input type="checkbox" data-sw="${esc(i.key)}"${on ? ' checked' : ''} aria-label="On or off: ${esc(i.name)}"><span></span></label></td>
<td class="small">${kind === 'scheduled' ? '<span class="muted">its posts follow this switch</span>' : summaryOf(i)}</td><td class="small">${kind === 'scheduled' ? '' : chanSummary(i)}</td>
<td class="r"><button class="chip${open ? ' on' : ''}" data-edit="${esc(i.key)}">${open ? 'Close' : 'Edit'}</button></td></tr>${open ? `<tr class="cc-edit"><td colspan="7">${editor(i)}</td></tr>` : ''}`;
    }).join('');
    const nCustom = all.filter(customised).length;
    return `<div class="cc-filters"><input type="search" data-q placeholder="Search ${all.length} items…" value="${esc(S.q)}" aria-label="Search">
<select data-app aria-label="App"><option value="">All apps</option>${apps.map((a) => `<option value="${esc(a)}"${S.app === a ? ' selected' : ''}>${esc(S.data.apps[a] || a)}</option>`).join('')}</select>
<select data-state aria-label="State">${[['', 'On and off'], ['on', 'On'], ['off', 'Off'], ['custom', `Changed (${nCustom})`]].map(([v, l]) => `<option value="${v}"${S.state === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
<span class="muted small">${rows.length} of ${all.length}</span></div>
<div class="tablewrap"><table class="tbl cc-tbl"><thead><tr><th>${kind === 'dm' ? 'Notification' : 'Name'}</th><th>App</th><th>${kind === 'scheduled' ? 'Schedule' : 'When'}</th><th class="c">On</th><th>${WHO[kind]}</th><th>Channels</th><th></th></tr></thead><tbody>${body || `<tr><td colspan="7">${empty('🔍', 'Nothing matches', 'Clear a filter to see more.')}</td></tr>`}</tbody></table></div>`;
  };

  // ---------- the editor: switch, audience (allow + deny), channels (allow + deny + where it posts), methods and windows ----------
  const options = (kind) => (kind === 'roles' ? S.discord?.roles : kind === 'channels' ? S.discord?.channels : S.data.members) || [];
  const picker = (f) => {
    const [kind, label] = LISTS[f], sel = S.draft.rules[f] || [], opts = options(kind), open = S.open.has(f);
    const chips = sel.map((id) => `<button type="button" class="cc-chip" data-rm="${f}:${esc(id)}" title="Remove">${esc(nameOf(kind, id))} ×</button>`).join('') || '<span class="muted small">none (default rules)</span>';
    return `<fieldset class="cc-pick" data-f="${f}"><legend>${label}</legend><div class="cc-chips">${chips}</div>
<details${open ? ' open' : ''} data-det="${f}"><summary>+ Add ${kind === 'members' ? 'members' : kind}</summary>
<input type="search" class="cc-q" data-optq="${f}" placeholder="Search…" aria-label="Search ${kind}">
<div class="cc-opts">${opts.length ? opts.map((o) => `<label data-o="${esc((o.name || '').toLowerCase())}"><input type="checkbox" data-pick="${f}:${esc(o.id)}"${sel.includes(String(o.id)) ? ' checked' : ''}> ${esc(kind === 'channels' ? '#' + o.name : kind === 'roles' ? '@' + o.name : o.name)}</label>`).join('') : `<p class="muted small">${S.discord && !S.discord.ready ? esc(S.discord.error || 'Discord is not connected.') : 'Loading…'} Paste an ID instead.</p>`}</div>
<div class="cc-add"><input data-idin="${f}" inputmode="numeric" placeholder="Paste a Discord ID" aria-label="Discord ID"><button type="button" class="chip" data-idadd="${f}">Add</button>${kind !== 'members' ? `<button type="button" class="chip" data-make="${kind}:${f}">+ New ${kind === 'roles' ? 'role' : 'channel'} in Discord…</button>` : ''}</div></details></fieldset>`;
  };
  function editor(i) {
    const dr = S.draft; if (!dr || S.edit !== i.key) return '';
    const r = dr.rules, k = i.kind, isDm = k === 'dm', isCmd = k === 'command';
    const lvls = (name, title) => `<fieldset class="cc-pick"><legend>${title}</legend><div class="cc-chips">${['member', 'claimed', 'manager', 'owner'].map((l) => `<label class="cc-lv"><input type="checkbox" data-lv="${name}:${l}"${(r[name] || []).includes(l) ? ' checked' : ''}> ${l}</label>`).join('')}</div></fieldset>`;
    const windows = (r.windows || []).map((w, n) => `<div class="cc-win"><span>${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dn, di) => `<label><input type="checkbox" data-wd="${n}:${di}"${(w.days || []).includes(di) ? ' checked' : ''}>${dn}</label>`).join(' ')}</span> <input type="time" data-wf="${n}" value="${esc(w.from)}"> to <input type="time" data-wt="${n}" value="${esc(w.to)}"> UTC <button type="button" class="chip" data-wdel="${n}">Remove</button></div>`).join('');
    const methods = isDm ? `<fieldset class="cc-pick"><legend>Methods managers allow</legend><label class="cc-lv"><input type="checkbox" data-mall${['site', 'dm', 'push'].every((m) => r.methods[m]) ? ' checked' : ''}> <b>All</b></label>${['site', 'dm', 'push'].map((m) => `<label class="cc-lv"><input type="checkbox" data-meth="${m}"${r.methods[m] ? ' checked' : ''}> ${METHOD_LABEL[m]}</label>`).join('')}<p class="muted small">Members still tick their own boxes; a box a manager turns off here cannot be used for this alert.</p></fieldset>
<fieldset class="cc-pick"><legend>Time windows (DM and push only send inside these, UTC; none = any time)</legend>${windows}<button type="button" class="chip" data-wadd>+ Add a window</button></fieldset>` : '';
    return `<form class="cc-form" data-form="${esc(i.key)}"><div class="cc-head"><label class="cc-sw big"><input type="checkbox" data-draftsw${dr.enabled ? ' checked' : ''}><span></span></label><b>${dr.enabled ? 'On' : 'Off'}</b> <span class="muted small">${esc(i.key)}</span>
${isCmd ? `<label class="small">Lowest level <select data-min><option value="">Default</option>${['guest', 'member', 'claimed', 'manager'].map((l) => `<option${r.min === l ? ' selected' : ''}>${l}</option>`).join('')}</select></label><label class="small">Reply <select data-reply>${[['', 'Default'], ['private', 'Only the person'], ['public', 'In the channel']].map(([v, l]) => `<option value="${v}"${(r.reply || '') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}</div>
<div class="cc-cols"><div><h4>${WHO[k] === 'Runs' ? 'Audience' : WHO[k]}</h4>${picker('allow_roles')}${picker('allow_members')}${isDm ? lvls('allow_levels', 'Levels who get it (blank = everyone)') : ''}${picker('deny_roles')}${picker('deny_members')}${isDm ? lvls('deny_levels', 'Levels who never get it') : ''}</div>
<div><h4>Channels</h4>${k === 'dm' ? '<p class="muted small">DMs are private: no channel.</p>' : `${picker('allow_channels')}${picker('deny_channels')}${picker('post_channels')}${i.purposes?.length ? `<p class="muted small">With none picked it goes to the Organization channel for <b>${esc(i.purposes.join(', ').replace(/_/g, ' '))}</b>${(S.data.purposeChannels[i.purposes[0]] || []).length ? ': ' + S.data.purposeChannels[i.purposes[0]].map((c) => esc(nameOf('channels', c))).join(', ') : ' (none set yet)'}.</p>` : ''}`}${methods}</div></div>
<div class="cc-actions"><button class="chip on" type="submit">Save</button><button class="chip" type="button" data-reset="${esc(i.key)}">Back to default</button><button class="chip" type="button" data-close>Cancel</button>${i.applies?.length ? `<span class="muted small">Applies through: ${esc(i.applies.join(', ').replace('via-job', 'its scheduled job switch'))}</span>` : ''}</div></form>`;
  }

  // ---------- the frame ----------
  const auditPanel = () => `<div class="tablewrap"><table class="tbl cc-tbl"><thead><tr><th>When</th><th>Who</th><th>Output</th><th>Change</th></tr></thead><tbody>${S.data.audit.map((a) => { const k = a.after?.key || a.before?.key || ''; const b = a.before, n = a.after; return `<tr><td class="small">${ago(a.at)}</td><td>${esc(a.name || a.user_id)}</td><td class="small">${esc(k)}</td><td class="small">${esc(a.action)}${b && n && b.enabled !== n.enabled ? ` · ${n.enabled ? 'switched on' : 'switched off'}` : ''}</td></tr>`; }).join('') || '<tr><td colspan="4" class="muted">No changes yet.</td></tr>'}</tbody></table></div>`;
  const OP = window.PFOrgPanel ? window.PFOrgPanel({ root, call, toast, esc, ago, empty, skel, act, repaint: () => paint(), active: () => S.panel === 'org' }) : null;
  function paint() {
    if (!root.isConnected) return;
    if (S.err) { root.innerHTML = empty('🔒', 'Control Center', S.err); return; }
    if (!S.data) { root.innerHTML = skel; return; }
    const counts = Object.fromEntries(PANELS.map(([k, , , kind]) => [k, kind ? S.data.items.filter((i) => i.kind === kind).length : k === 'access' ? S.data.items.filter((i) => i.kind === 'site').length : k === 'audit' ? S.data.audit.length : null]));
    const cur = PANELS.find(([k]) => k === S.panel);
    let body = '';
    if (S.panel === 'access') body = siteAccess();
    else if (S.panel === 'org') body = !S.data.me.org ? empty('🔒', 'Organization', 'Only the owner changes the Discord servers, channels, roles and clubs.') : OP ? OP.html() : empty('⚠️', 'Organization', 'The Organization panel did not load.');
    else if (S.panel === 'audit') body = auditPanel();
    else body = outputPanel(cur[3]);
    const keep = d.activeElement?.matches?.('[data-q],[data-flagq]') ? d.activeElement.hasAttribute('data-q') ? 'data-q' : 'data-flagq' : null, pos = keep ? d.activeElement.selectionStart : 0;
    root.innerHTML = `<nav class="cc-slicer" role="tablist" aria-label="Control Center panels">${PANELS.map(([k, e, t]) => `<button type="button" role="tab" class="chip${S.panel === k ? ' on' : ''}" aria-selected="${S.panel === k}" data-panel="${k}">${e} ${t}${counts[k] != null ? ` <small>${counts[k]}</small>` : ''}</button>`).join('')}</nav>
<section class="cc-panel" id="ccPanel" role="tabpanel" aria-label="${esc(cur[2])}">${body}</section>`;
    if (keep) { const el = root.querySelector(`[${keep}]`); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch {} } }
  }

  const load = async () => {
    try { S.data = await call('/api/controlcenter'); S.err = null; } catch (er) { S.err = er.status === 403 || /only/i.test(er.message) ? 'The Control Center is for managers and the owner.' : er.message; }
    paint();
    if (S.data && S.panel === 'org' && OP) OP.load();
  };
  const loadDiscord = async () => { if (S.discord) return; try { S.discord = await call('/api/controlcenter/discord'); } catch (er) { S.discord = { ready: false, error: er.message }; } paint(); };
  const find = (key) => S.data.items.find((i) => i.key === key);
  const openEdit = (key) => { if (S.edit === key) { S.edit = null; S.draft = null; return paint(); } const i = find(key); S.edit = key; S.draft = { enabled: rowOf(i).enabled, rules: JSON.parse(JSON.stringify(rules(i))) }; paint(); loadDiscord(); };
  const save = (i) => act(async () => { const res = await call('/api/controlcenter/save', { key: i.key, enabled: S.draft.enabled, rules: S.draft.rules }); const row = res.row, def = row.enabled && JSON.stringify(row.rules) === JSON.stringify(rules({ row: null })); i.row = def ? null : { enabled: row.enabled, rules: row.rules, updated_at: Date.now() }; S.edit = null; S.draft = null; toast('Saved: applies now'); await load(); });
  const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  root.addEventListener('click', (ev) => {
    const t = ev.target.closest('button'); if (!t) return; const k = t.dataset;
    if (k.panel) { S.panel = k.panel; S.edit = null; S.draft = null; history.replaceState(null, '', `#${k.panel}`); paint(); if (k.panel === 'org' && OP && !OP.O.cfg) OP.load(); return; }
    if (k.edit) return openEdit(k.edit);
    if ('close' in k) { S.edit = null; S.draft = null; return paint(); }
    if (k.lvl) { const [flag, level] = k.lvl.split(':'); if (!confirm(`Change “${flag}” to ${level}? ${LVL[level]} will see it from the next page load.`)) return; return act(async () => { const r = await call('/api/admin/flags', { name: flag, level }); S.data.flags.live = r.flags; paint(); toast(`${flag}: ${level}`); }); }
    if (k.lvlreset) return act(async () => { const r = await call('/api/admin/flags/reset', { name: k.lvlreset }); S.data.flags.live = r.flags; paint(); toast('Back to the committed level'); });
    if (k.reset) return act(async () => { await call('/api/controlcenter/reset', { key: k.reset }); S.edit = null; S.draft = null; toast('Back to default'); await load(); });
    if (k.rm) { const [f, id] = k.rm.split(/:(.+)/); S.draft.rules[f] = S.draft.rules[f].filter((x) => x !== id); return paint(); }
    if (k.idadd) { const inp = root.querySelector(`[data-idin="${k.idadd}"]`), v = String(inp?.value || '').replace(/\D/g, ''); if (v.length < 5) return toast('Paste a Discord ID (the long number).', true); S.draft.rules[k.idadd] = [...new Set([...S.draft.rules[k.idadd], v])]; S.open.add(k.idadd); return paint(); }
    if ('wadd' in k) { S.draft.rules.windows.push({ days: [0, 1, 2, 3, 4, 5, 6], from: '08:00', to: '22:00' }); return paint(); }
    if (k.wdel) { S.draft.rules.windows.splice(+k.wdel, 1); return paint(); }
    if (k.make) { const [kind, f] = k.make.split(':'), name = prompt(`Name for the new ${kind === 'roles' ? 'role' : 'channel'} (it is created in Discord, then attached here):`); if (!name) return; return act(async () => { const r = await call('/api/controlcenter/create', { kind: kind === 'roles' ? 'role' : 'channel', name }); S.discord = null; await loadDiscord(); S.draft.rules[f] = [...new Set([...S.draft.rules[f], r.id])]; S.open.add(f); paint(); toast(`Created ${r.name}`); }); }
  });
  root.addEventListener('change', (ev) => {
    const t = ev.target, k = t.dataset;
    if ('q' in k) return; // typing is handled by input
    if (k.app !== undefined && t.matches('select[data-app]')) { S.app = t.value; return paint(); }
    if (t.matches('select[data-state]')) { S.state = t.value; return paint(); }
    if (k.sw) { const i = find(k.sw), on = t.checked; return act(async () => { try { await call('/api/controlcenter/save', { key: i.key, enabled: on, rules: rules(i) }); } catch (er) { t.checked = !on; throw er; } i.row = { ...(i.row || {}), enabled: on, rules: rules(i) }; await load(); toast(`${i.name}: ${on ? 'on' : 'off'}`); }); }
    if (!S.draft) return;
    const dr = S.draft, r = dr.rules;
    if ('draftsw' in k) { dr.enabled = t.checked; return paint(); }
    if (k.pick) { const [f, id] = k.pick.split(/:(.+)/); r[f] = t.checked ? [...new Set([...r[f], id])] : r[f].filter((x) => x !== id); S.open.add(f); return paint(); }
    if (k.lv) { const [f, l] = k.lv.split(':'); r[f] = toggle(r[f] || [], l); return paint(); }
    if ('mall' in k) { for (const m of ['site', 'dm', 'push']) r.methods[m] = t.checked; return paint(); }
    if (k.meth) { r.methods[k.meth] = t.checked; return paint(); }
    if (t.matches('[data-min]')) { r.min = t.value || undefined; return; }
    if (t.matches('[data-reply]')) { r.reply = t.value || undefined; return; }
    if (k.wd) { const [n, day] = k.wd.split(':').map(Number); r.windows[n].days = toggle(r.windows[n].days, day); return; }
    if (k.wf !== undefined) { r.windows[+k.wf].from = t.value || '00:00'; return; }
    if (k.wt !== undefined) { r.windows[+k.wt].to = t.value || '23:59'; return; }
  });
  root.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t.matches('[data-q]')) { S.q = t.value; return paint(); }
    if (t.matches('[data-flagq]')) { S.flagQ = t.value; return paint(); }
    if (t.dataset.optq) { const q = t.value.toLowerCase(); t.closest('details').querySelectorAll('.cc-opts label').forEach((l) => { l.hidden = !!q && !l.dataset.o.includes(q); }); }
  });
  root.addEventListener('toggle', (ev) => { const f = ev.target.dataset?.det; if (f) ev.target.open ? S.open.add(f) : S.open.delete(f); }, true);
  root.addEventListener('submit', (ev) => { const f = ev.target.closest('[data-form]'); if (!f) return; ev.preventDefault(); const i = find(f.dataset.form); if (i && S.draft) save(i); });

  (async () => {
    await A.ready?.catch?.(() => {});
    if (A.role !== 'owner' && A.role !== 'manager') return;
    d.getElementById('ccLocal')?.setAttribute('hidden', ''); root.hidden = false; paint(); load();
  })();
})();
