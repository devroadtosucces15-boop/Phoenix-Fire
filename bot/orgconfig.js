// Organization Configuration (Phase 0): one organization, many EA club instances, flexible Discord mappings.
// Stored in D1 (migration 0054). The website jobs, the bot and the notification router read it through the helpers at the
// bottom (activeClubs, resolveChannel, rolesFor) instead of hardcoding IDs.
//   GET  /api/org/config                     owner (settings.org): everything + recent audit log
//   POST /api/org/config/<entity>            owner: create (no id) or update (id) – entity = divisions|clubs|servers|channels|roles
//   POST /api/org/config/<entity>/<id>/delete owner: remove a config row (clubs are archived, never deleted: history stays)
//   GET  /api/org/diagnostics                owner: what is missing or inconsistent
//   GET  /api/org/clubs/public               keyed (X-Phoenix-Key, same secret as /api/bot/settings/public): active club IDs for fetch jobs
import { sharedKey } from './sharedkey.js';
import { can } from './roles.js';
import { settingsKey } from './settings.js';
import { pictureNote } from './ui.js';

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
const fail = (msg, status = 400) => json({ error: msg }, status);
const all = (env, sql, ...args) => env.DB.prepare(sql).bind(...args).all().then((r) => r.results);
const one = (env, sql, ...args) => env.DB.prepare(sql).bind(...args).first();
const run = (env, sql, ...args) => env.DB.prepare(sql).bind(...args).run();

const SNOWFLAKE = /^\d{17,20}$/;
const EA_ID = /^\d{1,10}$/;
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const flag = (v, dflt) => (v === undefined ? dflt : v ? 1 : 0);

import { CHANNEL_PURPOSES, PERMISSION_GROUPS } from './orgconsts.js';
export { CHANNEL_PURPOSES, PERMISSION_GROUPS };
export const SCOPES = ['org', 'division', 'club'];
// A9: every place the bot posts to, reads from or restricts to a channel is a purpose here – never a name or an ID in code.
// Several channels per purpose are allowed. Purposes after `system_alerts` were added when the last hardcoded/legacy channel
// settings (meta keys, Worker vars) moved into this table; channelFor() still reads those legacy values when no row exists.
// What each purpose is for, in the words managers see (site Organization section and /setup channel).
export const CHANNEL_PURPOSE_INFO = {
  announcements: 'General club announcements and the default for posts that have no channel of their own',
  match_results: 'Match result posts', match_notifications: 'Match and event notifications', recruitment: 'Recruitment posts and applications',
  claims: 'Player claim requests', manager_alerts: 'Alerts for managers', logs: 'Bot activity log', welcome: 'Welcome posts for new members',
  config_audit: 'Who changed the Organization config', system_alerts: 'Bot health alerts',
  awards: 'Weekly awards and Highlight of the week', reminders: 'Event reminders (falls back to announcements)', member_log: 'Leave and join alerts',
  hype: 'Hype art posts', voice_recap: 'Voice chat recaps', live_alerts: 'Go-live alerts (falls back to announcements)',
  fun_posts: 'Birthdays and other fun posts (falls back to announcements)', automod_alerts: 'AutoMod alerts',
  rush_queue: 'The Rush queue board (the bot keeps one always-latest board here)', rush_queue_reports: 'Anonymous Rush queue reports for staff',
  rush_board: 'Rush leaderboard scan posts', season_stats: 'Season stats posts',
};
// A purpose with no row of its own may fall back to another purpose before giving up (the old behaviour of the posts that used
// the shared announce channel). Anything not listed has no fallback: if nothing is configured the feature says so.
const FALLBACK = { reminders: ['announcements'], live_alerts: ['announcements'], fun_posts: ['announcements'] };

