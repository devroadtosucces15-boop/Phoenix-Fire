// Per-command control for the Discord bot (owner panel in the Boardroom):
//   enabled · min role (guest…owner) · allowed channels · private/public reply · post-to channel.
// Stored as one JSON blob in D1 meta key `bot_commands`.
//   GET  /api/bot/commands        owner: the table (every command + its settings + the channel list)
//   POST /api/bot/commands        owner: save { commands: { name: {…} } }
//   POST /api/bot/commands/sync   owner: re-register the slash commands with Discord right now
// The Worker enforces everything on every interaction (so the rules apply even before a sync); the sync only
// changes what Discord *shows* (hidden / staff-only commands), see buildRegistration() in commanddefs.js.
import { can, atLeast, ROLES } from './roles.js';
import { COMMANDS } from './commanddefs.js';
import { answeringApp, putCommands, registrationPlan } from './apps.js';
import { discordTargets } from './docs.js';
import { IS_V2, privateNote } from './ui.js';
import { loadControls, decide } from './controls.js';
import { saveCommandSettings } from './controlcenter.js';

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
const fail = (msg, status = 400) => json({ error: msg }, status);
const ID = /^\d{5,25}$/;
const REPLIES = ['default', 'private', 'public'];

// One store now: the Control Center rows (`output_controls`, key slash:/<name>). A row replaces whatever the old `bot_commands` blob said for that
// command; the blob is only read for commands nobody has touched since the Control Center (it keeps working until the owner saves them once).
export async function getCommandSettings(env) {
  if (!env.DB) return {};
  const row = await env.DB.prepare("SELECT value FROM meta WHERE key = 'bot_commands'").first().catch(() => null);
  let out = {};
  try { out = row?.value ? JSON.parse(row.value) : {}; } catch { out = {}; }
  for (const [key, c] of await loadControls(env)) {
    if (!key.startsWith('slash:/')) continue;
    const s = {};
    if (!c.enabled) s.enabled = false;
    if (c.rules.min) s.min = c.rules.min;
    if (c.rules.allow_channels.length) s.channels = c.rules.allow_channels;
    if (c.rules.reply) s.reply = c.rules.reply;
    if (c.rules.post_channels[0]) s.postTo = c.rules.post_channels[0];
    if (Object.keys(s).length) out[key.slice(7)] = s; else delete out[key.slice(7)];
  }
  return out;
}

// Keep only known commands and valid values; drop entries equal to the defaults.
export function cleanCommandSettings(input) {
  const names = new Set(COMMANDS.map((c) => c.name));
  const out = {};
  for (const [name, v] of Object.entries(input && typeof input === 'object' ? input : {})) {
    if (!names.has(name) || !v || typeof v !== 'object') continue;
    const s = {};
    if (v.enabled === false) s.enabled = false;
    if (ROLES.includes(v.min)) s.min = v.min;
    const channels = (Array.isArray(v.channels) ? v.channels : []).map(String).filter((x) => ID.test(x)).slice(0, 25);
    if (channels.length) s.channels = channels;
    if (REPLIES.includes(v.reply) && v.reply !== 'default') s.reply = v.reply;
    if (ID.test(String(v.postTo ?? ''))) s.postTo = String(v.postTo);
    if (Object.keys(s).length) out[name] = s;
  }
  return out;
}

// → null when the person may run it, else the ephemeral message to show.
// Owners are never blocked; managers ignore channel limits (so they can always fix a bad setting).
export async function commandBlocked(env, name, who, channelId, settings, ctx = {}) {
  const s = (settings ?? await getCommandSettings(env))[name] ?? {};
  if (who.role === 'owner') return null;
  if (s.enabled === false) return '🔕 That command is switched off right now.';
  if (s.min && s.min !== 'guest') {
    let ok = atLeast(who.role, s.min);
    if (!ok && s.min === 'claimed' && env.DB && who.u) ok = !!(await env.DB.prepare("SELECT 1 AS x FROM claims WHERE user_id = ? AND status = 'approved'").bind(who.u).first());
    if (!ok) return `🔒 /${name} is for ${s.min === 'claimed' ? 'verified players' : s.min + 's'} and up.`;
  }
  if (s.channels?.length && !atLeast(who.role, 'manager') && !s.channels.includes(channelId)) return `📍 Use /${name} in ${s.channels.map((c) => `<#${c}>`).join(' or ')}.`;
  // The rest of the Control Center row: allow and deny lists for roles and members, channels it must not be used in, time windows.
  const c = (await loadControls(env)).get(`slash:/${name}`);
  if (c) {
    const d = decide({ enabled: true, rules: { ...c.rules, allow_channels: [] } }, { userId: who.u, roleIds: ctx.roleIds ?? [], level: who.role, channelId, now: ctx.now });
    if (!d.ok) return { 'denied-member': `🔒 You cannot use /${name}.`, 'denied-role': `🔒 /${name} is not available to your role.`, 'not-allowed': `🔒 /${name} is only for the people a manager picked.`, 'denied-channel': `📍 /${name} cannot be used in this channel.`, 'outside-window': `🕒 /${name} is only available at certain times.` }[d.why] ?? `🔒 /${name} is off for you right now.`;
  }
  return null;
}

