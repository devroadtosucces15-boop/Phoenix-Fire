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
import { COMMANDS, APP_COMMANDS, buildRegistration } from './commanddefs.js';

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

// The command names an app answers (and registers): its own, plus – for core – every unconfigured app's.
export function servedBy(env, app) {
  const names = new Set(APP_COMMANDS[app] ?? []);
  if (app === 'core') for (const a of APPS) if (a !== 'core' && !appConfigured(env, a)) for (const n of APP_COMMANDS[a]) names.add(n);
  return names;
}
export const commandsFor = (env, app) => { const names = servedBy(env, app); return COMMANDS.filter((c) => names.has(c.name)); };
// The app that answers a command right now (its owner if configured, else core).
export const answeringApp = (env, name) => { const a = appOf(name); return a && a !== 'core' && appConfigured(env, a) ? a : 'core'; };

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