// Each entity: table, the columns a client may write (cleaned by `clean`), and what the audit log records.
const ENTITIES = {
  divisions: {
    table: 'org_divisions',
    clean: async (b, env) => {
      const name = clean(b.name, 40);
      if (!name) return { error: 'Give the division a name.' };
      return { values: { name, description: clean(b.description, 200), active: flag(b.active, 1) } };
    },
  },
  clubs: {
    table: 'ea_clubs',
    clean: async (b, env, cur) => {
      const ea = String(b.ea_club_id ?? cur?.ea_club_id ?? '').trim();
      if (!EA_ID.test(ea)) return { error: 'EA club IDs are plain numbers (up to 10 digits).' };
      const name = clean(b.display_name, 60);
      if (!name) return { error: 'Give the club a display name.' };
      let division = b.division_id === '' || b.division_id == null ? null : Number(b.division_id);
      if (division !== null && !(await one(env, 'SELECT 1 FROM org_divisions WHERE id = ?', division))) return { error: 'That division does not exist.' };
      const dup = await one(env, 'SELECT id FROM ea_clubs WHERE ea_club_id = ? AND id != ?', ea, cur?.id ?? 0);
      if (dup) return { error: `EA club ${ea} is already registered.` };
      return {
        values: {
          ea_club_id: ea, display_name: name, division_id: division, description: clean(b.description, 200),
          active: flag(b.active, 1), sync_members: flag(b.sync_members, 1), sync_matches: flag(b.sync_matches, 1),
          sort: Number.isFinite(+b.sort) ? Math.trunc(+b.sort) : 0, updated_at: Date.now(),
        },
        create: { org_id: 1, created_at: Date.now() },
      };
    },
  },
  servers: {
    table: 'discord_servers',
    clean: async (b, env, cur) => {
      const guild = String(b.guild_id ?? '').trim();
      if (!SNOWFLAKE.test(guild)) return { error: 'Server IDs are 17–20 digit Discord IDs (Developer Mode → right-click server → Copy ID).' };
      const dup = await one(env, 'SELECT id FROM discord_servers WHERE guild_id = ? AND id != ?', guild, cur?.id ?? 0);
      if (dup) return { error: 'That server is already added.' };
      const name = clean(b.display_name, 60);
      if (!name) return { error: 'Give the server a name.' };
      return { values: { guild_id: guild, display_name: name, purpose: clean(b.purpose, 100), active: flag(b.active, 1) } };
    },
  },
  channels: {
    table: 'discord_channels',
    clean: async (b, env, cur) => {
      const m = await mapping(b, env, cur, 'channel_id', 'purpose');
      if (m.error) return m;
      if (!CHANNEL_PURPOSES.includes(b.purpose)) return { error: `Purpose must be one of: ${CHANNEL_PURPOSES.join(', ')}.` };
      m.values.purpose = b.purpose;
      return m;
    },
  },
  roles: {
    table: 'discord_roles',
    clean: async (b, env, cur) => {
      const m = await mapping(b, env, cur, 'role_id', 'permission_group');
      if (m.error) return m;
      if (!PERMISSION_GROUPS.includes(b.permission_group)) return { error: `Permission group must be one of: ${PERMISSION_GROUPS.join(', ')}.` };
      m.values.permission_group = b.permission_group;
      return m;
    },
  },
};

// Shared validation for channel / role rows: server, snowflake, scope.
async function mapping(b, env, cur, idField) {
  const id = String(b[idField] ?? '').trim();
  if (!SNOWFLAKE.test(id)) return { error: `${idField === 'role_id' ? 'Role' : 'Channel'} IDs are 17–20 digit Discord IDs (right-click → Copy ID).` };
  const server = Number(b.server_id);
  if (!(await one(env, 'SELECT 1 FROM discord_servers WHERE id = ?', server))) return { error: 'Pick one of the configured Discord servers.' };
  const scope = b.scope_type ?? 'org';
  if (!SCOPES.includes(scope)) return { error: 'Scope must be org, division or club.' };
  let scopeId = null;
  if (scope !== 'org') {
    scopeId = Number(b.scope_id);
    const table = scope === 'division' ? 'org_divisions' : 'ea_clubs';
    if (!(await one(env, `SELECT 1 FROM ${table} WHERE id = ?`, scopeId))) return { error: `That ${scope} does not exist.` };
  }
  return { values: { server_id: server, [idField]: id, label: clean(b.label, 60), scope_type: scope, scope_id: scopeId, active: flag(b.active, 1) } };
}

