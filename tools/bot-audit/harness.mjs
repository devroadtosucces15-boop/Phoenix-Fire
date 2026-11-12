// Shared harness: real Worker + repo mocks + a recording fetch (every Discord API write becomes a captured message).
import fs from 'node:fs';
import { ROOT, env as baseEnv, config, worker } from '../../tests/mock.mjs';
import { APPS } from '../../bot/apps.js';
export { ROOT, config, worker };
// Sample text the bot picks at random (jail charges, trivia questions, wheel results) must be the same on every run,
// or every capture would look like a change. A small seeded generator replaces Math.random for the capture process.
let seed = 20261111;
Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
// The fun module picks through its own test hook (crypto based): point it at the same seeded generator.
const { rng } = await import('../../bot/fun.js');
rng.pick = (n) => Math.floor(Math.random() * n);
export let calls = [];
export const resetCalls = () => { calls = []; return calls; };
const CARDS_MANIFEST = new URL('./out/cards.json', import.meta.url).pathname;
const mockFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url === 'http://localhost:4321/api/cards.json' && fs.existsSync(CARDS_MANIFEST)) return new Response(fs.readFileSync(CARDS_MANIFEST));
  if (/^https:\/\/(discord\.com|discordapp\.com)\/api\//.test(url) && !/oauth2|users\/@me($|\/connections)|\/guilds\/\d+($|\?)/.test(url)) {
    const method = init.method ?? 'GET';
    let body = null;
    try {
      if (init.body instanceof FormData) { body = init.body.get('payload_json') ? JSON.parse(init.body.get('payload_json')) : { content: String(init.body.get('content') ?? '') }; body.files = [...init.body.keys()].filter((k) => k.startsWith('files')).map((k) => ({ name: init.body.get(k)?.name, size: init.body.get(k)?.size })); }
      else body = init.body ? JSON.parse(init.body) : null;
    } catch { body = { raw: String(init.body).slice(0, 200) }; }
    if (method !== 'GET') calls.push({ method, url: url.replace(/^https:\/\/discord.com\/api\/v\d+/, ''), body });
    if (/users\/@me\/channels$/.test(url)) return Response.json({ id: 'DM-' + (body?.recipient_id ?? '0') });
    if (method === 'GET' && /\/messages/.test(url)) return Response.json([]);
    return Response.json({ id: 'M' + calls.length, channel_id: 'C1', roles: [], members: [], name: 'sample' });
  }
  return mockFetch(url, init);
};
const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const PUB = Buffer.from(await crypto.subtle.exportKey('raw', kp.publicKey)).toString('hex');
// Every app is configured here (same key, its own fake ID and token), so each command is answered by its real home app
// instead of "/x is not on this bot". No APP_LIVE_SINCE_* → no transition-window pointers.
const perApp = Object.fromEntries(APPS.filter((a) => a !== 'core').flatMap((a, k) => { const A = a.toUpperCase(); return [[`DISCORD_APP_ID_${A}`, String(2 + k)], [`DISCORD_PUBLIC_KEY_${A}`, PUB], [`DISCORD_BOT_TOKEN_${A}`, 'x']]; }));
export const env = {
  ...baseEnv, ...perApp, DISCORD_PUBLIC_KEY: PUB,
  DISCORD_BOT_TOKEN: 'x', DISCORD_APP_ID: '1', DISCORD_GUILD_ID: '9', SITE_URL: 'http://localhost:4321/',
  FEATURES: JSON.stringify(Object.fromEntries(Object.keys(config.features ?? {}).map((k) => [k, 'public']))),
};
const pending = [];
export const ctx = { waitUntil: (p) => pending.push(Promise.resolve(p).catch((e) => console.log('bg error', e.message))) };
export const settle = () => Promise.all(pending.splice(0));
export const USER = { id: '111', username: 'boss', global_name: 'Zub (owner)', avatar: null };
export const base = () => ({ id: String(Date.now() + Math.random()), application_id: '1', token: 'tok' + Math.random().toString(36).slice(2), version: 1, guild_id: '9', channel_id: 'C1', member: { user: USER, roles: [], permissions: '8', nick: null }, app_permissions: '8', locale: 'en-GB' });
export async function send(payload, app = 'core') {
  const body = JSON.stringify(payload), ts = String(Date.now());
  const sig = Buffer.from(await crypto.subtle.sign('Ed25519', kp.privateKey, new TextEncoder().encode(ts + body))).toString('hex');
  const res = await worker.fetch(new Request(app === 'core' ? 'https://bot/' : `https://bot/interactions/${app}`, { method: 'POST', body, headers: { 'X-Signature-Ed25519': sig, 'X-Signature-Timestamp': ts } }), env, ctx);
  const d = await res.json().catch(() => null);
  await settle();
  return { status: res.status, d };
}
