// Control Center › Bot settings and Audit log (PF-022 step 8). Two panels in one file, both mounted by controlcenter.js the same way the Organization panel is:
//   window.PFCCSettings({ root, call, toast, esc, ago, empty, skel, act, repaint, active }) -> { html, load }
//   window.PFCCAudit({ ... same ... })                                                      -> { html, load }
// Bot settings reads GET /api/controlcenter/settings and writes POST /api/controlcenter/settings/<area> (the owner/manager split is the server's: bot is owner only).
// It replaces the Tools page's Bot tab (personalisation, notification routing) and carries every setting that had no site page before (Rush queue, welcome and leave,
// ping roles, profanity alerts, stream sources, recruitment, match alert, stream links). The command rules are the Bot commands panel (same registry rows).
// Audit reads GET /api/controlcenter/audit (config changes, activity and role history in one newest-first feed) and replaces the Boardroom Audit tab.
// Channels and roles come from the Organization config and the Discord server list, never from this file.
(() => {
  const ACT = { 'flag-change': '🎛️', announce: '📣', 'hof-induct': '🏛️', 'hof-moment': '🏛️', 'hof-remove': '🗑️', 'doc-discord': '💬', claim: '🪪', approve: '✅' };
  const AP = [['results', '⚽ Match results'], ['reminders', '⏰ Event reminders'], ['awards', '🏆 Weekly awards']];
  const RUSH = [['failedPolicy', 'A failed match puts the crew', 'select', [['next', 'Next in the queue'], ['bottom', 'At the bottom']]], ['greenWarnMin', 'Warn a crew that is not ready after (min)', 'number'], ['greenRemoveMin', 'Remove it after (min)', 'number'],
    ['searchAskMin', 'Ask if a search is still on after (min)', 'number'], ['searchMaxMin', 'End a search after (min)', 'number'], ['waitDropMin', 'Drop a waiting crew after (min)', 'number'], ['pauseMin', 'Pause length (min)', 'number'],
    ['idleCloseMin', 'Close an idle queue after (min, 0 = never)', 'number'], ['joinsPerHour', 'Joins per hour, per person', 'number'], ['needMin', 'A "need a player" post lasts (min)', 'number']];
  const STREAM_WHAT = [['both', 'Live and posts'], ['live', 'Live only'], ['posts', 'Posts only (YouTube)']];

  window.PFCCSettings = ({ root, call, toast, esc, ago, empty, skel, act, repaint, active }) => {
    const S = { data: null, dc: null, err: null, rdraft: null, busy: false, fold: null };
    const sel = (list, cur) => list.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(l)}</option>`).join('');
    const chs = () => S.dc?.channels || [], roles = () => S.dc?.roles || [];
    // a channel picker from the server's channel list; an id the list does not know stays selectable (nothing is dropped silently)
    const chSel = (name, cur, blank, attrs = '') => `<select name="${name}" ${attrs} aria-label="${esc(blank)}"><option value="">${esc(blank)}</option>${chs().map((c) => `<option value="${esc(c.id)}"${c.id === cur ? ' selected' : ''}>#${esc(c.name)}</option>`).join('')}${cur && !chs().some((c) => c.id === cur) ? `<option value="${esc(cur)}" selected>ID ${esc(cur)}</option>` : ''}</select>`;
    const roleSel = (name, cur, blank) => `<select name="${name}" aria-label="${esc(blank)}"><option value="">${esc(blank)}</option>${roles().map((r) => `<option value="${esc(r.id)}"${r.id === cur ? ' selected' : ''}>${esc(r.name.startsWith('@') ? r.name : '@' + r.name)}</option>`).join('')}${cur && !roles().some((r) => r.id === cur) ? `<option value="${esc(cur)}" selected>ID ${esc(cur)}</option>` : ''}</select>`;
    const idHelp = '<p class="muted small">Channels and roles are picked from the Discord server. They are saved in the Organization config too, so the website, the bot commands and this page always agree.</p>';
    const head = (key, A, extra = '') => `<header class="cs-h"><div><h3>${esc(A.label)}</h3><p class="muted small">${esc(A.summary)}</p></div><span class="chip ${A.level === 'owner' ? 'gold' : ''}">${A.level === 'owner' ? 'Owner only' : 'Managers'}</span>${extra}</header>`;
    const lock = (A) => (A.canWrite ? '' : ' disabled');
    const save = (A) => `<div class="cc-actions"><button class="chip on" type="submit"${A.canWrite && !S.busy ? '' : ' disabled'}>Save</button>${A.canWrite ? '' : '<span class="muted small">Only the owner changes this; you can see it.</span>'}</div>`;
    const card = (key, A, body) => `<section class="cc-card cs-card" data-area="${esc(key)}" aria-label="${esc(A.label)}">${head(key, A)}${body}</section>`;

    const FORMS = {
      bot(A) { const s = A.value || {}; return `<form data-cs-form="bot" class="cc-form"><div class="cc-cols"><div><label class="small">Result channel ${chSel('resultChannel', s.resultChannel || '', 'The webhook’s own channel', lock(A))}</label>
<label class="small">Default reminder channel ${chSel('reminderChannel', s.reminderChannel || '', 'None', lock(A))}</label><label class="small">Reminder ping role ${roleSel('pingRole', s.pingRole || '', 'No role')}</label></div>
<div><label class="small">Embed colour <input name="color" type="color" value="#${esc(s.color || 'e8651a')}"${lock(A)}></label><label class="small">Emoji <input name="emoji" value="${esc(s.emoji || '')}" maxlength="8" placeholder="🔥"${lock(A)}></label>
<fieldset class="cc-pick"><legend>Auto-posts on</legend>${AP.map(([k, l]) => `<label class="cc-lv"><input name="ap-${k}" type="checkbox"${s.autoPosts?.[k] ? ' checked' : ''}${lock(A)}> ${l}</label>`).join('')}</fieldset></div></div>${idHelp}${save(A)}</form>`; },
      rush(A) { const s = A.value || {}; return `<form data-cs-form="rush" class="cc-form"><div class="cc-cols">${RUSH.map(([k, l, type, opts]) => `<label class="small">${esc(l)} ${type === 'select' ? `<select name="${k}"${lock(A)}>${sel(opts, s[k])}</select>` : `<input name="${k}" type="number" min="0" value="${esc(s[k] ?? '')}"${lock(A)}>`}</label>`).join('')}</div>${save(A)}</form>`; },
      tools(A) { const s = A.value || {}, groups = s.pingGroups || []; return `<form data-cs-form="tools" class="cc-form"><div class="cc-cols"><div><label class="small">Welcome channel ${chSel('welcomeChannel', s.welcomeChannel || '', 'None')}</label>
<label class="small">Leave log channel ${chSel('leaveChannel', s.leaveChannel || '', 'None')}</label><label class="small">Welcome text <textarea name="welcomeText" rows="3" maxlength="1000"${lock(A)}>${esc(s.welcomeText || '')}</textarea></label></div>
<div><fieldset class="cc-pick"><legend>Opt-in ping roles</legend>${groups.map((g) => `<label class="small">${esc(g)} ${roleSel('ping-' + g, s.pingRoles?.[g] || '', 'No role')}</label>`).join('') || '<span class="muted small">No groups.</span>'}</fieldset></div></div>${idHelp}${save(A)}</form>`; },
      profanity(A) { const s = A.value || {}; return `<form data-cs-form="profanity" class="cc-form"><label class="small">Alert channel ${chSel('channelId', s.channelId || '', 'None')}</label><p class="muted small">${s.ruleId ? 'The AutoMod rule is set up.' : 'The AutoMod rule itself is created by /profanitysetup in Discord.'}</p>${save(A)}</form>`; },
      recruitment(A) { const s = A.value || {}; return `<form data-cs-form="recruitment" class="cc-form"><label class="cc-lv"><input name="open" type="checkbox"${s.open ? ' checked' : ''}${lock(A)}> Trials are open</label><label class="small">Headline <input name="headline" value="${esc(s.headline || '')}" maxlength="120"${lock(A)}></label>
<label class="small">Requirements (one per line) <textarea name="requirements" rows="4"${lock(A)}>${esc((s.requirements || []).join('\n'))}</textarea></label><label class="small">Positions wanted (comma separated, e.g. GK, ST) <input name="positions" value="${esc((s.positions || []).join(', '))}"${lock(A)}></label>${save(A)}</form>`; },
      matchAlert(A) { const s = A.value || {}; return `<form data-cs-form="matchAlert" class="cc-form"><label class="small">Heavy-defeat margin (goals, 0 = never) <input name="loseBy" type="number" min="0" max="20" value="${esc(s.loseBy ?? 3)}"${lock(A)}></label>${save(A)}</form>`; },
      streams(A) { const s = A.value || {}; return `<form data-cs-form="streams" class="cc-form"><label class="small">Twitch link <input name="twitch" type="url" value="${esc(s.twitch || '')}" placeholder="https://www.twitch.tv/yourchannel"${lock(A)}></label><label class="small">YouTube channel link <input name="youtube" type="url" value="${esc(s.youtube || '')}" placeholder="https://www.youtube.com/@handle"${lock(A)}></label>${save(A)}</form>`; },
      points(A) {
        const prizeRow = (p, A) => `<tr data-prize><td><input type="hidden" name="pid" value="${esc(p.id || '')}"><input name="pn" maxlength="40" value="${esc(p.name || '')}"${lock(A)}></td><td><input name="pc" type="number" min="1" max="100000" style="width:84px" value="${esc(p.cost ?? '')}"${lock(A)}></td><td><select name="ps"${lock(A)}>${['placeholder', 'approved', 'off'].map((x) => `<option value="${x}"${(p.status || 'approved') === x ? ' selected' : ''}>${x}</option>`).join('')}</select></td><td><input name="pt" maxlength="120" value="${esc(p.note || '')}"${lock(A)}></td><td>${A.canWrite ? '<button class="chip danger" type="button" data-cs-prizedel title="Delete this prize">✕</button>' : ''}</td></tr>`;
        S.prizeRow = prizeRow;
        const s = A.value || {}, r = s.rules || { amounts: {}, prices: [] }, L = s.labels || {};
        return `<form data-cs-form="points" class="cc-form"><p class="muted small">Season <b>${esc(s.season || '')}</b>. Points reset each season, are spendable credit and have no daily caps. 0 switches a rule off.</p><div class="cc-cols">${Object.keys(L).map((k) => `<label class="small">${esc(L[k].label)} <input name="amt-${esc(k)}" type="number" min="0" max="1000" value="${esc(r.amounts?.[k] ?? L[k].amount)}"${lock(A)}></label>`).join('')}</div>
<h4>Prizes</h4><p class="muted small">Virtual perks a manager hands over by hand. <b>Placeholder</b> = an example nobody can buy yet. <b>Approved</b> = on sale. <b>Off</b> = hidden. Change the status, price or wording, delete one, or add your own.</p>
<table class="cc-table"><thead><tr><th>Prize</th><th>Points</th><th>Status</th><th>What it is</th><th></th></tr></thead><tbody data-prizes>${(r.prices || []).map((p) => prizeRow(p, A)).join('')}</tbody></table>
${A.canWrite ? '<div class="cc-actions"><button class="chip" type="button" data-cs-prizeadd>+ Add a prize</button></div>' : ''}${save(A)}</form>
${A.canWrite ? `<form data-cs-form="points_spend" class="cc-form"><h4>Record a spend</h4><div class="cc-cols"><label class="small">Member ID <input name="user" required pattern="\\d{5,25}" inputmode="numeric"></label><label class="small">Points <input name="amount" type="number" min="1" required></label><label class="small">What for <input name="item" maxlength="60" required></label></div><div class="cc-actions"><button class="chip" type="submit">Spend</button><button class="chip danger" type="button" data-cs-season>Start a new season (owner)</button></div></form>
<form data-cs-form="points_gift" class="cc-form"><h4>Gift a prize (free)</h4><div class="cc-cols"><label class="small">Member ID <input name="user" required pattern="\\d{5,25}" inputmode="numeric"></label><label class="small">Prize <input name="item" maxlength="60" required></label><label class="small">Note <input name="note" maxlength="100"></label></div><div class="cc-actions"><button class="chip" type="submit">Gift it</button></div></form>
<form data-cs-form="points_refund" class="cc-form"><h4>Refund points (a checkout mistake)</h4><div class="cc-cols"><label class="small">Member ID <input name="user" required pattern="\\d{5,25}" inputmode="numeric"></label><label class="small">Points <input name="amount" type="number" min="1" required></label><label class="small">What for <input name="item" maxlength="60"></label></div><div class="cc-actions"><button class="chip" type="submit">Refund</button></div></form>` : ''}`;
      },
      stream_sources(A) {
        const list = Array.isArray(A.value) ? A.value : [];
        return `${list.length ? `<div class="tablewrap"><table class="tbl cc-tbl"><thead><tr><th>Channel</th><th>Platform</th><th>Announces</th><th>Posts in</th><th></th></tr></thead><tbody>${list.map((r) => `<tr><td><b>${esc(r.label || r.handle)}</b><div class="muted small">${esc(r.scope)}</div></td><td>${esc(r.platform)}</td><td class="small">${[r.want_live ? 'live' : '', r.want_posts ? 'posts' : ''].filter(Boolean).join(' + ')}</td><td class="small">${esc(chs().find((c) => c.id === r.channel_id)?.name ? '#' + chs().find((c) => c.id === r.channel_id).name : 'ID ' + r.channel_id)}</td><td class="r">${A.canWrite ? `<button type="button" class="chip danger" data-cs-rmsrc="${esc(r.id)}">Remove</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">No sources yet.</p>'}
${A.canWrite ? `<form data-cs-form="stream_sources" class="cc-form"><h4>Add a source</h4><div class="cc-cols"><label class="small">Channel link <input name="link" required placeholder="Twitch, YouTube (@handle) or Kick link"></label><label class="small">Name <input name="name" maxlength="40"></label>
<label class="small">Announces <select name="what">${sel(STREAM_WHAT, 'both')}</select></label><label class="small">Post in ${chSel('channel', '', 'The live alerts channel from the Organization config')}</label><label class="small">Whose <select name="source"><option value="main">The club</option><option value="contributor">A member</option></select></label></div><div class="cc-actions"><button class="chip on" type="submit"${S.busy ? ' disabled' : ''}>Add source</button></div></form>` : ''}`;
      },
    };
    const routing = (A) => {
      const R = A.value || { rules: [], actions: {}, groups: {}, methods: {} }, opts = (o) => Object.entries(o || {}).map(([k, v]) => [k, typeof v === 'string' ? v : `${v.icon} ${v.label}`]);
      const rows = (S.rdraft || []).map((r, i) => { const dm = r.method === 'dm';
        return `<tr data-rt="${i}"><td><input type="checkbox" data-rf="on" aria-label="Rule ${i + 1} on"${r.on === false ? '' : ' checked'}${lock(A)}></td><td><select data-rf="action" aria-label="When this happens"${lock(A)}>${sel(opts(R.actions), r.action)}</select></td>
<td><select data-rf="group" aria-label="Who"${lock(A)}>${sel(opts(R.groups), r.group)}</select>${r.group === 'role' ? `<select data-rf="role" aria-label="Discord role"><option value="">Pick a role…</option>${roles().map((x) => `<option value="${esc(x.id)}"${x.id === r.role ? ' selected' : ''}>${esc(x.name.startsWith('@') ? x.name : '@' + x.name)}</option>`).join('')}</select>` : ''}</td>
<td><select data-rf="method" aria-label="How"${lock(A)}>${sel(opts(R.methods).filter(([k]) => !(r.group === 'role' && k === 'dm')), r.method)}</select></td>
<td>${dm ? '<span class="muted small">Direct message</span>' : `<select data-rf="channel" aria-label="Channel"><option value="">Default channel</option>${chs().map((c) => `<option value="${esc(c.id)}"${c.id === r.channel ? ' selected' : ''}>#${esc(c.name)}</option>`).join('')}${r.channel && !chs().some((c) => c.id === r.channel) ? `<option value="${esc(r.channel)}" selected>ID ${esc(r.channel)}</option>` : ''}</select>`}</td>
<td>${A.canWrite ? `<button class="chip danger" type="button" data-cs-rtdel="${i}" aria-label="Remove rule ${i + 1}">✕</button>` : ''}</td></tr>`; }).join('');
      return card('routes', A, `<p class="muted small">One table for where alerts go: <b>what happens</b> → <b>who</b> is told → <b>how</b> (Discord DM, a channel post, tagging a group or @everyone) → <b>where</b>. An action with no rules keeps its built-in behaviour; once it has rules, only those rules run for it. Members’ own alert settings still apply to DMs.</p>
${rows ? `<div class="tablewrap"><table class="tbl cc-tbl"><thead><tr><th>On</th><th>When this happens</th><th>Tell</th><th>How</th><th>Where</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : empty('🔀', 'No rules yet', 'Everything uses its built-in behaviour. Add a rule to take control of one action.')}
<div class="cc-actions">${A.canWrite ? `<button class="chip" type="button" data-cs-rtadd>➕ Add rule</button><button class="chip on" type="button" data-cs-rtsave${S.busy ? ' disabled' : ''}>Save routing</button>` : '<span class="muted small">Managers and the owner change this.</span>'}</div>`);
    };
    function html() {
      if (S.err) return empty('⚠️', 'Could not load the bot settings', S.err);
      if (!S.data) return skel;
      const A = S.data.areas, order = ['bot', 'routes', 'rush', 'tools', 'profanity', 'stream_sources', 'recruitment', 'matchAlert', 'streams', 'points'];
      const fold = S.fold ? `<pre class="muted small cs-fold">${esc(JSON.stringify(S.fold, null, 1))}</pre>` : '';
      return `<p class="muted small">Every bot setting in one place. The owner keeps the bot’s look and the Organization; managers run the rest. Every save is recorded in the Audit log. Command rules are in <b>Bot commands</b>.</p>
<div class="cs-grid">${order.filter((k) => A[k]).map((k) => (k === 'routes' ? routing(A[k]) : card(k, A[k], FORMS[k](A[k])))).join('')}</div>
<section class="cc-card cs-card" aria-label="Old settings"><header class="cs-h"><div><h3>Bring the old settings across</h3><p class="muted small">Copies the old channel and ping-role settings (the legacy result, reminder, hype and voice-recap homes) into the Organization config so nothing reads two places. Safe to run again.</p></div></header>
<div class="cc-actions"><button type="button" class="chip" data-cs-fold${S.busy ? ' disabled' : ''}>Fold in the old settings</button></div>${fold}</section>`;
    }
    async function load() {
      try {
        const [data, dc] = await Promise.all([call('/api/controlcenter/settings'), call('/api/controlcenter/discord').catch((er) => ({ ready: false, error: er.message }))]);
        S.data = data; S.dc = dc; S.err = null; S.rdraft = (data.areas.routes?.value?.rules || []).map((r) => ({ ...r }));
      } catch (er) { S.err = er.message; }
      if (active()) repaint();
    }
    const post = async (area, body, msg) => { S.busy = true; repaint(); try { const r = await call(`/api/controlcenter/settings/${area}`, body); S.data.areas[area].value = r.value; if (area === 'routes') S.rdraft = (r.value.rules || []).map((x) => ({ ...x })); toast(r.unchanged ? 'Nothing changed' : msg || 'Saved: applies now'); } finally { S.busy = false; repaint(); } };
    const readRoutes = () => root.querySelectorAll('tr[data-rt]').forEach((tr) => {
      const g = (f) => tr.querySelector(`[data-rf="${f}"]`), r = S.rdraft[+tr.dataset.rt]; if (!r) return;
      r.on = g('on').checked; r.action = g('action').value; r.group = g('group').value; r.method = g('method').value; r.role = g('role')?.value ?? '';
      if (r.group === 'role' && r.method === 'dm') r.method = 'tag';
      r.channel = g('channel') ? g('channel').value : '';
    });
    const body = {
      bot: (f) => ({ resultChannel: f.get('resultChannel') || '', reminderChannel: f.get('reminderChannel') || '', pingRole: f.get('pingRole') || '', color: String(f.get('color') || '').replace('#', ''), emoji: f.get('emoji') || '', autoPosts: Object.fromEntries(AP.map(([k]) => [k, f.has('ap-' + k)])) }),
      rush: (f) => Object.fromEntries(RUSH.map(([k, , t]) => [k, t === 'number' ? Number(f.get(k)) : f.get(k)])),
      tools: (f) => ({ welcomeChannel: f.get('welcomeChannel') || '', leaveChannel: f.get('leaveChannel') || '', welcomeText: f.get('welcomeText') || '', pingRoles: Object.fromEntries((S.data.areas.tools.value.pingGroups || []).map((g) => [g, f.get('ping-' + g) || ''])) }),
      profanity: (f) => ({ channelId: f.get('channelId') || '' }),
      recruitment: (f) => ({ open: f.has('open'), headline: f.get('headline') || '', requirements: String(f.get('requirements') || '').split('\n').map((x) => x.trim()).filter(Boolean), positions: String(f.get('positions') || '').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean) }),
      matchAlert: (f) => ({ loseBy: f.get('loseBy') }),
      points: (f) => ({ amounts: Object.fromEntries(Object.keys(S.data.areas.points.value.labels || {}).map((k) => [k, f.get('amt-' + k)])), prices: f.getAll('pn').map((n, i) => ({ id: f.getAll('pid')[i] || '', name: n, cost: f.getAll('pc')[i], status: f.getAll('ps')[i], note: f.getAll('pt')[i] })).filter((x) => String(x.name).trim()) }),
      points_spend: (f) => ({ user: f.get('user'), amount: f.get('amount'), item: f.get('item') }),
      points_gift: (f) => ({ user: f.get('user'), item: f.get('item'), note: f.get('note') || '' }),
      points_refund: (f) => ({ user: f.get('user'), amount: f.get('amount'), item: f.get('item') || '' }),
      streams: (f) => ({ twitch: f.get('twitch') || '', youtube: f.get('youtube') || '' }),
      stream_sources: (f) => ({ link: f.get('link'), name: f.get('name') || '', what: f.get('what'), channel: f.get('channel') || '', source: f.get('source') }),
    };
    root.addEventListener('submit', (ev) => {
      const f = ev.target.closest('[data-cs-form]'); if (!f || !active()) return; ev.preventDefault();
      const area = f.dataset.csForm; act(() => (/^points_(spend|gift|refund)$/.test(area) ? call('/api/points/admin/' + area.slice(7), body[area](new FormData(f))).then(() => { toast({ points_spend: 'Spend recorded', points_gift: 'Gift recorded', points_refund: 'Refund recorded' }[area]); return load(); }) : post(area, body[area](new FormData(f)), area === 'stream_sources' ? 'Source added' : undefined)));
    });
    root.addEventListener('click', (ev) => {
      if (!active()) return; const t = ev.target.closest('button'); if (!t) return;
      if (t.hasAttribute('data-cs-rtadd')) { readRoutes(); S.rdraft.push({ action: Object.keys(S.data.areas.routes.value.actions)[0], group: 'everyone', method: 'channel', channel: '', on: true }); repaint(); }
      else if (t.dataset.csRtdel !== undefined) { readRoutes(); S.rdraft.splice(+t.dataset.csRtdel, 1); repaint(); }
      else if (t.hasAttribute('data-cs-rtsave')) act(async () => { readRoutes(); await post('routes', { rules: S.rdraft }, 'Routing saved'); });
      else if (t.dataset.csRmsrc !== undefined) act(async () => { if (!confirm('Stop announcing this channel? You can add it again later.')) return; await post('stream_sources', { action: 'remove', id: Number(t.dataset.csRmsrc) }, 'Source removed'); });
      else if (t.hasAttribute('data-cs-prizeadd')) { root.querySelector('[data-prizes]')?.insertAdjacentHTML('beforeend', S.prizeRow({ name: '', cost: '', status: 'placeholder', note: '' }, { canWrite: true })); }
      else if (t.hasAttribute('data-cs-prizedel')) { t.closest('tr')?.remove(); }
      else if (t.hasAttribute('data-cs-season')) act(async () => { const label = prompt('Name of the new season (blank = the next number). Every member starts at 0; this season is archived.'); if (label === null) return; if (prompt('Type RESET to confirm') !== 'RESET') return; await call('/api/points/admin/reset-season', { label, confirm: 'RESET' }); toast('New season started'); await load(); });
      else if (t.hasAttribute('data-cs-fold')) act(async () => { S.busy = true; repaint(); try { S.fold = await call('/api/controlcenter/settings/fold-legacy', {}); toast('Old settings folded in'); await load(); } finally { S.busy = false; repaint(); } });
    });
    root.addEventListener('change', (ev) => { if (active() && ev.target.closest('tr[data-rt]')) { readRoutes(); if (['group', 'method'].includes(ev.target.dataset.rf)) repaint(); } });
    return { S, html, load };
  };

  // ---------- Audit: one feed ----------
  window.PFCCAudit = ({ root, call, toast, esc, ago, empty, skel, act, repaint, active }) => {
    const S = { src: 'all', q: '', items: null, next: null, err: null, busy: false };
    const SRC = [['all', 'Everything'], ['config', '🎛️ Settings'], ['activity', '📋 Activity'], ['roles', '👤 Roles']];
    const change = (a) => { const b = a.before, n = a.after; if (a.source !== 'config') return a.detail ? esc(a.detail) : ''; const k = n?.key || b?.key || ''; return `${k ? `<b>${esc(k)}</b> ` : ''}${b && n && b.enabled !== n.enabled ? (n.enabled ? 'switched on' : 'switched off') : k ? '' : esc(JSON.stringify(n ?? '').slice(0, 90))}`; };
    function html() {
      if (S.err) return empty('⚠️', 'Could not load the audit log', S.err);
      const rows = (S.items || []).map((a) => `<tr><td class="small" title="${esc(new Date(a.at).toLocaleString())}">${esc(ago(a.at))}</td><td>${esc(a.who || '·')}</td><td class="small">${esc(ACT[a.entity] || '•')} ${esc(a.what)}</td><td class="small">${change(a)}</td></tr>`).join('');
      return `<form class="cc-filters" data-au-form><input type="search" name="q" value="${esc(S.q)}" placeholder="Search who, what or detail…" aria-label="Search the audit log"><button class="chip" type="submit">Search</button>
<span class="cc-chips" role="group" aria-label="Source">${SRC.map(([k, l]) => `<button type="button" class="chip${S.src === k ? ' on' : ''}" data-au-src="${k}" aria-pressed="${S.src === k}">${l}</button>`).join('')}</span><span class="muted small">${S.items ? S.items.length + ' shown' : ''}</span></form>
${S.items === null ? skel : `<div class="tablewrap"><table class="tbl cc-tbl"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Detail</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="muted">Nothing logged yet.</td></tr>'}</tbody></table></div>`}
${S.next ? `<div class="cc-actions"><button type="button" class="chip" data-au-more${S.busy ? ' disabled' : ''}>Show more</button></div>` : ''}`;
    }
    async function load(more) {
      S.busy = true; if (!more) { S.items = null; S.next = null; } if (active()) repaint();
      try { const r = await call(`/api/controlcenter/audit?limit=60&source=${S.src}&q=${encodeURIComponent(S.q)}${more && S.next ? '&before=' + S.next : ''}`); S.items = more ? [...(S.items || []), ...r.items] : r.items; S.next = r.next; S.err = null; }
      catch (er) { S.err = er.message; }
      S.busy = false; if (active()) repaint();
    }
    root.addEventListener('click', (ev) => {
      if (!active()) return; const t = ev.target.closest('button'); if (!t) return;
      if (t.dataset.auSrc) { S.src = t.dataset.auSrc; load(); } else if (t.hasAttribute('data-au-more')) load(true);
    });
    root.addEventListener('submit', (ev) => { const f = ev.target.closest('[data-au-form]'); if (!f || !active()) return; ev.preventDefault(); S.q = new FormData(f).get('q') || ''; load(); });
    return { S, html, load };
  };
})();
