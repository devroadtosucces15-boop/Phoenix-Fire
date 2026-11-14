// Control Center runtime (PLANNING/CONTROL-CENTER.md): what a manager set for one registry output, read from D1 on every use (a short per-isolate cache),
// so a change on the website applies without a deploy. The write side (API, audit) is bot/controlcenter.js.
//   output key   registry id: `slash:/queue`, `auto:rush-need`, `dm:lfg`, `site:rush` (bot/registry.gen.js lists them all)
//   no row       on, default rules: the feature's own permission checks decide (nothing here widens access)
//   a row        enabled + rules { allow_roles, allow_members, deny_roles, deny_members, allow_channels, deny_channels, post_channels, methods, windows }
// Lists are Discord ids (roles, members, channels). Several of each, or none; blank means "default rules". Deny always wins over allow.
// orgconfig.js is imported lazily (postChannels): it reaches settings → botcommands → controlcenter → this file, and a static import would be a cycle.
import { ROLES } from './roles.js';

export const RULE_LISTS = ['allow_roles', 'allow_members', 'deny_roles', 'deny_members', 'allow_channels', 'deny_channels', 'post_channels'];
export const METHODS = ['site', 'dm', 'push']; // every way a notification can reach someone today: the site bell and inbox, a Discord DM, a browser push
export const LEVEL_LISTS = ['allow_levels', 'deny_levels']; // the site's own role levels (member, manager, owner …): what a DM or notification can tell about a person (it has no Discord roles)
const id = (v) => String(v ?? '').replace(/\D/g, '');
const ids = (v) => [...new Set((Array.isArray(v) ? v : String(v ?? '').split(/[\s,]+/)).map(id).filter((x) => x.length >= 5))].slice(0, 100);

// Clean any stored or posted rules into the one shape. Unknown keys are dropped; methods default to all on.
export function normalizeRules(raw) {
  let r = raw;
  if (typeof r === 'string') { try { r = JSON.parse(r || '{}'); } catch { r = {}; } }
  r = r && typeof r === 'object' ? r : {};
  const out = Object.fromEntries(RULE_LISTS.map((k) => [k, ids(r[k])]));
  for (const k of LEVEL_LISTS) out[k] = [...new Set((Array.isArray(r[k]) ? r[k] : []).map(String).filter((x) => ROLES.includes(x)))];
  if (typeof r.min === 'string' && ROLES.includes(r.min)) out.min = r.min; // lowest site role that may use a command (the old Bot commands panel's rule)
  if (['private', 'public'].includes(r.reply)) out.reply = r.reply; // answer privately or in the channel
  out.methods = Object.fromEntries(METHODS.map((m) => [m, r.methods?.[m] === undefined ? true : !!r.methods[m]]));
  out.windows = (Array.isArray(r.windows) ? r.windows : []).slice(0, 14).map((w) => ({
    days: [...new Set((Array.isArray(w?.days) ? w.days : [0, 1, 2, 3, 4, 5, 6]).map(Number).filter((d) => d >= 0 && d <= 6))],
    from: /^\d{2}:\d{2}$/.test(w?.from) ? w.from : '00:00', to: /^\d{2}:\d{2}$/.test(w?.to) ? w.to : '23:59',
  }));
  return out;
}

const CACHE_MS = 15e3;
let cache = null; // { db, at, map } – keyed to the DB binding so a test with a fresh mock never reads another's rows
export const resetControlsCache = () => { cache = null; };
export async function loadControls(env, { fresh = false } = {}) {
  if (!env?.DB) return new Map();
  if (!fresh && cache && cache.db === env.DB && Date.now() - cache.at < CACHE_MS) return cache.map;
  const map = new Map();
  try {
    const { results } = await env.DB.prepare('SELECT key, enabled, rules, updated_at, updated_by FROM output_controls').all();
    for (const r of results ?? []) map.set(r.key, { key: r.key, enabled: !!r.enabled, rules: normalizeRules(r.rules), updated_at: r.updated_at, updated_by: r.updated_by });
  } catch { /* table not migrated yet: everything stays on with default rules */ }
  cache = { db: env.DB, at: Date.now(), map };
  return map;
}
const DEFAULT = () => ({ enabled: true, rules: normalizeRules({}) });
export const controlOf = async (env, key) => (await loadControls(env)).get(key) ?? { key, ...DEFAULT() };

