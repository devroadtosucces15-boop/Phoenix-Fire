// Several Discord apps on one Worker (bot/apps.js): command ownership, per-app signature checks, routing,
// per-app follow-ups and per-app registration.
import fs from 'node:fs';
import { env as baseEnv, ROOT } from './mock.mjs';
import worker from '../bot/worker.js';
import { plainText } from '../bot/ui.js';
import { COMMANDS, APP_COMMANDS, STAFF_COMMANDS, buildRegistration } from '../bot/commanddefs.js';
import { APPS, appOf, appCreds, appConfigured, appEnv, appFromPath, servedBy, answeringApp, registrationPlan, tomlVars } from '../bot/apps.js';
import { t, tt, done } from './lib.mjs';

// ---------- the map ----------
const names = COMMANDS.map((c) => c.name);
const owned = Object.values(APP_COMMANDS).flat();
t('apps are core, stats, tools, fun', APPS.join() === 'core,stats,tools,fun');
t('every command belongs to exactly one app', names.every((n) => owned.filter((x) => x === n).length === 1));
t('the app map names no unknown command', owned.every((n) => names.includes(n)) && owned.length === names.length);
t('sample owners', appOf('club') === 'stats' && appOf('purge') === 'tools' && appOf('jail') === 'fun' && appOf('syncroles') === 'core' && appOf('nope') === null);
t('every staff command is hidden from non-staff when registered', buildRegistration(COMMANDS).filter((c) => STAFF_COMMANDS.includes(c.name)).every((c) => c.default_member_permissions === String(1 << 28)));
t('staff commands all exist', STAFF_COMMANDS.every((n) => names.includes(n)));

// ---------- credentials + configuration ----------
const legacy = { DISCORD_APP_ID: '100', DISCORD_PUBLIC_KEY: 'aa', DISCORD_BOT_TOKEN: 'tok' };
t('core falls back to the unsuffixed names', JSON.stringify(appCreds(legacy, 'core')) === JSON.stringify({ appId: '100', publicKey: 'aa', token: 'tok' }));
t('_CORE names win over the unsuffixed ones', appCreds({ ...legacy, DISCORD_APP_ID_CORE: '101' }, 'core').appId === '101');
t('other apps never fall back to core credentials', !appConfigured(legacy, 'stats') && appCreds(legacy, 'stats').token === '');
t('single-app setup: core serves every command', servedBy(legacy, 'core').size === names.length);
const split = { ...legacy, DISCORD_APP_ID_STATS: '200', DISCORD_PUBLIC_KEY_STATS: 'bb', DISCORD_BOT_TOKEN_STATS: 'tok2' };
t('a configured app takes its commands off core', !servedBy(split, 'core').has('club') && servedBy(split, 'core').has('purge') && servedBy(split, 'stats').has('club'));
t('answeringApp follows configuration', answeringApp(legacy, 'club') === 'core' && answeringApp(split, 'club') === 'stats' && answeringApp(split, 'jail') === 'core');
const e = appEnv(split, 'stats');
t('appEnv swaps in that app\'s id, key and token', e.DISCORD_APP_ID === '200' && e.DISCORD_PUBLIC_KEY === 'bb' && e.DISCORD_BOT_TOKEN === 'tok2' && e.BOT_APP === 'stats');
t('appFromPath', appFromPath('/') === 'core' && appFromPath('/interactions') === 'core' && appFromPath('/interactions/fun') === 'fun' && appFromPath('/interactions/fun/') === 'fun' && appFromPath('/interactions/nope') === null && appFromPath('/api/x') === null);

// ---------- registration ----------
const plan = registrationPlan(split);
t('registration: one entry per configured app with a token', plan.map((p) => p.app).join() === 'core,stats');
t('registration: each app gets only its own commands', plan.find((p) => p.app === 'stats').commands.every((c) => appOf(c.name) === 'stats') && !plan.find((p) => p.app === 'core').commands.some((c) => appOf(c.name) === 'stats'));
t('registration: nothing lost or doubled', plan.reduce((n, p) => n + p.commands.length, 0) === names.length);
t('registration: uses each app\'s own id + token', plan.find((p) => p.app === 'stats').appId === '200' && plan.find((p) => p.app === 'stats').token === 'tok2' && plan.find((p) => p.app === 'core').token === 'tok');
t('registration: owner settings still apply per app', !registrationPlan(split, { club: { enabled: false } }).find((p) => p.app === 'stats').commands.some((c) => c.name === 'club'));
t('registration: `only` limits the apps', registrationPlan(split, {}, ['stats']).map((p) => p.app).join() === 'stats');
t('registration: an app with no token is skipped', !registrationPlan({ ...split, DISCORD_BOT_TOKEN_STATS: '' }).some((p) => p.app === 'stats'));
const toml = tomlVars(fs.readFileSync(ROOT + 'bot/wrangler.toml', 'utf8'));
t('tomlVars reads [vars] from wrangler.toml, not commented lines', /^\d+$/.test(toml.DISCORD_APP_ID) && /^[0-9a-f]{64}$/.test(toml.DISCORD_PUBLIC_KEY) && !('DISCORD_APP_ID_STATS' in toml) && !('binding' in toml));
t('no bot token or client secret is committed in wrangler.toml', !Object.keys(toml).some((k) => /TOKEN|SECRET/.test(k)));

