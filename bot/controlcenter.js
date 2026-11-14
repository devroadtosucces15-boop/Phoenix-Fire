// Control Center API (PLANNING/CONTROL-CENTER.md): one place for the owner and managers to switch, aim and restrict every output.
//   GET  /api/controlcenter                  managers+: the registry (every output), every row set so far, the channel purposes, the audit log
//   GET  /api/controlcenter/discord          managers+: the server's channels and roles for the pickers
//   POST /api/controlcenter/save             managers+: { key, enabled, rules } – one output (no change from the default deletes the row)
//   POST /api/controlcenter/reset            managers+: { key } – back to default
//   POST /api/controlcenter/create           managers+: { kind: 'channel' | 'role', name } – make it in Discord, then attach it from the page
// Every write goes through saveControl(): the website and the /setup output command write the same `output_controls` rows, and every change is
// recorded in config_audit (who, what, when). Changes apply on the next request: the Worker reads the rows at runtime (bot/controls.js), no deploy.
import { REGISTRY, REGISTRY_KEYS } from './registry.gen.js';
import { normalizeRules, loadControls, resetControlsCache, RULE_LISTS, METHODS, LEVEL_LISTS } from './controls.js';
import { can } from './roles.js';
import { ROLES, flags } from './roles.js';
import { TYPES } from './notify.js';
import { CHANNEL_PURPOSE_INFO, loadOrgConfig } from './orgconfig.js';
import { COMMANDS } from './commanddefs.js';
import { discordTargets } from './docs.js';
import { discord } from './servertools.js';

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
const fail = (msg, status = 400) => json({ error: msg }, status);
const all = (env, sql, ...args) => env.DB.prepare(sql).bind(...args).all().then((r) => r.results);
const run = (env, sql, ...args) => env.DB.prepare(sql).bind(...args).run();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const DEFAULT_RULES = normalizeRules({});
const isDefault = (enabled, rules) => enabled && same(rules, DEFAULT_RULES);

