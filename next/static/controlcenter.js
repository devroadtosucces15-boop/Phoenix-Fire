// Staff › Control Center: one place to switch, aim and restrict every output, without asking for a code change.
//   GET  /api/controlcenter            the registry (every command, button, automated post, scheduled job, DM and site section) + the rows set so far + audit
//   GET  /api/controlcenter/discord    channels and roles of the server, for the pickers
//   POST /api/controlcenter/save|reset|create     one output row / make a channel or role in Discord
//   Site access   POST /api/admin/flags, /api/admin/flags/reset   (owner): level buttons, undo, back-to-committed, Go to and Show me (the retired Boardroom Switches tab)
//   Organization   /api/org/config/*  (owner, shared panel next/static/orgpanel.js)
//   Bot settings  GET/POST /api/controlcenter/settings[/<area>]   Audit log  GET /api/controlcenter/audit   (next/static/ccsettings.js: the retired Tools Bot tab and Boardroom Audit tab)
//   Bot commands  the command rules plus Sync to Discord (POST /api/bot/commands/sync): the retired Tools Bot tab's command table
// A slicer row of buttons swaps the panel in place. Every output panel is the same filterable table; Edit opens the row's editor under it.
// The same rows are written by the /setup output command, and the Worker reads them at runtime, so a save applies at once (no deploy).
(() => {
  const d = document, root = d.getElementById('ccLive'); if (!root) return;
  const A = window.NorexAuth, M = window.NorexMotion, API = window.NOREX_API;
  if (!API || !A?.token) return;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const call = (path, body) => (body ? A.call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) : A.call(path));
  const toast = (m, err) => window.PhoenixNotices ? window.PhoenixNotices.toast(m, err) : console.log(m);
  const ago = (t) => { const s = Math.max(1, Math.round((Date.now() - t) / 1000)); return s < 90 ? 'just now' : s < 5400 ? Math.round(s / 60) + ' min ago' : s < 129600 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago'; };
  const act = async (fn) => { try { await fn(); } catch (er) { toast(er.message, true); } };
  const empty = (icon, title, text) => `<div class="panel sq-empty"><span>${icon}</span><div><b>${esc(title)}</b><p class="muted small">${esc(text || '')}</p></div></div>`;
  const skel = '<div class="dg-skel"><i></i></div>';

  const PANELS = [['access', '🎛️', 'Site access', null], ['command', '🤖', 'Bot commands', 'command'], ['component', '🔘', 'Buttons & menus', 'component'], ['automated', '📣', 'Automated posts', 'automated'],
    ['scheduled', '⏱️', 'Scheduled', 'scheduled'], ['dm', '🔔', 'DMs & notifications', 'dm'], ['settings', '⚙️', 'Bot settings', null], ['org', '🏢', 'Organization', null], ['audit', '🛡️', 'Audit log', null]];
  const WHO = { command: 'Who can use it', component: 'Who can use it', automated: 'Who gets it', scheduled: 'Runs', dm: 'Who gets it' };
  const LEVELS = ['off', 'owner', 'managers', 'members', 'public'];
  const LVL = { off: 'Nobody', owner: 'Owner only', managers: 'Managers + owner', members: 'Signed-in members', public: 'Everyone' };
  const METHOD_LABEL = { site: '🔔 Site', dm: '💬 Discord DM', push: '📲 Push' };
  const LISTS = { allow_roles: ['roles', 'Roles who can'], allow_members: ['members', 'Members who can'], deny_roles: ['roles', 'Roles who cannot'], deny_members: ['members', 'Members who cannot'], allow_channels: ['channels', 'Usable only in'], deny_channels: ['channels', 'Never usable in'], post_channels: ['channels', 'Posts go to'] };

  const shell = !!root.closest('.cx'); // inside the Control Center shell (ccshell.js) the sidebar picks the panel, so no slicer here
  const S = { data: null, panel: (location.hash.slice(1) || 'access'), q: '', app: '', state: '', edit: null, draft: null, open: new Set(), discord: null, flagQ: '', err: null, undo: [], enter: true, anim: null, closing: null, groupsTouched: false };
  if (!PANELS.some(([k]) => k === S.panel)) S.panel = 'access';

  const rowOf = (i) => i.row ?? { enabled: true, rules: {} };
  const rules = (i) => ({ allow_roles: [], allow_members: [], deny_roles: [], deny_members: [], allow_channels: [], deny_channels: [], post_channels: [], allow_levels: [], deny_levels: [], methods: { site: true, dm: true, push: true }, windows: [], ...(rowOf(i).rules || {}) });
  const customised = (i) => !!i.row;
  const nameOf = (kind, id) => { const list = kind === 'roles' ? S.discord?.roles : kind === 'channels' ? S.discord?.channels : S.data?.members; const x = list?.find((y) => String(y.id) === String(id)); return x ? (kind === 'channels' ? `#${x.name}` : kind === 'roles' ? `@${x.name}` : x.name) : id; };
  const kindOfList = (f) => LISTS[f][0];

  // ---------- Site access (the feature levels: who can see each section) ----------
  // where each feature lives comes from the staff manifest (next/lib/flagwhere.mjs): [page, heading, Control Center tool]
  const WHERE = (window.PFStaffManifest || {}).where || {};
  const goTo = (flag) => { const [page, find, hash] = WHERE[flag] || ['index.html', '']; return page + (find ? `?nx=${encodeURIComponent('~' + find)}` : '') + (hash ? '#' + hash : ''); };
  const VIEWS = [['', '👑', 'Me (owner)', 'Everything I can see'], ['member', '🧑', 'Member', 'A signed-in club member'], ['guest', '👤', 'Guest', 'Someone not signed in']];
  const nice = (k) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
  function showMe(k) { // open the page the way a member or a guest sees it (display only: the server still treats you as the owner)
    const [pg, find] = WHERE[k] || ['index.html', ''], dlg = d.createElement('div'); dlg.className = 'br-modal'; dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true'); dlg.setAttribute('aria-label', `Show me ${nice(k)}`);
    const cur = A?.viewAs || '';
    dlg.innerHTML = `<div class="br-sheet"><h4>Show me <b>${esc(nice(k))}</b> as…</h4><p class="muted small">Opens ${esc(pg.replace('.html', ''))}${find ? ` at “${esc(find)}”` : ''} and shows it the way that person sees the site. Display only: the server still treats you as the owner. A bar on every page takes you back.</p>
<div class="br-views">${VIEWS.map(([v, ic, n, sub]) => `<button type="button" data-v="${v}"${v === cur ? ' class="on"' : ''}><span aria-hidden="true">${ic}</span><b>${n}</b><small>${sub}</small></button>`).join('')}</div><button type="button" class="chip" data-x>Cancel</button></div>`;
    const close = () => { dlg.remove(); d.removeEventListener('keydown', onKey); }, onKey = (e) => { if (e.key === 'Escape') close(); };
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg || e.target.closest('[data-x]')) return close(); const b = e.target.closest('[data-v]'); if (!b) return;
      try { if (b.dataset.v) { localStorage.setItem('phoenix.viewas', b.dataset.v); localStorage.setItem('phoenix.viewas.t', String(Date.now())); } else { localStorage.removeItem('phoenix.viewas'); localStorage.removeItem('phoenix.viewas.t'); } } catch {}
      location.href = goTo(k);
    });
    d.addEventListener('keydown', onKey); d.body.appendChild(dlg); dlg.querySelector('[data-v]').focus();
  }

  const UI = window.PFCCUI;
  const LV4 = ['owner', 'managers', 'members', 'public'];
  const LV_SHORT = { owner: 'Owner', managers: 'Managers', members: 'Members', public: 'Everyone' };
  const siteAccess = () => {
    const f = S.data.flags, can = S.data.me.flags, q = S.flagQ.toLowerCase();
    const sites = S.data.items.filter((i) => i.kind === 'site');
    const liveOf = (i) => f.live[i.flag] ?? i.level;
    const hit = (i) => !q || i.key.toLowerCase().includes(q) || nice(i.flag || '').toLowerCase().includes(q);
    const flagCard = (i, n) => {
      const flag = i.flag, live = liveOf(i), base = f.committed[flag], on = live !== 'off', changed = live !== base, go = WHERE[flag];
      const body = `<div class="cu-field"><span>Who sees it</span>${UI.seg(flag, LV4.map((l) => [l, LV_SHORT[l], LVL[l], `data-lvl="${esc(flag)}:${l}"${can && on ? '' : ' disabled'}`]), on ? live : '')}<small class="cu-hint">${on ? esc(LVL[live]) + ' see this section from the next page load.' : 'Switched off: nobody sees it. Turn the switch on to choose who does.'}</small></div>
<div class="cc-actions">${changed && can ? `<button class="chip" data-lvlreset="${esc(flag)}">Back to ${esc(base)}</button>` : ''}${go ? `<a class="chip" href="${esc(goTo(flag))}">↗ Open the page</a><button type="button" class="chip" data-show="${esc(flag)}">👁 See it as a member or guest</button>` : ''}</div>`;
      return UI.card({ id: 'f:' + flag, icon: '🎚️', title: esc(nice(flag)), sub: esc(i.summary), on, i: n, body,
        chips: [UI.pill(on ? esc(LV_SHORT[live] || live) : 'Off', on ? 'hot' : ''), changed ? UI.pill('Changed from ' + esc(base), 'hot') : ''],
        sw: UI.sw(`data-flagsw="${esc(flag)}"${can ? '' : ' disabled'}`, on, `On or off: ${nice(flag)}`) });
    };
    // collapsible groups with counts (the retired Switches tab's grouping); a switch in no group lands in "Everything else"
    const groups = ((window.PFStaffManifest || {}).flagGroups || []).map(([t, ks]) => [t, sites.filter((i) => ks.includes(i.flag))]);
    const used = new Set(groups.flatMap(([, it]) => it.map((i) => i.key))), rest = sites.filter((i) => !used.has(i.key)); if (rest.length) groups.push(['⚙️ Everything else', rest]);
    if (!S.groupsInit) { S.groupsInit = true; groups.forEach(([t]) => S.open.add('g:' + t)); }
    let n = 0;
    const html = groups.map(([t, it]) => { const shown = it.filter(hit); if (!shown.length) return ''; const on = it.filter((i) => liveOf(i) !== 'off').length;
      return `<details class="cu-group" data-det="g:${esc(t)}"${q || S.open.has('g:' + t) ? ' open' : ''}><summary><span>${esc(t)}</span><small>${on} of ${it.length} on</small></summary><div class="cu-grid">${shown.map((i) => flagCard(i, n++)).join('')}</div></details>`; }).join('');
    const nOver = sites.filter((i) => liveOf(i) !== f.committed[i.flag]).length;
    return `<p class="muted small">Switch a section on or off, then pick who sees it. ${can ? 'Changes apply on the next page load. A new feature starts at Owner only.' : 'Only the owner changes these; you can see them.'}</p>
${UI.bar({ search: S.flagQ, placeholder: 'Find a section…', attr: 'data-flagq', count: `${sites.length} sections · ${nOver} changed live`, extra: `<button type="button" class="chip" data-undo${S.undo.length && can ? '' : ' disabled'}>↶ Undo${S.undo.length ? ` (${esc(S.undo[S.undo.length - 1].name)})` : ''}</button>` })}
${html ? `<div class="cu-groups">${html}</div>` : empty('🔍', 'No section matches', 'Clear the search to see them all.')}`;
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
  const KIND_ICON = { command: '⌨️', component: '🔘', automated: '📣', scheduled: '⏱️', dm: '🔔' };
  const plain = (h) => String(h).replace(/<br>/g, ' · ').replace(/<[^>]+>/g, '');
  const outputPanel = (kind) => {
    const all = S.data.items.filter((i) => i.kind === kind), q = S.q.toLowerCase();
    const apps = [...new Set(all.map((i) => i.app))].sort();
    const rows = all.filter((i) => (!S.app || i.app === S.app) && (!q || `${i.key} ${i.name} ${i.summary} ${i.trigger}`.toLowerCase().includes(q))
      && (!S.state || (S.state === 'on' && rowOf(i).enabled) || (S.state === 'off' && !rowOf(i).enabled) || (S.state === 'custom' && customised(i))));
    const nCustom = all.filter(customised).length, nOn = all.filter((i) => rowOf(i).enabled).length;
    let n = 0;
    const cardOf = (i) => {
      const on = rowOf(i).enabled, open = S.edit === i.key, when = i.kind === 'scheduled' ? i.schedule : (i.trigger === i.name ? '' : i.trigger) || '';
      const chips = [UI.pill(esc(S.data.apps[i.app] || i.app))];
      if (when) chips.push(UI.pill(esc(when)));
      if (kind !== 'scheduled') { chips.push(UI.pill(plain(summaryOf(i)), customised(i) ? 'hot' : '')); const ch = plain(chanSummary(i)); if (ch && ch !== 'anywhere') chips.push(UI.pill('📍 ' + ch)); }
      else chips.push(UI.pill('its posts follow this switch'));
      if (customised(i)) chips.push(UI.pill('Changed', 'hot'));
      return UI.card({ id: 'o:' + i.key, icon: KIND_ICON[kind] || '🎛️', title: esc(i.name), sub: esc(i.summary || i.key), chips, on, i: n++, toggle: false, open, anim: open && S.anim === i.key, closing: S.closing === i.key,
        attrs: `data-key="${esc(i.key)}"`, sw: UI.sw(`data-sw="${esc(i.key)}"`, on, `On or off: ${i.name}`), body: open ? editor(i) : ' ', btnAttrs: `data-edit="${esc(i.key)}"` });
    };
    const cards = (list) => list.map(cardOf).join('');
    const byApp = apps.filter((a) => rows.some((i) => i.app === a)).map((a) => [a, rows.filter((i) => i.app === a)]);
    const stateSeg = UI.seg('State', [['', `All ${all.length}`], ['on', `On ${nOn}`], ['off', `Off ${all.length - nOn}`], ['custom', `Changed ${nCustom}`]].map(([v, l]) => [v, l, l, `data-statebtn="${v}"`]), S.state);
    return `${UI.bar({ search: S.q, placeholder: `Search ${all.length} items…`, seg: stateSeg,
      extra: `<label class="cu-sel"><select data-app aria-label="App"><option value="">All apps</option>${apps.map((a) => `<option value="${esc(a)}"${S.app === a ? ' selected' : ''}>${esc(S.data.apps[a] || a)}</option>`).join('')}</select></label>${kind === 'command' ? `<button type="button" class="chip" data-sync title="Pushes the command list to Discord and hides staff-only commands from its menu">🔄 Sync to Discord</button>` : ''}`,
      count: `${rows.length} of ${all.length}` })}
${byApp.length ? `<div class="cu-groups">${byApp.map(([a, list]) => `<section><h3 class="cu-gh">${esc(S.data.apps[a] || a)} <small>${list.length}</small></h3><div class="cu-grid">${cards(list)}</div></section>`).join('')}</div>` : empty('🔍', 'Nothing matches', 'Clear a filter to see more.')}`;
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
  const more = (title, inner, openNow) => `<details class="cu-more" data-det="m:${esc(title)}"${openNow || S.open.has('m:' + title) ? ' open' : ''}><summary>${esc(title)}</summary><div>${inner}</div></details>`;
  function editor(i) {
    const dr = S.draft; if (!dr || S.edit !== i.key) return '';
    const r = dr.rules, k = i.kind, isDm = k === 'dm', isCmd = k === 'command';
    const lvls = (name, title) => `<fieldset class="cc-pick"><legend>${title}</legend><div class="cc-chips">${['member', 'claimed', 'manager', 'owner'].map((l) => `<label class="cc-lv"><input type="checkbox" data-lv="${name}:${l}"${(r[name] || []).includes(l) ? ' checked' : ''}> ${l}</label>`).join('')}</div></fieldset>`;
    const windows = (r.windows || []).map((w, n) => `<div class="cc-win"><span>${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dn, di) => `<label><input type="checkbox" data-wd="${n}:${di}"${(w.days || []).includes(di) ? ' checked' : ''}>${dn}</label>`).join('')}</span><input type="time" aria-label="From (UTC)" data-wf="${n}" value="${esc(w.from)}"> to <input type="time" aria-label="To (UTC)" data-wt="${n}" value="${esc(w.to)}"> UTC <button type="button" class="chip" data-wdel="${n}">Remove</button></div>`).join('');
    const methods = isDm ? `<fieldset class="cc-pick"><legend>Methods managers allow</legend><div class="cc-chips"><label class="cc-lv"><input type="checkbox" data-mall${['site', 'dm', 'push'].every((m) => r.methods[m]) ? ' checked' : ''}> <b>All</b></label>${['site', 'dm', 'push'].map((m) => `<label class="cc-lv"><input type="checkbox" data-meth="${m}"${r.methods[m] ? ' checked' : ''}> ${METHOD_LABEL[m]}</label>`).join('')}</div><p class="cu-hint">Members still tick their own boxes; a box a manager turns off here cannot be used for this alert.</p></fieldset>
<fieldset class="cc-pick"><legend>Time windows</legend><p class="cu-hint">DM and push only send inside these (UTC). None = any time.</p>${windows}<button type="button" class="chip" data-wadd>+ Add a window</button></fieldset>` : '';
    const top = isCmd ? `<div class="cu-fields">${UI.field('Lowest level that can use it', `<select data-min><option value="">Default</option>${['guest', 'member', 'claimed', 'manager'].map((l) => `<option${r.min === l ? ' selected' : ''}>${l}</option>`).join('')}</select>`)}${UI.field('Where the reply shows', `<select data-reply>${[['', 'Default'], ['private', 'Only the person'], ['public', 'In the channel']].map(([v, l]) => `<option value="${v}"${(r.reply || '') === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`)}</div>` : '';
    return `<form class="cc-form" data-form="${esc(i.key)}">${top}
<div class="cc-cols"><div><h4>${WHO[k] === 'Runs' ? 'Audience' : WHO[k]}</h4>${picker('allow_roles')}${picker('allow_members')}${isDm ? lvls('allow_levels', 'Levels who get it (blank = everyone)') : ''}${more('Exceptions: who never gets it', `${picker('deny_roles')}${picker('deny_members')}${isDm ? lvls('deny_levels', 'Levels who never get it') : ''}`, ['deny_roles', 'deny_members'].some((f) => (r[f] || []).length) || (r.deny_levels || []).length)}</div>
<div><h4>Channels</h4>${k === 'dm' ? '<p class="cu-hint">DMs are private: no channel.</p>' : `${picker('post_channels')}${more('Limit where it works', `${picker('allow_channels')}${picker('deny_channels')}`, ['allow_channels', 'deny_channels'].some((f) => (r[f] || []).length))}${i.purposes?.length ? `<p class="cu-hint">With none picked it goes to the Organization channel for <b>${esc(i.purposes.join(', ').replace(/_/g, ' '))}</b>${(S.data.purposeChannels[i.purposes[0]] || []).length ? ': ' + S.data.purposeChannels[i.purposes[0]].map((c) => esc(nameOf('channels', c))).join(', ') : ' (none set yet)'}.</p>` : ''}`}${methods}</div></div>
<div class="cc-actions"><button class="chip on" type="submit">Save changes</button><button class="chip" type="button" data-reset="${esc(i.key)}">Back to default</button><button class="chip" type="button" data-close>Cancel</button>${i.applies?.length ? `<span class="cu-hint">Applies through: ${esc(i.applies.join(', ').replace('via-job', 'its scheduled job switch'))}</span>` : ''}</div></form>`;
  }

  // ---------- the frame ----------
  const auditPanel = () => `<div class="tablewrap"><table class="tbl cc-tbl"><caption class="sr">Audit log</caption><thead><tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">Output</th><th scope="col">Change</th></tr></thead><tbody>${S.data.audit.map((a) => { const k = a.after?.key || a.before?.key || ''; const b = a.before, n = a.after; return `<tr><td class="small">${ago(a.at)}</td><td>${esc(a.name || a.user_id)}</td><td class="small">${esc(k)}</td><td class="small">${esc(a.action)}${b && n && b.enabled !== n.enabled ? ` · ${n.enabled ? 'switched on' : 'switched off'}` : ''}</td></tr>`; }).join('') || '<tr><td colspan="4" class="muted">No changes yet.</td></tr>'}</tbody></table></div>`;
  const OP = window.PFOrgPanel ? window.PFOrgPanel({ root, call, toast, esc, ago, empty, skel, act, repaint: () => paint(), active: () => S.panel === 'org' }) : null;
  const mk = (f, panel) => (window[f] ? window[f]({ root, call, toast, esc, ago, empty, skel, act, repaint: () => paint(), active: () => S.panel === panel }) : null);
  const CS = mk('PFCCSettings', 'settings'), AU = mk('PFCCAudit', 'audit'); // ccsettings.js: Bot settings and the one audit feed
  function paint() {
    if (!root.isConnected) return;
    if (S.err) { root.innerHTML = empty('🔒', 'Control Center', S.err); return; }
    if (!S.data) { root.innerHTML = skel; return; }
    const counts = Object.fromEntries(PANELS.map(([k, , , kind]) => [k, kind ? S.data.items.filter((i) => i.kind === kind).length : k === 'access' ? S.data.items.filter((i) => i.kind === 'site').length : k === 'audit' ? S.data.audit.length : null]));
    const cur = PANELS.find(([k]) => k === S.panel);
    let body = '';
    if (S.panel === 'access') body = siteAccess();
    else if (S.panel === 'org') body = !S.data.me.org ? empty('🔒', 'Organization', 'Only the owner changes the Discord servers, channels, roles and clubs.') : OP ? OP.html() : empty('⚠️', 'Organization', 'The Organization panel did not load.');
    else if (S.panel === 'settings') body = CS ? CS.html() : empty('⚠️', 'Bot settings', 'The settings panel did not load.');
    else if (S.panel === 'audit') body = AU ? AU.html() : auditPanel();
    else body = outputPanel(cur[3]);
    const keep = d.activeElement?.matches?.('[data-q],[data-flagq]') ? d.activeElement.hasAttribute('data-q') ? 'data-q' : 'data-flagq' : null, pos = keep ? d.activeElement.selectionStart : 0;
    root.innerHTML = `${shell ? '' : `<nav class="cc-slicer" role="tablist" aria-label="Control Center panels">${PANELS.map(([k, e, t]) => `<button type="button" role="tab" class="chip${S.panel === k ? ' on' : ''}" aria-selected="${S.panel === k}" data-panel="${k}">${e} ${t}${counts[k] != null ? ` <small>${counts[k]}</small>` : ''}</button>`).join('')}</nav>`}
<section class="cc-panel cu-panel${S.enter ? ' cu-enter' : ''}" id="ccPanel" role="tabpanel" aria-label="${esc(cur[2])}">${body}</section>`;
    S.enter = false; S.anim = null; S.closing = null;
    if (keep) { const el = root.querySelector(`[${keep}]`); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch {} } }
  }

  const load = async () => {
    try { S.data = await call('/api/controlcenter'); S.err = null; } catch (er) { S.err = er.status === 403 || /only/i.test(er.message) ? 'The Control Center is for managers and the owner.' : er.message; }
    paint();
    if (S.data && S.panel === 'org' && OP) OP.load();
    window.dispatchEvent(new CustomEvent('pfcc:data'));
  };
  const loadDiscord = async () => { if (S.discord) return; try { S.discord = await call('/api/controlcenter/discord'); } catch (er) { S.discord = { ready: false, error: er.message }; } paint(); };
  const find = (key) => S.data.items.find((i) => i.key === key);
  const closeEdit = () => { const key = S.edit, card = key && root.querySelector(`.cu-card[data-key="${CSS.escape(key)}"]`); if (!card) { S.edit = null; S.draft = null; return paint(); } card.setAttribute('data-closing', ''); card.removeAttribute('data-open'); setTimeout(() => { S.edit = null; S.draft = null; paint(); }, 230); };
  const openEdit = (key) => { if (S.edit === key) return closeEdit(); const i = find(key); S.edit = key; S.anim = key; S.draft = { enabled: rowOf(i).enabled, rules: JSON.parse(JSON.stringify(rules(i))) }; paint(); loadDiscord(); const el = root.querySelector(`.cu-card[data-key="${CSS.escape(key)}"]`); el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
  const save = (i) => act(async () => { const res = await call('/api/controlcenter/save', { key: i.key, enabled: S.draft.enabled, rules: S.draft.rules }); const row = res.row, def = row.enabled && JSON.stringify(row.rules) === JSON.stringify(rules({ row: null })); i.row = def ? null : { enabled: row.enabled, rules: row.rules, updated_at: Date.now() }; S.edit = null; S.draft = null; toast('Saved: applies now'); await load(); });
  const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  root.addEventListener('click', (ev) => {
    const t = ev.target.closest('button'); if (!t) return; const k = t.dataset;
    if (k.panel) { S.panel = k.panel; S.enter = true; S.edit = null; S.draft = null; history.replaceState(null, '', `#${k.panel}`); paint(); if (k.panel === 'org' && OP && !OP.O.cfg) OP.load(); if (k.panel === 'settings' && CS && !CS.S.data) CS.load(); if (k.panel === 'audit' && AU && AU.S.items === null) AU.load(); return; }
    if (k.edit) return openEdit(k.edit);
    if (k.statebtn !== undefined) { S.state = k.statebtn; return paint(); }
    if ('sync' in k) return act(async () => { t.disabled = true; try { const r = await call('/api/bot/commands/sync', {}); toast(`Synced ${r.count} command${r.count === 1 ? '' : 's'} to Discord`); } finally { t.disabled = false; } });
    if ('close' in k) return closeEdit();
    if (k.lvl) { const [flag, level] = k.lvl.split(':'); if (level === 'public' && !confirm(`Show “${nice(flag)}” to everyone, signed in or not, from the next page load?`)) return; return act(async () => { const prev = S.data.flags.live[flag]; const r = await call('/api/admin/flags', { name: flag, level }); S.data.flags.live = r.flags; if (prev !== level) S.undo.push({ name: flag, level: prev }); paint(); toast(`${nice(flag)}: ${LV_SHORT[level] || level}`); }); }
    if ('undo' in k) return act(async () => { const u = S.undo.pop(); if (!u) return; const r = await call('/api/admin/flags', { name: u.name, level: u.level }); S.data.flags.live = r.flags; paint(); toast(`${u.name}: back to ${u.level}`); });
    if (k.show) return showMe(k.show);
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
    if (k.flagsw) { // the section switch: off = nobody, on = back to the committed level (or Owner when that is off too); the card stays put so the switch can finish moving
      const flag = k.flagsw, i = S.data.items.find((x) => x.flag === flag), on = t.checked, base = S.data.flags.committed[flag], level = on ? (base && base !== 'off' ? base : 'owner') : 'off', prev = S.data.flags.live[flag] ?? i.level;
      const card = t.closest('.cu-card'); card?.classList.toggle('is-on', on); card?.classList.toggle('is-off', !on);
      return act(async () => { try { const r = await call('/api/admin/flags', { name: flag, level }); S.data.flags.live = r.flags; } catch (er) { t.checked = !on; card?.classList.toggle('is-on', !on); card?.classList.toggle('is-off', on); throw er; } if (prev !== level) S.undo.push({ name: flag, level: prev }); toast(`${nice(flag)}: ${on ? LV_SHORT[level] || level : 'off'}`); setTimeout(paint, 320); });
    }
    if (k.sw) { const i = find(k.sw), on = t.checked, card = t.closest('.cu-card'); card?.classList.toggle('is-on', on); card?.classList.toggle('is-off', !on); if (S.draft && S.edit === i.key) S.draft.enabled = on;
      return act(async () => { try { await call('/api/controlcenter/save', { key: i.key, enabled: on, rules: rules(i) }); } catch (er) { t.checked = !on; card?.classList.toggle('is-on', !on); card?.classList.toggle('is-off', on); throw er; } i.row = { ...(i.row || {}), enabled: on, rules: rules(i), updated_at: Date.now() }; toast(`${i.name}: ${on ? 'on' : 'off'}`); setTimeout(paint, 320); window.dispatchEvent(new CustomEvent('pfcc:data')); }); }
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
  root.addEventListener('toggle', (ev) => { const f = ev.target.dataset?.det; if (f) { S.groupsTouched = true; ev.target.open ? S.open.add(f) : S.open.delete(f); } }, true);
  root.addEventListener('submit', (ev) => { const f = ev.target.closest('[data-form]'); if (!f) return; ev.preventDefault(); const i = find(f.dataset.form); if (i && S.draft) save(i); });

  // the shell drives the panel: PFCC.go('audit') or a #hash change; PFCC.data() hands the loaded registry and audit to the dashboard (one data layer)
  const go = (k) => { if (!PANELS.some(([p]) => p === k)) return false; S.panel = k; S.enter = true; S.edit = null; S.draft = null; paint(); if (k === 'org' && OP && S.data) OP.load(); if (k === 'settings' && CS && !CS.S.data) CS.load(); if (k === 'audit' && AU && AU.S.items === null) AU.load(); return true; };
  window.PFCC = { go, data: () => S.data, reload: () => load(), ready: null };
  window.addEventListener('hashchange', () => { if (!shell) go(location.hash.slice(1)); });
  (async () => {
    await A.ready?.catch?.(() => {});
    if ((A.ccRole || A.role) !== 'owner' && (A.ccRole || A.role) !== 'manager') return;
    d.getElementById('ccLocal')?.setAttribute('hidden', ''); if (!shell) root.hidden = false; paint(); load();
  })();
})();