const inWindow = (windows, now) => {
  if (!windows.length) return true;
  const d = new Date(now), mins = d.getUTCHours() * 60 + d.getUTCMinutes(), day = d.getUTCDay();
  const m = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  return windows.some((w) => w.days.includes(day) && (m(w.from) <= m(w.to) ? mins >= m(w.from) && mins <= m(w.to) : mins >= m(w.from) || mins <= m(w.to)));
};

// Who may use a command / who may receive a post. ctx = { userId, roleIds, channelId, now }. Returns { ok, why }.
// A blank allow list means "default rules" (the caller's own permission check), never "nobody".
export function decide(control, { userId = '', roleIds = [], level = '', channelId = '', now = Date.now() } = {}) {
  const c = control ?? DEFAULT(), r = c.rules ?? normalizeRules({});
  const u = id(userId), roles = (roleIds ?? []).map(id), ch = id(channelId);
  if (!c.enabled) return { ok: false, why: 'off' };
  if (u && r.deny_members.includes(u)) return { ok: false, why: 'denied-member' };
  if (roles.some((x) => r.deny_roles.includes(x)) || (level && r.deny_levels.includes(level))) return { ok: false, why: 'denied-role' };
  const listed = r.allow_roles.length || r.allow_members.length || r.allow_levels.length;
  if (listed && !(r.allow_members.includes(u) || roles.some((x) => r.allow_roles.includes(x)) || (level && r.allow_levels.includes(level)))) return { ok: false, why: 'not-allowed' };
  if (ch && r.deny_channels.includes(ch)) return { ok: false, why: 'denied-channel' };
  if (ch && r.allow_channels.length && !r.allow_channels.includes(ch)) return { ok: false, why: 'wrong-channel' };
  if (!inWindow(r.windows, now)) return { ok: false, why: 'outside-window' };
  return { ok: true };
};
export const gate = async (env, key, ctx) => decide(await controlOf(env, key), ctx);

// What a manager said about an automated post / DM: the roles and members it goes to (blank = the feature's own default),
// the channels it is posted to (blank = the Organization-config purpose), the notification methods that stay on.
export async function audienceOf(env, key) {
  const c = await controlOf(env, key), r = c.rules;
  return { enabled: c.enabled, roles: r.allow_roles, members: r.allow_members, denyRoles: r.deny_roles, denyMembers: r.deny_members, channels: r.post_channels, methods: r.methods, windows: r.windows, allowLevels: r.allow_levels, denyLevels: r.deny_levels };
}
// The channels a post goes to: the Control Center's choice when one is set, else the Organization-config purpose (several allowed).
export async function postChannels(env, key, purpose, scope) {
  const c = await controlOf(env, key);
  if (!c.enabled) return [];
  if (c.rules.post_channels.length) return c.rules.post_channels;
  const { channelsFor } = await import('./orgconfig.js');
  return channelsFor(env, purpose, scope);
}
// The keys of one kind (`job:`, `slash:/`, `comp:`, `auto:`, `dm:`) a manager switched off. Read on every cron run / interaction (15 s cache).
export async function disabledOutputs(env, prefix = '') {
  const off = new Set();
  for (const [key, c] of await loadControls(env)) if (!c.enabled && key.startsWith(prefix)) off.add(key);
  return off;
}
// The registry key of a button, menu or form: its custom id with ids and counters folded (`pf:lfg:482:in` → `comp:pf:lfg:#:in`), the same on both sides.
export const componentKey = (customId) => `comp:${String(customId).replace(/\d{3,}/g, 'N').replace(/:\d+(?=:|$)/g, ':#')}`;