async function audit(env, me, action, key, before, after) {
  await run(env, 'INSERT INTO config_audit (at, user_id, name, entity, entity_id, action, before, after) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    Date.now(), String(me?.u ?? ''), me?.n ?? '', 'output_controls', null, action, JSON.stringify({ key, ...(before ?? {}) }), JSON.stringify({ key, ...(after ?? {}) }));
}

// The one write path. `merge`: keep the lists the input leaves out (the /setup command changes one thing at a time); the website sends the whole row.
export async function saveControl(env, me, key, input = {}, { merge = false } = {}) {
  if (!REGISTRY_KEYS.has(key)) return { error: 'That output is not in the registry.', status: 404 };
  const cur = (await loadControls(env, { fresh: true })).get(key) ?? { enabled: true, rules: DEFAULT_RULES };
  const enabled = input.enabled === undefined ? cur.enabled : !!input.enabled;
  const rules = normalizeRules(merge ? { ...cur.rules, ...(input.rules ?? {}) } : (input.rules ?? cur.rules));
  const before = { enabled: cur.enabled, rules: cur.rules }, after = { enabled, rules };
  if (same(before, after)) return { row: { key, ...after }, unchanged: true };
  if (isDefault(enabled, rules)) await run(env, 'DELETE FROM output_controls WHERE key = ?', key);
  else await run(env, `INSERT INTO output_controls (key, enabled, rules, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (key) DO UPDATE SET enabled = excluded.enabled, rules = excluded.rules, updated_at = excluded.updated_at, updated_by = excluded.updated_by`, key, enabled ? 1 : 0, JSON.stringify(rules), Date.now(), String(me?.u ?? ''));
  await audit(env, me, isDefault(enabled, rules) ? 'reset' : 'update', key, before, after);
  resetControlsCache();
  return { row: { key, ...after } };
}
export const resetControl = (env, me, key) => saveControl(env, me, key, { enabled: true, rules: {} });

// The old Bot commands panel (and /api/bot/commands) saved one blob; it now writes the same rows, so nothing lives in two places.
// clean = cleanCommandSettings() output: { name: { enabled?, min?, channels?, reply?, postTo? } } for the commands that differ from default.
export async function saveCommandSettings(env, me, clean) {
  const controls = await loadControls(env, { fresh: true });
  for (const c of COMMANDS) {
    const key = `slash:/${c.name}`, s = clean[c.name], cur = controls.get(key);
    if (!s && !cur) continue;
    const rules = { ...(cur?.rules ?? DEFAULT_RULES), min: s?.min, reply: s?.reply, allow_channels: s?.channels ?? [], post_channels: s?.postTo ? [s.postTo] : [] };
    await saveControl(env, me, key, { enabled: s?.enabled !== false, rules });
  }
}

// /setup output output:<key> state:<on|off|default> [channel] [role]: one change at a time, same rows as the website.
export async function setOutput(env, me, { output, state, channel, role }) {
  const key = String(output ?? '');
  if (!REGISTRY_KEYS.has(key)) return { error: `"${key}" is not an output in the registry. Pick one from the list that appears as you type.` };
  if (state === 'default') return resetControl(env, me, key);
  const cur = (await loadControls(env, { fresh: true })).get(key) ?? { enabled: true, rules: DEFAULT_RULES };
  const rules = { ...cur.rules };
  if (channel) rules.post_channels = [...new Set([...rules.post_channels, String(channel)])];
  if (role) rules.allow_roles = [...new Set([...rules.allow_roles, String(role)])];
  return saveControl(env, me, key, { enabled: state ? state === 'on' : undefined, rules });
}
// Autocomplete for the output option: matches key, name and kind.
export function outputChoices(query = '') {
  const q = String(query).toLowerCase().trim();
  return REGISTRY.items.filter((i) => !q || `${i.key} ${i.name} ${i.kind}`.toLowerCase().includes(q)).slice(0, 25).map((i) => ({ name: `${i.kind} · ${i.name}`.slice(0, 100), value: i.key }));
}

const summary = (i, c) => ({ ...i, row: c ? { enabled: c.enabled, rules: c.rules, updated_at: c.updated_at, updated_by: c.updated_by } : null });

export async function controlCenterRoute(p, method, body, me, env) {
  if (!p.startsWith('/api/controlcenter')) return null;
  if (!can(me, 'controlcenter.manage')) return fail('Managers and the owner only.', 403); // enforced here, not just by hiding the page
  if (!env.DB) return fail('The member database is not connected.', 503);
  if (p === '/api/controlcenter' && method === 'GET') {
    const [controls, purposeRows, auditRows, members] = await Promise.all([loadControls(env, { fresh: true }), all(env, 'SELECT purpose, channel_id FROM discord_channels WHERE active = 1').catch(() => []), all(env, "SELECT id, at, user_id, name, action, before, after FROM config_audit WHERE entity = 'output_controls' ORDER BY id DESC LIMIT 80").catch(() => []), all(env, 'SELECT id, name FROM users ORDER BY name LIMIT 800').catch(() => [])]);
    const byPurpose = {};
    for (const r of purposeRows) (byPurpose[r.purpose] ??= []).push(String(r.channel_id));
    return json({
      me: { manage: true, flags: can(me, 'flags.manage'), org: can(me, 'settings.org') },
      members, apps: REGISTRY.apps, purposes: CHANNEL_PURPOSE_INFO, purposeChannels: byPurpose, levels: ROLES, methods: METHODS, lists: [...RULE_LISTS, ...LEVEL_LISTS],
      items: REGISTRY.items.map((i) => summary(i, controls.get(i.key))),
      flags: { committed: env._committedFlags ?? flags(env), live: flags(env) },
      audit: auditRows.map((r) => ({ ...r, before: safeParse(r.before), after: safeParse(r.after) })),
      ...(can(me, 'settings.org') ? { org: await loadOrgConfig(env) } : {}),
      notifications: { types: Object.entries(TYPES).filter(([, t]) => !t.hidden).map(([k, t]) => ({ k, icon: t.icon, label: t.label, role: t.role ?? null })) },
    });
  }
  if (p === '/api/controlcenter/discord' && method === 'GET') return json(await discordTargets(env).catch((e) => ({ ready: false, error: e.message })));
  if (method !== 'POST') return fail('Not found', 404);
  if (p === '/api/controlcenter/save') {
    const res = await saveControl(env, me, String(body?.key ?? ''), { enabled: body?.enabled, rules: body?.rules });
    return res.error ? fail(res.error, res.status ?? 400) : json(res);
  }
  if (p === '/api/controlcenter/reset') {
    const res = await resetControl(env, me, String(body?.key ?? ''));
    return res.error ? fail(res.error, res.status ?? 400) : json(res);
  }
  if (p === '/api/controlcenter/create') { // make a channel or role in Discord so the page can attach it; the audit log records it too
    const name = String(body?.name ?? '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 80);
    if (!name) return fail('Give it a name.');
    if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) return fail('The bot is not connected to the Discord server yet.', 503);
    try {
      const made = body?.kind === 'role'
        ? await discord(env, 'POST', `/guilds/${env.DISCORD_GUILD_ID}/roles`, { name, mentionable: true }, 'Control Center')
        : await discord(env, 'POST', `/guilds/${env.DISCORD_GUILD_ID}/channels`, { name: name.toLowerCase().replace(/\s+/g, '-'), type: 0 }, 'Control Center');
      await audit(env, me, `create-${body?.kind === 'role' ? 'role' : 'channel'}`, '', null, { id: made.id, name: made.name });
      return json({ id: made.id, name: made.name, kind: body?.kind === 'role' ? 'role' : 'channel' });
    } catch (e) { return fail(e.message === 'no-access' ? 'The bot needs Manage Channels / Manage Roles for that.' : e.message, 502); }
  }
  return fail('Not found', 404);
}
const safeParse = (s) => { try { return JSON.parse(s); } catch { return null; } };
