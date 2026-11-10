// Registers the slash commands with Discord, one PUT per Discord app with only that app's commands (bot/apps.js).
// Run by .github/workflows/bot.yml, so no PC is required.
//   node bot/register.mjs            every configured app
//   node bot/register.mjs stats fun  only those apps
// Public values (DISCORD_APP_ID_<APP>, DISCORD_PUBLIC_KEY_<APP>) come from bot/wrangler.toml [vars], like the deployed
// Worker sees them; tokens (DISCORD_BOT_TOKEN_<APP>) only from the environment. core also accepts the old unsuffixed
// DISCORD_APP_ID / DISCORD_BOT_TOKEN. An app that is not configured is skipped – core registers its commands instead.
import fs from 'node:fs';
import { APPS, putCommands, registrationPlan, tomlVars } from './apps.js';

const only = process.argv.slice(2);
const bad = only.filter((a) => !APPS.includes(a));
if (bad.length) { console.error(`Unknown app: ${bad.join(', ')} (apps: ${APPS.join(', ')})`); process.exit(1); }

// The owner's per-command settings (Boardroom → Bot) decide what gets registered: switched-off commands are left out and
// manager/owner-only ones are hidden from members in Discord. Read from the Worker with the same key fetch.mjs uses.
async function loadCommandSettings() {
  const secret = process.env.DISCORD_CLIENT_SECRET;
  try {
    const { createHash } = await import('node:crypto');
    const api = JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url), 'utf8')).members?.api;
    if (!secret || !api) return {};
    const key = createHash('sha256').update(`${secret}:norex-bot-settings`).digest('hex');
    const r = await fetch(`${api.replace(/\/$/, '')}/api/bot/settings/public`, { signal: AbortSignal.timeout(10000), headers: { 'X-Norex-Key': key } });
    return r.ok ? ((await r.json()).commands ?? {}) : {};
  } catch (e) { console.warn('Command settings not loaded:', e.message); return {}; }
}

const vars = tomlVars(fs.readFileSync(new URL('./wrangler.toml', import.meta.url), 'utf8'));
const env = { ...vars, ...Object.fromEntries(Object.entries(process.env).filter(([, v]) => v)) };
const plan = registrationPlan(env, await loadCommandSettings(), only);
if (!plan.length) { console.error('No Discord app has an app ID + public key + bot token – nothing to register.'); process.exit(1); }

let failed = false;
for (const p of plan) {
  const r = await putCommands(p.appId, p.token, p.commands);
  console.log(`${p.app}:`, r.ok ? `registered ${p.commands.length} commands` : r.error);
  if (!r.ok) failed = true;
}
if (failed) process.exit(1);