async function audit(env, me, entity, entityId, action, before, after) {
  await run(env, 'INSERT INTO config_audit (at, user_id, name, entity, entity_id, action, before, after) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    Date.now(), String(me.u), me.n ?? '', entity, entityId ?? null, action, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null);
}

export async function loadOrgConfig(env) {
  const [divisions, clubs, servers, channels, roles] = await Promise.all([
    all(env, 'SELECT * FROM org_divisions ORDER BY name'),
    all(env, 'SELECT * FROM ea_clubs WHERE archived = 0 ORDER BY sort, id'),
    all(env, 'SELECT * FROM discord_servers ORDER BY id'),
    all(env, 'SELECT * FROM discord_channels ORDER BY purpose, id'),
    all(env, 'SELECT * FROM discord_roles ORDER BY id'),
  ]);
  return { org: await one(env, 'SELECT * FROM orgs WHERE id = 1'), divisions, clubs, servers, channels, roles, purposes: CHANNEL_PURPOSES, groups: PERMISSION_GROUPS, scopes: SCOPES };
}

// What is missing or inconsistent – shown in Boardroom, never auto-fixed.
export async function diagnostics(env) {
  const cfg = await loadOrgConfig(env);
  const issues = [];
  const activeClubs = cfg.clubs.filter((c) => c.active);
  if (!activeClubs.length) issues.push({ level: 'error', msg: 'No active EA club instances: nothing will sync.' });
  for (const c of cfg.clubs) if (/confirm name/i.test(c.display_name)) issues.push({ level: 'warn', msg: `Club ${c.ea_club_id} still has a placeholder name.` });
  const activeServers = cfg.servers.filter((s) => s.active);
  if (!activeServers.length) issues.push({ level: 'error', msg: 'No active Discord server.' });
  const covered = new Set(cfg.channels.filter((c) => c.active && c.scope_type === 'org').map((c) => c.purpose));
  for (const p of ['match_results', 'announcements', 'claims', 'manager_alerts']) if (!covered.has(p)) issues.push({ level: 'warn', missing: p, msg: `No organization-wide channel for "${p}". Those messages will not be sent until one is set.` });
  if (!cfg.roles.some((r) => r.active && r.permission_group === 'owner')) issues.push({ level: 'warn', msg: 'No Discord role mapped to the owner group.' });
  const live = new Set(cfg.servers.filter((s) => s.active).map((s) => s.id));
  for (const c of cfg.channels) if (c.active && !live.has(c.server_id)) issues.push({ level: 'warn', msg: `Channel ${c.channel_id} (${c.purpose}) belongs to an inactive server.` });
  return { ok: !issues.some((i) => i.level === 'error'), issues, activeClubs: activeClubs.length, activeServers: activeServers.length };
}

// Keyed like /api/bot/settings/public: fetch jobs (GitHub Actions) have no D1 access, so they ask the Worker which clubs to sync.
export async function orgClubsPublicRoute(request, env) {
  if (!env.DISCORD_CLIENT_SECRET || sharedKey(request) !== await settingsKey(env.DISCORD_CLIENT_SECRET)) return fail('Forbidden', 403);
  return json({ clubs: await activeClubs(env) });
}

export async function orgConfigRoute(p, method, body, me, env) {
  if (!p.startsWith('/api/org/')) return null;
  if (!can(me, 'settings.org')) return fail('Owner only.', 403); // enforced here, not just by hiding the Boardroom tab
  if (p === '/api/org/config' && method === 'GET') return json({ ...(await loadOrgConfig(env)), audit: await all(env, 'SELECT * FROM config_audit ORDER BY id DESC LIMIT 50') });
  if (p === '/api/org/diagnostics' && method === 'GET') return json(await diagnostics(env));
  const m = /^\/api\/org\/config\/(\w+)(?:\/(\d+)\/delete)?$/.exec(p);
  if (!m || method !== 'POST') return fail('Not found', 404);
  const ent = ENTITIES[m[1]];
  if (!ent) return fail('Unknown config type.', 404);

  if (m[2]) { // delete
    const id = Number(m[2]);
    const cur = await one(env, `SELECT * FROM ${ent.table} WHERE id = ?`, id);
    if (!cur) return fail('Not found', 404);
    if (m[1] === 'clubs') {
      await run(env, 'UPDATE ea_clubs SET active = 0, archived = 1, updated_at = ? WHERE id = ?', Date.now(), id);
      await audit(env, me, 'clubs', id, 'archive', cur, null);
    } else {
      if (m[1] === 'servers' && await one(env, 'SELECT 1 FROM discord_channels WHERE server_id = ? UNION SELECT 1 FROM discord_roles WHERE server_id = ?', id, id)) return fail('Remove or move this server\'s channels and roles first.');
      if (m[1] === 'divisions' && await one(env, 'SELECT 1 FROM ea_clubs WHERE division_id = ? AND archived = 0', id)) return fail('Clubs are still assigned to this division.');
      await run(env, `DELETE FROM ${ent.table} WHERE id = ?`, id);
      await audit(env, me, m[1], id, 'delete', cur, null);
    }
    return json({ ok: true });
  }

  const res = await saveConfigRow(env, me, m[1], body ?? {});
  return res.error ? fail(res.error, res.status ?? 400) : json(res.row);
}

// The one write path for a config row: the website's POST /api/org/config/<entity> and the /setup channel / /setup role
// commands both go through here, so the same input always produces the same row (and the same audit entry).
export async function saveConfigRow(env, me, entity, body) {
  const ent = ENTITIES[entity];
  if (!ent) return { error: 'Unknown config type.', status: 404 };
  const id = body?.id ? Number(body.id) : null;
  const cur = id ? await one(env, `SELECT * FROM ${ent.table} WHERE id = ?`, id) : null;
  if (id && !cur) return { error: 'Not found', status: 404 };
  const res = await ent.clean(body ?? {}, env, cur);
  if (res.error) return { error: res.error };
  const row = { ...res.values };
  let savedId = id;
  if (cur) {
    const cols = Object.keys(row);
    await run(env, `UPDATE ${ent.table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, ...cols.map((c) => row[c]), id);
  } else {
    const full = { ...row, ...(res.create ?? {}) };
    const cols = Object.keys(full);
    const r = await run(env, `INSERT INTO ${ent.table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, ...cols.map((c) => full[c]));
    savedId = r.meta?.last_row_id ?? null;
  }
  const after = await one(env, `SELECT * FROM ${ent.table} WHERE id = ?`, savedId);
  await audit(env, me, entity, savedId, cur ? 'update' : 'create', cur, after);
  return { row: after, created: !cur };
}

// /setup channel purpose:<p> [channel] and /setup role group:<g> role:<r>: org-wide rows for the server the command ran in.
// Re-running with the same channel + purpose (or role + group) re-activates that row instead of adding a duplicate.
export async function setupMapping(env, me, kind, { guildId, targetId, purpose, group, label }) {
  const server = await one(env, 'SELECT id FROM discord_servers WHERE guild_id = ? AND active = 1', String(guildId ?? ''));
  if (!server) return { error: 'This server is not in the Organization config yet. Add it under Boardroom → Organization → Discord servers first.' };
  const channel = kind === 'channel';
  const table = channel ? 'discord_channels' : 'discord_roles', idCol = channel ? 'channel_id' : 'role_id', keyCol = channel ? 'purpose' : 'permission_group', key = channel ? purpose : group;
  const dup = await one(env, `SELECT id FROM ${table} WHERE server_id = ? AND ${idCol} = ? AND ${keyCol} = ? AND scope_type = 'org'`, server.id, String(targetId), key);
  return saveConfigRow(env, me, channel ? 'channels' : 'roles', { id: dup?.id, server_id: server.id, [idCol]: String(targetId), [keyCol]: key, scope_type: 'org', label: label ?? '', active: 1 });
}

// ---------- channels as the rest of the bot reads them ----------

// Pre-A9 homes of a channel setting, read only when the config has no row for the purpose (so nothing breaks while a server moves
// over). New code never writes these; it goes through saveConfigRow / the website.
const metaVal = async (env, key) => (await one(env, 'SELECT value FROM meta WHERE key = ?', key).catch(() => null))?.value || null;
const metaJson = async (env, key) => { try { return JSON.parse(await metaVal(env, key) || '{}'); } catch { return {}; } };
const envJson = (v) => { try { return JSON.parse(v || '{}'); } catch { return {}; } };
const LEGACY = {
  announcements: (env) => metaVal(env, 'announce_channel'),
  awards: (env) => metaVal(env, 'awards_channel'),
  reminders: async (env) => (await metaJson(env, 'bot_settings')).reminderChannel,
  match_results: async (env) => (await metaJson(env, 'bot_settings')).resultChannel,
  member_log: async (env) => (await metaJson(env, 'server_tools')).leaveChannel,
  welcome: async (env) => (await metaJson(env, 'server_tools')).welcomeChannel,
  automod_alerts: async (env) => (await metaJson(env, 'profanity_config')).channelId,
  hype: (env) => envJson(env.HYPE_CHANNEL).channel,
  voice_recap: (env) => envJson(env.VOICE_CHANNEL).channel,
};
// Every active channel configured for a purpose (several are allowed), most specific scope first. Falls back like channelFor.
export async function channelsFor(env, purpose, { clubId = null, divisionId = null } = {}) {
  for (const p of [purpose, ...(FALLBACK[purpose] ?? [])]) {
    const rows = await all(env,
      `SELECT c.channel_id, c.scope_type FROM discord_channels c JOIN discord_servers s ON s.id = c.server_id
       WHERE c.purpose = ? AND c.active = 1 AND s.active = 1
         AND (c.scope_type = 'org' OR (c.scope_type = 'club' AND c.scope_id = ?) OR (c.scope_type = 'division' AND c.scope_id = ?))
       ORDER BY CASE c.scope_type WHEN 'club' THEN 0 WHEN 'division' THEN 1 ELSE 2 END, c.id`, p, clubId, divisionId).catch(() => []);
    if (rows.length) return [...new Set(rows.map((r) => String(r.channel_id)))];
    const legacy = await LEGACY[p]?.(env);
    if (legacy) return [String(legacy)];
  }
  return [];
}
// The channel a feature posts to for a purpose, or null: callers say "no channel is set" and never substitute another one.
export const channelFor = async (env, purpose, scope) => (await channelsFor(env, purpose, scope))[0] ?? null;
// The private notice for a feature whose channel is not set (section 9). It reads the purpose from the Organization config: with no channel it says so and
// where a manager sets it; with some, it names exactly those channels (never a guess). The words for the purpose are CHANNEL_PURPOSE_INFO, the same text the site shows.
export async function channelNotice(env, purpose, scope) {
  const ids = await channelsFor(env, purpose, scope);
  const what = CHANNEL_PURPOSE_INFO[purpose] ?? purpose;
  return ids.length
    ? pictureNote(env, 'notice-info', `A channel is set for ${purpose.replace(/_/g, ' ')}`, `${what}: ${ids.map((id) => `<#${id}>`).join(' ')}`)
    : pictureNote(env, 'notice-notconfigured', `No channel is set for ${purpose.replace(/_/g, ' ')}`, `${what}. A manager adds one in the Boardroom → Organization, or with \`/setup channel\`.`);
}

// Dual-write for the older channel commands (the Awards settings and the /docs post), which still keep their meta key so nothing
// that reads it breaks: they also record the choice here, so the website's Organization section and every config reader agree and
// the legacy meta keys can retire. `explicit` (a manager picked it) replaces the org-level row; otherwise (a post that merely
// used a channel) only fills a purpose that has no row yet, so a configured channel is never overridden. Never throws.
export async function mirrorChannel(env, purpose, channelId, { explicit = false } = {}) {
  try {
    if (!CHANNEL_PURPOSES.includes(purpose)) return false;
    const id = String(channelId ?? '');
    const server = (env.DISCORD_GUILD_ID && await one(env, 'SELECT id FROM discord_servers WHERE guild_id = ? AND active = 1', String(env.DISCORD_GUILD_ID)))
      || (await all(env, 'SELECT id FROM discord_servers WHERE active = 1 ORDER BY id LIMIT 2')).filter((_, __, a) => a.length === 1)[0];
    if (!server) return false;
    const cur = await all(env, "SELECT id, channel_id FROM discord_channels WHERE server_id = ? AND purpose = ? AND scope_type = 'org' AND active = 1 ORDER BY id", server.id, purpose);
    if (!id) { if (explicit) for (const r of cur) await run(env, 'UPDATE discord_channels SET active = 0 WHERE id = ?', r.id); return explicit; }
    if (!/^\d{5,25}$/.test(id)) return false;
    if (cur.some((r) => String(r.channel_id) === id)) return true;
    if (cur.length && !explicit) return false;
    if (cur.length) await run(env, 'UPDATE discord_channels SET channel_id = ? WHERE id = ?', id, cur[0].id);
    else await run(env, "INSERT INTO discord_channels (server_id, channel_id, purpose, scope_type, label, active) VALUES (?, ?, ?, 'org', '', 1)", server.id, id, purpose);
    return true;
  } catch { return false; }
}

// ---------- readers for the rest of the system ----------

// Active clubs that sync (members and/or matches), in display order. Falls back to nothing, never to a baked-in ID.
export const activeClubs = (env) => all(env, 'SELECT id, ea_club_id, display_name, division_id, sync_members, sync_matches FROM ea_clubs WHERE active = 1 AND archived = 0 ORDER BY sort, id');

// Most specific active channel for a purpose: club scope → division scope → organization. null when none is configured
// (callers must report that, never substitute some other channel).
export async function resolveChannel(env, purpose, { clubId = null, divisionId = null } = {}) {
  const rows = await all(env,
    `SELECT c.channel_id, s.guild_id, c.scope_type FROM discord_channels c JOIN discord_servers s ON s.id = c.server_id
     WHERE c.purpose = ? AND c.active = 1 AND s.active = 1
       AND (c.scope_type = 'org' OR (c.scope_type = 'club' AND c.scope_id = ?) OR (c.scope_type = 'division' AND c.scope_id = ?))`,
    purpose, clubId, divisionId);
  for (const scope of ['club', 'division', 'org']) {
    const hit = rows.find((r) => r.scope_type === scope);
    if (hit) return { channelId: hit.channel_id, guildId: hit.guild_id, scope };
  }
  return null;
}

// Discord role IDs mapped to an internal permission group (optionally narrowed to a scope).
export async function rolesFor(env, group) {
  return all(env, 'SELECT r.role_id, s.guild_id, r.scope_type, r.scope_id FROM discord_roles r JOIN discord_servers s ON s.id = r.server_id WHERE r.permission_group = ? AND r.active = 1 AND s.active = 1', group);
}

// ---------- Discord env from Organization config (replaces hardcoded wrangler vars) ----------

const HYDRATE_TTL = 60e3;
let hydrated = null; // { at, db, values } – one D1 read per minute per isolate, keyed to the DB binding so tests with fresh mocks never share it

// wrangler.toml no longer carries the Discord server or role IDs: the active server and the owner / manager role mappings come from D1.
// A value still set in wrangler.toml / secrets wins (nothing changes for a deployment that keeps them); D1 only fills the blanks.
// Returns a NEW env (the shared binding is never mutated). Without D1 or on a read error the env comes back untouched – never a baked-in ID.
export async function withOrgEnv(env) {
  if (!env?.DB) return env;
  if (!hydrated || hydrated.db !== env.DB || Date.now() - hydrated.at > HYDRATE_TTL) {
    try {
      const [server] = await all(env, 'SELECT guild_id FROM discord_servers WHERE active = 1 ORDER BY id LIMIT 1');
      const [owner, manager] = await Promise.all([rolesFor(env, 'owner'), Promise.all(['administrator', 'manager', 'division_manager', 'club_manager'].map((g) => rolesFor(env, g))).then((x) => x.flat())]);
      const [org] = await all(env, 'SELECT name FROM orgs ORDER BY id LIMIT 1').catch(() => []);
      hydrated = { at: Date.now(), db: env.DB, values: { guildId: server?.guild_id ?? '', orgName: org?.name ?? '', owner: owner.map((r) => r.role_id), manager: manager.map((r) => r.role_id) } };
    } catch { return env; }
  }
  const v = hydrated.values;
  return {
    ...env,
    ORG_NAME: env.ORG_NAME || v.orgName,
    DISCORD_GUILD_ID: env.DISCORD_GUILD_ID || v.guildId,
    OWNER_ROLE_ID: env.OWNER_ROLE_ID || v.owner[0] || '',
    ADMIN_ROLE_ID: env.ADMIN_ROLE_ID || v.manager[0] || '',
    ORG_ROLES: { owner: v.owner, manager: v.manager }, // every mapped role, for the checks that accept more than one
  };
}
export const resetOrgEnvCache = () => { hydrated = null; };

// The organization's display name for text people read (embed eyebrows, error messages). It is the `orgs.name` row that withOrgEnv
// copies into env.ORG_NAME; an env without it (no D1, or a test) gets the generic fallback, never a previous club's name.
export const orgName = (env) => String(env?.ORG_NAME || 'Phoenix Fire').trim();

// Keyed like /api/org/clubs/public: result posts run in GitHub Actions (no D1), so they ask the Worker where a purpose goes for a source club.
// Answers { channelId, guildId, scope } or { channelId: null } when nothing is configured – the caller must report that, never substitute.
export async function orgRoutePublicRoute(request, env) {
  if (!env.DISCORD_CLIENT_SECRET || sharedKey(request) !== await settingsKey(env.DISCORD_CLIENT_SECRET)) return fail('Forbidden', 403);
  const q = new URL(request.url).searchParams;
  const purpose = q.get('purpose');
  if (!CHANNEL_PURPOSES.includes(purpose)) return fail('Unknown purpose');
  const ea = q.get('club');
  const club = ea ? await one(env, 'SELECT id, division_id FROM ea_clubs WHERE ea_club_id = ? AND archived = 0', String(ea)) : null;
  if (ea && !club) return json({ channelId: null, guildId: null, scope: null, reason: 'unknown club' });
  const hit = await resolveChannel(env, purpose, { clubId: club?.id ?? null, divisionId: club?.division_id ?? null });
  return json(hit ?? { channelId: null, guildId: null, scope: null, reason: 'no destination configured' });
}