// ---------- the Worker: signatures and routing ----------
const keys = {};
for (const app of ['core', 'stats']) {
  const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  keys[app] = { kp, hex: Buffer.from(await crypto.subtle.exportKey('raw', kp.publicKey)).toString('hex') };
}
const env = { ...baseEnv, DISCORD_APP_ID: '100', DISCORD_PUBLIC_KEY: keys.core.hex, DISCORD_BOT_TOKEN: 'core-token', DISCORD_APP_ID_STATS: '200', DISCORD_PUBLIC_KEY_STATS: keys.stats.hex, DISCORD_BOT_TOKEN_STATS: 'stats-token' };
const waits = [];
async function send(path, payload, signer, e = env) {
  const body = JSON.stringify(payload), ts = String(Date.now());
  const sig = Buffer.from(await crypto.subtle.sign('Ed25519', keys[signer].kp.privateKey, new TextEncoder().encode(ts + body))).toString('hex');
  const res = await worker.fetch(new Request('https://bot' + path, { method: 'POST', body, headers: { 'X-Signature-Ed25519': sig, 'X-Signature-Timestamp': ts } }), e, { waitUntil: (p) => waits.push(p) });
  return { s: res.status, d: await res.json().catch(() => null) };
}
const slash = (path, name, signer, options = [], e) => send(path, { type: 2, channel_id: 'c1', token: 'itok', data: { name, options }, member: { user: { id: '111', username: 'boss' }, roles: [] } }, signer, e);

t('stats endpoint accepts its own key', (await send('/interactions/stats', { type: 1 }, 'stats')).d?.type === 1);
t('stats endpoint rejects the core key', (await send('/interactions/stats', { type: 1 }, 'core')).s === 401);
t('core endpoint rejects the stats key', (await send('/interactions/core', { type: 1 }, 'stats')).s === 401);
t('legacy / is core', (await send('/', { type: 1 }, 'core')).d?.type === 1);
t('an app that is not set up → 404', (await send('/interactions/tools', { type: 1 }, 'core')).s === 404);
t('an unknown app → 404', (await send('/interactions/music', { type: 1 }, 'core')).s === 404);
await tt('/club answers on stats', async () => { const d = (await slash('/interactions/stats', 'club', 'stats')).d?.data; return !!d && !/not on this bot/.test(plainText(d)); });
await tt('/club on core points to Phoenix Stats once stats exists', async () => /not on this bot.*Phoenix Stats/.test(plainText((await slash('/', 'club', 'core')).d.data)));
await tt('/site is not on stats', async () => /not on this bot/.test(plainText((await slash('/interactions/stats', 'site', 'stats')).d.data)));
await tt('single-app setup: /club still works on /', async () => { const e1 = { ...env, DISCORD_APP_ID_STATS: '', DISCORD_PUBLIC_KEY_STATS: '' }; const d = (await slash('/', 'club', 'core', [], e1)).d?.data; return !!d && !/not on this bot/.test(plainText(d)); });
await tt('autocomplete for another app\'s command → no choices', async () => { const r = await send('/', { type: 4, data: { name: 'player', options: [{ name: 'gamertag', value: 'a', focused: true }] } }, 'core'); return r.d.type === 8 && r.d.data.choices.length === 0; });
await tt('buttons are not filtered by app (norex:box on stats reaches its handler)', async () => { const r = await send('/interactions/stats', { type: 3, data: { custom_id: 'norex:box:0', component_type: 2 }, member: { user: { id: '111' }, roles: [] } }, 'stats'); return r.s === 200 && r.d?.type === 4; });

// A deferred command's follow-up goes to the webhook of the app that received it.
await tt('follow-up uses the receiving app\'s id', async () => {
  const seen = [], real = globalThis.fetch;
  globalThis.fetch = async (u, init) => { if (String(u).startsWith('https://discord.com/')) { seen.push(String(u)); return new Response('{}'); } return real(u, init); };
  try {
    const e2 = { ...env, FEATURES: JSON.stringify({ ...JSON.parse(env.FEATURES), ask: 'members' }) };
    const r = await slash('/interactions/stats', 'ask', 'stats', [{ name: 'question', value: 'who scores most?' }], e2);
    await Promise.all(waits.splice(0));
    return r.d?.type === 5 && seen.some((u) => u.includes('/webhooks/200/itok')) && !seen.some((u) => u.includes('/webhooks/100/'));
  } finally { globalThis.fetch = real; }
});
done();
