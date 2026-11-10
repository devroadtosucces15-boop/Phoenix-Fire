// Several Discord apps, one Worker. Each app is its own Discord application (own name, avatar, public key, token) and
// owns a slice of the slash commands; Discord sends its interactions to /interactions/<app>. Plain module (no Worker-only
// imports) so bot/register.mjs can use it from Node too.
//
//   core  – member login (OAuth), role sync, result + notification posts, AutoMod, every cron/background post
//   stats – club and player records
//   tools – management + member tools
//   fun   – engagement
//   matchday – running one 11v11 match day (planned, PLANNING/BOT-SPLIT.md)
//   rush  – 5v5 Rush: member-logged games, LFG, queue (planned)
//
// Credentials per app (see bot/README.md): DISCORD_APP_ID_<APP>, DISCORD_PUBLIC_KEY_<APP> (public vars),
// DISCORD_BOT_TOKEN_<APP> (secret). core also falls back to the old unsuffixed DISCORD_APP_ID / DISCORD_PUBLIC_KEY /
// DISCORD_BOT_TOKEN, so the single-app setup keeps working unchanged.
//
// Until an app is configured (app ID + public key set), its commands stay on core – registered there and answered
// there – so splitting can happen one app at a time.
import { COMMANDS, APP_COMMANDS, MOVED_FROM, HELD, buildRegistration } from './commanddefs.js';

export const APPS = Object.keys(APP_COMMANDS);
const OWNER = new Map(Object.entries(APP_COMMANDS).flatMap(([app, names]) => names.map((n) => [n, app])));
export const appOf = (name) => OWNER.get(name) ?? null;
export const APP_LABEL = { core: 'Phoenix', stats: 'Phoenix Stats', tools: 'Phoenix Tools', fun: 'Phoenix Fun', matchday: 'Phoenix Matchday', rush: 'Phoenix Rush' };

const pick = (env, base, app) => env?.[`${base}_${app.toUpperCase()}`] || (app === 'core' ? env?.[base] : '') || '';
export function appCreds(env, app) {
  return { appId: String(pick(env, 'DISCORD_APP_ID', app)), publicKey: String(pick(env, 'DISCORD_PUBLIC_KEY', app)), token: String(pick(env, 'DISCORD_BOT_TOKEN', app)) };
}
// configured = Discord can reach it (ID + key); the token is only needed for registration, DMs and channel posts.
export const appConfigured = (env, app) => { const c = appCreds(env, app); return !!(c.appId && c.publicKey); };

// Where a command is answered right now: its owner once that app is configured; before that, the app it moved from
// (MOVED_FROM) or core; a HELD command (new, no former home) is nowhere until its app exists.
export function homeOf(env, name) {
  const owner = appOf(name);
  if (!owner) return null;
  if (owner === 'core' || appConfigured(env, owner)) return owner;
  if (HELD.has(name)) return null;
  const former = MOVED_FROM[name];
  return former && appConfigured(env, former) ? former : 'core'; // an unconfigured old app has already lent its commands to core
}
// Transition window: after an app goes live (APP_LIVE_SINCE_<APP>, an ISO date set by the owner) its moved commands stay
// registered on the old app for GRACE_DAYS, answering with a one-line pointer, then drop off.
export const GRACE_DAYS = 14;
export function inGrace(env, app, now = Date.now()) {
  const since = Date.parse(env?.[`APP_LIVE_SINCE_${String(app).toUpperCase()}`] ?? '');
  return appConfigured(env, app) && Number.isFinite(since) && now >= since && now < since + GRACE_DAYS * 86400e3;
}
const names_of = (pred) => new Set(COMMANDS.filter((c) => pred(c.name)).map((c) => c.name));
// The command names an app answers: the ones whose home it is.
export const servedBy = (env, app) => names_of((n) => homeOf(env, n) === app);
// Moved commands an old app still lists during the transition window (they only point to the new app).
export const movedOnly = (env, app, now = Date.now()) => names_of((n) => MOVED_FROM[n] === app && appOf(n) !== app && inGrace(env, appOf(n), now));
// What an app registers with Discord: what it serves plus the moved pointers.
export const registeredBy = (env, app, now = Date.now()) => new Set([...servedBy(env, app), ...movedOnly(env, app, now)]);
export const commandsFor = (env, app, now = Date.now()) => { const names = registeredBy(env, app, now); return COMMANDS.filter((c) => names.has(c.name)); };
// The app that answers a command right now (core when it is nowhere).
export const answeringApp = (env, name) => homeOf(env, name) ?? 'core';
// One line for someone who used a moved command on its old app.
export const movedNote = (env, app, name, now = Date.now()) => movedOnly(env, app, now).has(name) ? `/${name} moved to ${APP_LABEL[appOf(name)]} – use it there from now on.` : null;

// Which app a request path is for: '/' and '/interactions' are the legacy single-app endpoint → core.
export function appFromPath(path) {
  if (path === '/' || path === '/interactions' || path === '/interactions/') return 'core';
  const m = /^\/interactions\/([a-z]+)\/?$/.exec(path);
  return m && APPS.includes(m[1]) ? m[1] : null;
}

// What to register where: one entry per configured app that has a token (the owner's per-command settings applied).
// `only` limits it to some apps (register.mjs stats). Unconfigured apps are left out – core carries their commands.
export function registrationPlan(env, settings = {}, only = []) {
  return APPS.filter((a) => (!only.length || only.includes(a)) && appConfigured(env, a))
    .map((app) => ({ app, ...appCreds(env, app), commands: buildRegistration(commandsFor(env, app), settings) }))
    .filter((p) => p.token);
}

// Replaces one app's whole command list with Discord.
export async function putCommands(appId, token, list) {
  const r = await fetch(`https://discord.com/api/v10/applications/${appId}/commands`, {
    method: 'PUT', headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(list),
  });
  return r.ok ? { ok: true } : { ok: false, error: `Discord said ${r.status}: ${(await r.text()).slice(0, 200)}` };
}

// The public per-app values (DISCORD_APP_ID_<APP>, DISCORD_PUBLIC_KEY_<APP>) live in wrangler.toml [vars]; register.mjs
// reads them from there so it decides "configured" exactly like the deployed Worker does.
export function tomlVars(text) {
  const out = {}, block = /^\[vars\]\s*$([\s\S]*?)(?=^\[)/m.exec(String(text) + '\n[')?.[1] ?? '';
  for (const m of block.matchAll(/^\s*([A-Z0-9_]+)\s*=\s*"([^"]*)"/gm)) out[m[1]] = m[2];
  return out;
}

// env as one app sees it: DISCORD_APP_ID / DISCORD_PUBLIC_KEY / DISCORD_BOT_TOKEN are that app's, so every existing
// follow-up (webhooks/${env.DISCORD_APP_ID}/${token}) and DM/channel post uses the app that received the interaction.
export function appEnv(env, app) {
  const c = appCreds(env, app);
  return { ...env, BOT_APP: app, DISCORD_APP_ID: c.appId, DISCORD_PUBLIC_KEY: c.publicKey, DISCORD_BOT_TOKEN: c.token };
}
