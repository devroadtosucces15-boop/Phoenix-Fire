// PF-024 Item 10 – the Quote card (bot/quotecard.js): message context menu → share picture.
import { env as baseEnv, KV, config } from './mock.mjs';
import worker from '../bot/worker.js';
import { COMMANDS, APP_COMMANDS, buildRegistration } from '../bot/commanddefs.js';
import { cleanQuote, quoteModel, wrapQuote, fitQuote, quoteSvg, quoteMessage, drawQuote, spendQuote, QUOTES_PER_HOUR, MAX_QUOTE } from '../bot/quotecard.js';
import { t, tt, done } from './lib.mjs';

// ---------- definition ----------
t('a message context-menu command "Quote card" exists in the tools app, empty description when registered', COMMANDS.find((c) => c.name === 'Quote card')?.type === 3 && APP_COMMANDS.tools.includes('Quote card') && buildRegistration(COMMANDS).find((c) => c.name === 'Quote card').description === '');
t('the feature flag ships owner-only', config.features.quoteCard === 'owner');

// ---------- text clean-up ----------
t('mentions become @names, markup, custom emoji and emoji go', cleanQuote('**Great** game <@5> 🔥 <:pf:123> __wow__', { mentions: [{ id: '5', username: 'bo' }] }) === 'Great game @bo wow');
t('quote prefix and line breaks are flattened, accents and punctuation stay', cleanQuote('> ¡Qué golazo!\n\nVamos…') === '¡Qué golazo! Vamos…');
t('long text is cut at MAX_QUOTE with an ellipsis', (() => { const s = cleanQuote('word '.repeat(400)); return s.length <= MAX_QUOTE && s.endsWith('…'); })());
t('nothing but emoji → empty (no card)', cleanQuote('🔥🔥🔥') === '');

// ---------- model ----------
const msg = { id: 'm1', content: 'Rise. Burn. Repeat.', timestamp: '2026-11-17T10:00:00Z', author: { id: '77', username: 'ash', global_name: 'Ash K', avatar: 'abc' } };
const model = quoteModel(msg, { members: { 77: { nick: 'Ash 🔥' } } });
t('model: nick wins, handle, date, avatar url from the CDN', model.name === 'Ash' && model.handle === '@ash' && model.date === '17 Nov 2026' && model.avatar === 'https://cdn.discordapp.com/avatars/77/abc.png');
t('model: bot authors, empty messages and missing messages give no card', quoteModel({ ...msg, author: { id: '1', bot: true } }) === null && quoteModel({ ...msg, content: '' }) === null && quoteModel(undefined) === null);

// ---------- layout ----------
t('wrap: words stay whole, long words are cut', wrapQuote('aa bb cc', 76, 300).every((l) => l.length <= 8) && wrapQuote('x'.repeat(200), 76, 300).every((l) => l.length <= 8));
t('fit: short text gets the big size, long text a smaller one, always inside the area', (() => { const a = fitQuote('Short one'), b = fitQuote('word '.repeat(110)); return a.size === 76 && b.size < a.size && a.lines.length * a.size * 1.28 <= 470 && b.lines.length * b.size * 1.28 <= 470; })());

// ---------- Phoenix branding ----------
const svg = quoteSvg(model, { motto: 'Rise. Burn. Repeat.' });
const panel = JSON.stringify(quoteMessage(baseEnv, model, null, { byLine: 'Boss' })) + JSON.stringify(quoteMessage(baseEnv, model, 'https://bot/media/q/x.png'));
t('SVG: Phoenix name, ember accent, ink background, motto from config, no NOREX name/red/blue-black', /PHOENIX FIRE/.test(svg) && svg.includes('#e8651a') && svg.includes('#0a0705') && /RISE\. BURN\. REPEAT\./.test(svg) && !/norex|c8352c|080b11/i.test(svg));
t('replies: Phoenix footer, Phoenix accent, no NOREX', /Phoenix Fire/.test(panel) && panel.includes(String(0xe8651a)) && !/norex|c8352c/i.test(panel) && /“Rise\. Burn\. Repeat\.”/.test(panel));
t('SVG escapes markup in a quote', !quoteSvg({ ...model, text: '<script>&"x"' }).includes('<script>'));