// Applies private/public + post-to to an immediate (type 4) reply. Anything else passes through untouched.
export async function shapeReply(env, name, res, settings) {
  const s = (settings ?? await getCommandSettings(env))[name];
  if (!s || !(s.reply || s.postTo) || !res || typeof res.json !== 'function') return res;
  let body;
  try { body = await res.clone().json(); } catch { return res; }
  if (body?.type !== 4 || !body.data) return res;
  if (s.postTo && env.DISCORD_BOT_TOKEN && !(body.data.flags & 64)) {
    const { flags = 0, ...msg } = body.data;
    if (flags & IS_V2) msg.flags = IS_V2; // design-system panels need the V2 flag on the posted copy too (ephemeral stays off)
    const r = await fetch(`https://discord.com/api/v10/channels/${s.postTo}/messages`, {
      method: 'POST', headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...msg, allowed_mentions: msg.allowed_mentions ?? { parse: [] } }),
    }).catch(() => null);
    if (r?.ok) return json(privateNote(`Posted in <#${s.postTo}>.`, 'win'));
  }
  if (s.reply === 'private') body.data.flags = (body.data.flags ?? 0) | 64;
  else if (s.reply === 'public') body.data.flags = (body.data.flags ?? 0) & ~64;
  return json(body);
}

// One PUT per configured Discord app, each with only its own commands (bot/apps.js registrationPlan).
export async function syncCommands(env, settings) {
  const plan = registrationPlan(env, settings);
  if (!plan.length) return { ok: false, error: 'The bot token / app id are not set on the Worker.' };
  const apps = [];
  for (const p of plan) {
    const r = await putCommands(p.appId, p.token, p.commands);
    if (!r.ok) return { ok: false, error: `${p.app}: ${r.error}`, apps };
    apps.push({ app: p.app, count: p.commands.length });
  }
  return { ok: true, count: apps.reduce((n, a) => n + a.count, 0), apps };
}

export async function botCommandsRoute(p, method, body, me, env, log) {
  if (p !== '/api/bot/commands' && p !== '/api/bot/commands/sync') return null;
  if (!can(me, 'settings.bot')) return fail('Owner only.', 403);
  if (p === '/api/bot/commands/sync') {
    if (method !== 'POST') return fail('Not found', 404);
    const r = await syncCommands(env, await getCommandSettings(env));
    if (r.ok) await log?.(env, me, 'bot-commands-sync', `Synced ${r.count} commands to Discord (${r.apps.map((a) => `${a.app} ${a.count}`).join(', ')})`);
    return r.ok ? json(r) : fail(r.error, 502);
  }
  if (method === 'GET') {
    const settings = await getCommandSettings(env);
    const t = await discordTargets(env).catch(() => ({ ready: false }));
    return json({
      commands: COMMANDS.map((c) => ({ name: c.name, description: c.description, staff: !!c.default_member_permissions, app: answeringApp(env, c.name), ...(settings[c.name] ?? {}) })),
      channels: t.ready ? t.channels : [], channelsError: t.ready ? '' : (t.error ?? ''),
    });
  }
  if (method !== 'POST') return fail('Not found', 404);
  const clean = cleanCommandSettings(body.commands);
  await saveCommandSettings(env, me, clean); // the old panel writes the Control Center rows; the blob is retired (cleared) so nothing lives in two places
  await env.DB.prepare("DELETE FROM meta WHERE key = 'bot_commands'").run();
  await log?.(env, me, 'bot-commands', 'Updated per-command bot settings');
  return json({ ok: true, saved: Object.keys(clean).length });
}
