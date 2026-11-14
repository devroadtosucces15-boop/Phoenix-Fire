// Organization panel (Phase 0): EA club instances + Discord servers / channels / roles. One implementation, shared: it was the Boardroom's Organization tab and is now
// the Control Center's Organization panel (staff-controlcenter.html). It talks to GET /api/org/config, GET /api/org/diagnostics and
// POST /api/org/config/<divisions|clubs|servers|channels|roles>[/<id>/delete]; the /setup channel and /setup role commands write the same rows.
// Usage: const OP = window.PFOrgPanel({ root, call, toast, esc, ago, empty, skel, act, repaint, active }); OP.load(); OP.html()
window.PFOrgPanel = ({ root, call, toast, esc, ago, empty, skel, act, repaint, active }) => {
  //   GET /api/org/config, GET /api/org/diagnostics, POST /api/org/config/<divisions|clubs|servers|channels|roles>[/<id>/delete]
  const ENT = { clubs: '🏟️ EA clubs', divisions: '🧩 Divisions', servers: '💬 Discord servers', channels: '📢 Channels', roles: '🏷️ Roles' };
  const O = { cfg: null, diag: null, sub: 'clubs', form: null, err: null };
  async function loadOrg() {
    try { const [cfg, diag] = await Promise.all([call('/api/org/config'), call('/api/org/diagnostics')]); O.cfg = cfg; O.diag = diag; O.err = null; }
    catch (er) { O.err = er.message; }
    if (active()) repaint();
  }
  const orgName = (list, id, f = 'name') => esc(list.find((x) => x.id === id)?.[f] ?? '—');
  const scopeLabel = (c, r) => r.scope_type === 'org' ? 'Whole organization' : r.scope_type === 'division' ? `Division: ${orgName(c.divisions, r.scope_id)}` : `Club: ${orgName(c.clubs, r.scope_id, 'display_name')}`;
  const opts = (list, val, label) => list.map((x) => `<option value="${esc(x.id ?? x)}"${String(x.id ?? x) === String(val ?? '') ? ' selected' : ''}>${esc(label ? label(x) : x)}</option>`).join('');
  const field = (label, html) => `<label class="small" style="display:grid;gap:4px"><span class="muted">${label}</span>${html}</label>`;
  const inp = (name, v, ph = '', extra = '') => `<input name="${name}" value="${esc(v ?? '')}" placeholder="${esc(ph)}" ${extra}>`;
  function orgForm(c) {
    const f = O.form; if (!f) return `<p><button class="chip" data-orgnew="${O.sub}">+ Add ${O.sub === 'clubs' ? 'an EA club' : O.sub.replace(/s$/, '')}</button></p>`;
    const v = f.v || {}; let body = '';
    if (f.ent === 'clubs') body = field('EA club ID', inp('ea_club_id', v.ea_club_id, 'e.g. 1111', 'inputmode="numeric" required')) + field('Display name', inp('display_name', v.display_name, 'Phoenix Fire', 'required')) + field('Division', `<select name="division_id"><option value="">None</option>${opts(c.divisions, v.division_id, (x) => x.name)}</select>`) + field('Sort order', inp('sort', v.sort ?? 0, '', 'type="number"')) + field('Note', inp('description', v.description)) + `<label class="small"><input type="checkbox" name="sync_members" ${v.sync_members === 0 ? '' : 'checked'}> Sync members</label><label class="small"><input type="checkbox" name="sync_matches" ${v.sync_matches === 0 ? '' : 'checked'}> Sync matches</label>`;
    else if (f.ent === 'divisions') body = field('Name', inp('name', v.name, 'League', 'required')) + field('Note', inp('description', v.description));
    else if (f.ent === 'servers') body = field('Discord server ID', inp('guild_id', v.guild_id, '17–20 digits', 'inputmode="numeric" required')) + field('Name', inp('display_name', v.display_name, '', 'required')) + field('Purpose', inp('purpose', v.purpose));
    else {
      const ch = f.ent === 'channels', sc = v.scope_type || 'org';
      body = field('Server', `<select name="server_id" required>${opts(c.servers, v.server_id, (x) => x.display_name)}</select>`) + field(ch ? 'Channel ID' : 'Role ID', inp(ch ? 'channel_id' : 'role_id', ch ? v.channel_id : v.role_id, '17–20 digits', 'inputmode="numeric" required')) + field('Label', inp('label', v.label, ch ? 'Channel label' : 'Role label')) +
        (ch ? field('Purpose', `<select name="purpose">${opts(c.purposes, v.purpose)}</select>`) : field('Permission group', `<select name="permission_group">${opts(c.groups, v.permission_group)}</select>`)) +
        field('Applies to', `<select name="scope_type" data-orgscope>${opts(c.scopes, sc, (x) => ({ org: 'Whole organization', division: 'One division', club: 'One EA club' })[x])}</select>`) +
        (sc === 'org' ? '' : field(sc === 'division' ? 'Division' : 'EA club', `<select name="scope_id">${sc === 'division' ? opts(c.divisions, v.scope_id, (x) => x.name) : opts(c.clubs, v.scope_id, (x) => x.display_name)}</select>`));
    }
    return `<form data-form="org" class="panel" style="display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));margin:22px 0"><h3 style="grid-column:1/-1;margin:0">${f.id ? 'Edit' : 'Add'} ${esc(ENT[f.ent])}</h3>${body}<div style="grid-column:1/-1;display:flex;gap:10px"><button class="chip on" type="submit">Save</button><button class="chip" type="button" data-orgcancel>Cancel</button></div></form>`;
  }
  const row = (cells, ent, r, extra = '') => `<tr class="${r.active === 0 ? 'muted' : ''}">${cells.map((x) => `<td>${x}</td>`).join('')}<td style="white-space:nowrap"><button class="chip" data-orgedit="${ent}:${r.id}">Edit</button> <button class="chip" data-orgtoggle="${ent}:${r.id}">${r.active === 0 ? 'Turn on' : 'Turn off'}</button> <button class="chip" data-orgdel="${ent}:${r.id}">${ent === 'clubs' ? 'Archive' : 'Remove'}</button>${extra}</td></tr>`;
  function org() {
    const o = O; if (o.err) return empty('🔒', 'Organization settings', o.err);
    const c = o.cfg; if (!c) return skel;
    const issues = (o.diag?.issues || []).map((i) => `<li>${i.level === 'error' ? '⛔' : '⚠️'} ${esc(i.msg)}</li>`).join('');
    const tbl = (head, rows) => rows ? `<div class="tablewrap" style="margin:22px 0"><table class="tbl"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}<th></th></tr></thead><tbody>${rows}</tbody></table></div>` : empty('📭', 'Nothing here yet', 'Nothing is configured, so nothing will be sent or synced for this.');
    let list = '';
    if (o.sub === 'clubs') list = tbl(['EA ID', 'Name', 'Division', 'Sync'], c.clubs.map((r) => row([esc(r.ea_club_id), esc(r.display_name), orgName(c.divisions, r.division_id), `${r.sync_members ? 'members ' : ''}${r.sync_matches ? 'matches' : ''}`], 'clubs', r)).join(''));
    if (o.sub === 'divisions') list = tbl(['Name', 'Note'], c.divisions.map((r) => row([esc(r.name), esc(r.description)], 'divisions', r)).join(''));
    if (o.sub === 'servers') list = tbl(['Server ID', 'Name', 'Purpose'], c.servers.map((r) => row([esc(r.guild_id), esc(r.display_name), esc(r.purpose)], 'servers', r)).join(''));
    if (o.sub === 'channels') list = tbl(['Purpose', 'Channel', 'Server', 'Applies to'], c.channels.map((r) => row([esc(r.purpose), `${esc(r.label)} <small class="muted">${esc(r.channel_id)}</small>`, orgName(c.servers, r.server_id, 'display_name'), scopeLabel(c, r)], 'channels', r)).join(''));
    if (o.sub === 'roles') list = tbl(['Group', 'Role', 'Server', 'Applies to'], c.roles.map((r) => row([esc(r.permission_group), `${esc(r.label)} <small class="muted">${esc(r.role_id)}</small>`, orgName(c.servers, r.server_id, 'display_name'), scopeLabel(c, r)], 'roles', r)).join(''));
    // Only when a destination is actually missing (the server flags those issues with `missing` = the purpose): point at the Channels list.
    const missing = (o.diag?.issues || []).filter((i) => i.missing).map((i) => i.missing);
    const hint = missing.length ? `<p class="small" style="margin:8px 0 0">📢 ${missing.length === 1 ? 'One message type has' : `${missing.length} message types have`} nowhere to go yet (${missing.map((m) => esc(m.replace(/_/g, ' '))).join(', ')}). <button class="chip" data-orgsub="channels">Add a channel →</button></p>` : '';
    return `<div class="panel" style="margin-bottom:22px"><b>${esc(c.org?.name || 'Organization')}</b> · ${o.diag?.activeClubs ?? 0} active EA club${o.diag?.activeClubs === 1 ? '' : 's'} · ${o.diag?.activeServers ?? 0} Discord server${o.diag?.activeServers === 1 ? '' : 's'}<p class="muted small">All active clubs and every match mode are combined by default. Changes apply as soon as you save; no rebuild needed.</p>${issues ? `<ul class="small" style="margin:8px 0 0;padding-left:18px">${issues}</ul>` : '<p class="small">✅ Nothing missing.</p>'}${hint}</div>
      <div class="chips">${Object.entries(ENT).map(([k, n]) => `<button class="chip${o.sub === k ? ' on' : ''}" data-orgsub="${k}">${n}</button>`).join('')}</div>${list}${orgForm(c)}
      <details class="panel" style="margin-top:22px"><summary><b>Change history</b></summary>${(c.audit || []).slice(0, 25).map((a) => `<p class="small" style="margin:8px 0"><b>${esc(a.name || a.user_id)}</b> ${esc(a.action)} ${esc(a.entity)} #${a.entity_id ?? ''} <span class="muted">· ${ago(a.at)}</span></p>`).join('') || '<p class="muted small">No changes yet.</p>'}</details>`;
  }
  const readOrg = (form) => { const fd = new FormData(form), b = {}; for (const [k, v] of fd.entries()) b[k] = v; for (const cb of form.querySelectorAll('input[type=checkbox]')) b[cb.name] = cb.checked; return b; };
  root.addEventListener('click', (ev) => {
    const t = ev.target.closest('button'); if (!t || !active()) return; const k = t.dataset, c = O.cfg;
    const find = (key) => { const [e, id] = key.split(':'); return [e, c[e].find((x) => String(x.id) === id)]; };
    if (k.orgsub) { O.sub = k.orgsub; O.form = null; repaint(); }
    else if (k.orgnew) { O.form = { ent: k.orgnew, v: {} }; repaint(); }
    else if ('orgcancel' in k) { O.form = null; repaint(); }
    else if (k.orgedit) { const [e, r] = find(k.orgedit); O.form = { ent: e, id: r.id, v: { ...r } }; repaint(); }
    else if (k.orgtoggle) act(async () => { const [e, r] = find(k.orgtoggle); await call(`/api/org/config/${e}`, { ...r, active: r.active === 0 }); await loadOrg(); toast(r.active === 0 ? 'Turned on' : 'Turned off'); });
    else if (k.orgdel) act(async () => { const [e, r] = find(k.orgdel); if (!confirm(e === 'clubs' ? `Archive ${r.display_name}? It stops syncing and leaves the lists; its saved matches and members stay.` : 'Remove this? Anything that used it will stop being sent there.')) return; await call(`/api/org/config/${e}/${r.id}/delete`, {}); await loadOrg(); toast('Done'); });
  });
  root.addEventListener('change', (ev) => { if (ev.target.matches('[data-orgscope]') && O.form) { O.form.v = { ...readOrg(ev.target.closest('form')), scope_id: '' }; repaint(); } });
  root.addEventListener('submit', (ev) => {
    const f = ev.target.closest('[data-form="org"]'); if (!f) return; ev.preventDefault();
    act(async () => { const form = O.form; await call(`/api/org/config/${form.ent}`, { ...readOrg(f), id: form.id }); O.form = null; await loadOrg(); toast('Saved'); });
  });

  return { O, load: loadOrg, html: org };
};