// ---------- drawing with fake bindings: drawn once, cached by hash ----------
const store = new Map(); let draws = 0;
const fake = { ...baseEnv, PUBLIC_URL: 'https://bot.example', SITE_URL: '', MEDIA: { head: async (k) => (store.has(k) ? {} : null), put: async (k, v) => { store.set(k, v); } }, IMAGES: { input: () => ({ output: async () => { draws++; return { response: () => new Response(new Uint8Array(3000)) }; } }) } };
const d1 = await drawQuote(fake, { ...model, avatar: null }), d2 = await drawQuote(fake, { ...model, avatar: null });
t('draw: first call renders to q/<hash>.png, second is served from R2', d1.url?.startsWith('https://bot.example/media/q/') && !d1.cached && d2.cached && draws === 1);
t('draw: a failing Images binding returns an error, never throws', !!(await drawQuote({ ...fake, MEDIA: { head: async () => null, put: async () => {} }, IMAGES: { input: () => { throw new Error('boom'); } } }, { ...model, avatar: null, text: 'other' })).error);

// ---------- per-person hourly limit ----------
let ok = 0; for (let k = 0; k < QUOTES_PER_HOUR + 3; k++) if (await spendQuote(baseEnv, 'rl-user', 1e12)) ok++;
t('limit: QUOTES_PER_HOUR per person per hour, others unaffected', ok === QUOTES_PER_HOUR && (await spendQuote(baseEnv, 'other-user', 1e12)));

// ---------- the Worker ----------
const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const env = { ...baseEnv, FEATURES: JSON.stringify({ ...JSON.parse(baseEnv.FEATURES), quoteCard: 'owner' }), DISCORD_APP_ID: '100', DISCORD_PUBLIC_KEY: Buffer.from(await crypto.subtle.exportKey('raw', kp.publicKey)).toString('hex'), DISCORD_BOT_TOKEN: 'tok' };
const waits = [];
async function send(payload, e = env) {
  const body = JSON.stringify(payload), ts = String(Date.now());
  const sig = Buffer.from(await crypto.subtle.sign('Ed25519', kp.privateKey, new TextEncoder().encode(ts + body))).toString('hex');
  return (await worker.fetch(new Request('https://bot/', { method: 'POST', body, headers: { 'X-Signature-Ed25519': sig, 'X-Signature-Timestamp': ts } }), e, { waitUntil: (p) => waits.push(p) })).json();
}
const who = { id: '111', username: 'boss', global_name: 'Boss' };
const menu = (m) => ({ type: 2, token: 'tk', channel_id: 'c1', data: { id: '9', type: 3, name: 'Quote card', target_id: 'm1', resolved: { messages: { m1: m } } }, member: { user: who, roles: [] } });
const patches = [], real = globalThis.fetch;
globalThis.fetch = async (u, init) => { if (String(u).startsWith('https://discord.com/')) { patches.push(JSON.parse(init.body)); return new Response('{}'); } return real(u, init); };
try {
  await tt('no image binding → public deferred reply, text quote fallback in Phoenix style', async () => {
    const res = await send(menu(msg)); await Promise.all(waits.splice(0));
    const out = JSON.stringify(patches.pop());
    return res.type === 5 && !(res.data.flags & 64) && /Rise\. Burn\. Repeat\./.test(out) && /Phoenix Fire/.test(out) && !/norex|c8352c/i.test(out);
  });
  await tt('with Images + R2 → the reply carries the drawn picture', async () => {
    const res = await send(menu({ ...msg, content: 'Another one' }), { ...env, ...fake, FEATURES: env.FEATURES }); await Promise.all(waits.splice(0));
    return res.type === 5 && /\/media\/q\/[0-9a-f]+\.png/.test(JSON.stringify(patches.pop()));
  });
  await tt('a bot message or an empty one → private note, nothing drawn', async () => { const a = await send(menu({ ...msg, author: { id: '9', bot: true } })), b = await send(menu({ ...msg, content: '🔥' })); return a.type === 4 && !!(a.data.flags & 64) && b.type === 4 && !!(b.data.flags & 64); });
  await tt('flag off → locked', async () => { const r = await send(menu(msg), { ...env, FEATURES: JSON.stringify({ ...JSON.parse(env.FEATURES), quoteCard: 'off' }) }); return r.type === 4 && !!(r.data.flags & 64); });
} finally { globalThis.fetch = real; }
done();
