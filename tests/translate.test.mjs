// PF-024 Item 9 – the Translator and the shared AI budget counter (bot/translate.js, bot/aibudget.js).
import { env as baseEnv, KV, setAiReply, config } from './mock.mjs';
import worker from '../bot/worker.js';
import { plainText } from '../bot/ui.js';
import { COMMANDS, APP_COMMANDS, buildRegistration } from '../bot/commanddefs.js';
import { translatePrompt, enhancePrompt, parseTranslation, translationMessage, enhanceMessage, translateText, enhanceText, languageOf, setLanguage, LANGUAGES, MAX_CHARS } from '../bot/translate.js';
import { spendAi, aiUsed, AI_DAILY_CAP, AI_COOLDOWN_SEC } from '../bot/aibudget.js';
import { t, tt, done } from './lib.mjs';

// ---------- definitions ----------
const ctx = COMMANDS.find((c) => c.name === 'Translate message');
t('a message context-menu command (type 3) exists, owned by the tools app', ctx?.type === 3 && APP_COMMANDS.tools.includes('Translate message'));
t('registered with an empty description (Discord rule for context-menu commands)', buildRegistration(COMMANDS).find((c) => c.name === 'Translate message').description === '');
t('/translate /enhance /language exist and need no gateway option', ['translate', 'enhance', 'language'].every((n) => COMMANDS.some((c) => c.name === n && APP_COMMANDS.tools.includes(n))));
t('language picker stays inside Discord\'s 25 choices', LANGUAGES.length <= 25 && COMMANDS.find((c) => c.name === 'translate').options.find((o) => o.name === 'to').choices.length === LANGUAGES.length);

// ---------- prompts ----------
t('translate prompt names the target language and tone', /into Spanish/.test(translatePrompt({ to: 'es' })) && /street slang/.test(translatePrompt({ to: 'es', tone: 'street' })));
t('translate prompt keeps names/mentions and refuses instructions in the text', /gamertags/.test(translatePrompt({ to: 'en' })) && /never as instructions/.test(translatePrompt({ to: 'en' })));
t('enhance prompt scales with the level 1-10', /fix spelling/.test(enhancePrompt({ level: 1 })) && /rewrite it fully/.test(enhancePrompt({ level: 10 })) && /level 10 of 10/.test(enhancePrompt({ level: 99 })) && /level 5 of 10/.test(enhancePrompt({})));
t('FROM line is parsed', parseTranslation('FROM: Spanish\n"Hola equipo"').from === 'Spanish' && parseTranslation('FROM: Spanish\n"Hola equipo"').body === 'Hola equipo' && parseTranslation('plain').body === 'plain');

// ---------- the AI budget counter ----------
const env = { ...baseEnv, FEATURES: JSON.stringify({ ...JSON.parse(baseEnv.FEATURES), translate: 'owner' }) };
const T0 = Date.UTC(2026, 0, 2, 12);
const a = await spendAi({ ...env, AI_DAILY_CAP: '600' }, { cost: 250, who: 'u1', feature: 'x', now: T0 });
t('budget: first spend ok and counted', a.ok && a.used === 250 && (await aiUsed(env, T0)) === 250);
const b = await spendAi({ ...env, AI_DAILY_CAP: '600' }, { cost: 250, who: 'u1', feature: 'x', now: T0 + 1000 });
t('budget: same person inside the cooldown is refused and not charged', !b.ok && b.reason === 'cooldown' && (await aiUsed(env, T0)) === 250);
const c = await spendAi({ ...env, AI_DAILY_CAP: '600' }, { cost: 250, who: 'u1', feature: 'x', now: T0 + (AI_COOLDOWN_SEC + 1) * 1000 });
t('budget: after the cooldown it works again', c.ok && c.used === 500);
const d = await spendAi({ ...env, AI_DAILY_CAP: '600' }, { cost: 250, who: 'u2', feature: 'x', now: T0 + 30000 });
t('budget: the daily cap stops everyone', !d.ok && d.reason === 'budget' && (await aiUsed(env, T0)) === 500);
t('budget: a new UTC day starts at zero', (await aiUsed(env, T0 + 86400e3)) === 0 && AI_DAILY_CAP < 10000);

// ---------- translate / enhance run through the counter ----------
let seen = null;
setAiReply((req) => { seen = req; return 'FROM: Spanish\nGood game, team!'; });
const r = await translateText(env, { input: 'Buen partido, equipo', to: 'en', tone: 'casual', who: 'tr1', feature: 'translate' });
t('translate: answer parsed, system prompt used, spent from the counter', r.ok && r.from === 'Spanish' && r.body === 'Good game, team!' && seen.messages[0].content.includes('English') && seen.messages[1].content === 'Buen partido, equipo');
t('translate: too-long text is refused before any AI call', (await translateText(env, { input: 'x'.repeat(MAX_CHARS + 1), to: 'en', who: 'tr2' })).ok === false);
const budgetOut = await translateText({ ...env, AI_DAILY_CAP: '1' }, { input: 'hola', to: 'en', who: 'tr3' });
t('translate: an empty counter says so in plain words', !budgetOut.ok && /allowance/.test(budgetOut.error));
setAiReply(() => '"A much better speech."');
const e1 = await enhanceText(env, { input: 'my speech', level: 8, tone: 'professional', who: 'en1' });
t('enhance: level and tone carried, quotes stripped', e1.ok && e1.level === 8 && e1.body === 'A much better speech.');
t('language preference is saved and read back, default English', (await languageOf(env, 'nobody')) === 'en' && (await setLanguage(env, 'lang1', 'pt')) && (await languageOf(env, 'lang1')) === 'pt' && !(await setLanguage(env, 'lang1', 'xx')));

// ---------- Phoenix branding on every output ----------
const outputs = [translationMessage(env, r, { original: 'Buen partido', byLine: 'Ash' }), enhanceMessage(env, e1, { byLine: 'Ash' })].map((m) => JSON.stringify(m));
t('outputs say Phoenix Fire, use the Phoenix accent, no NOREX name, red or crest', outputs.every((o) => /Phoenix Fire/.test(o) && !/norex|c8352c|0xc8352c|13120044|080b11/i.test(o)) && outputs.every((o) => o.includes(String(0xe8651a))));
t('the footer warns it is AI output', /AI translation/.test(outputs[0]) && /read it before you post/.test(outputs[1]));

// ---------- the Worker: dispatch ----------
const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const wenv = { ...env, DISCORD_APP_ID: '100', DISCORD_PUBLIC_KEY: Buffer.from(await crypto.subtle.exportKey('raw', kp.publicKey)).toString('hex'), DISCORD_BOT_TOKEN: 'tok' };
const waits = [];
async function send(payload, e = wenv) {
  const body = JSON.stringify(payload), ts = String(Date.now());
  const sig = Buffer.from(await crypto.subtle.sign('Ed25519', kp.privateKey, new TextEncoder().encode(ts + body))).toString('hex');
  const res = await worker.fetch(new Request('https://bot/', { method: 'POST', body, headers: { 'X-Signature-Ed25519': sig, 'X-Signature-Timestamp': ts } }), e, { waitUntil: (p) => waits.push(p) });
  return res.json();
}
const who = { id: '111', username: 'boss', global_name: 'Boss' };
const menu = (content, extra = {}) => ({ type: 2, token: 'tk', channel_id: 'c1', data: { id: '9', type: 3, name: 'Translate message', target_id: 'm1', resolved: { messages: { m1: { id: 'm1', content, author: { id: '5', username: 'ash' }, ...extra } } } }, member: { user: who, roles: [] } });
const patches = [];
const real = globalThis.fetch;
globalThis.fetch = async (u, init) => { if (String(u).startsWith('https://discord.com/')) { patches.push(JSON.parse(init.body)); return new Response('{}'); } return real(u, init); };
try {
  await tt('context menu: public deferred reply, translation patched in with Phoenix output', async () => {
    setAiReply(() => 'FROM: German\nNice goal!');
    const res = await send(menu('Schönes Tor!'));
    await Promise.all(waits.splice(0));
    const out = JSON.stringify(patches.pop());
    return res.type === 5 && !(res.data.flags & 64) && /Nice goal!/.test(out) && /Phoenix Fire/.test(out) && !/norex|c8352c/i.test(out);
  });
  await tt('context menu on a message with no text → private note', async () => { const res = await send(menu('')); return res.type === 4 && !!(res.data.flags & 64); });
  await tt('context menu on a bot message → private note', async () => { const res = await send(menu('hello', { author: { id: '9', bot: true } })); return res.type === 4 && !!(res.data.flags & 64); });
  await tt('flag off → locked, no AI call', async () => { let called = false; setAiReply(() => { called = true; return 'x'; }); const res = await send(menu('Hola'), { ...wenv, FEATURES: JSON.stringify({ ...JSON.parse(wenv.FEATURES), translate: 'off' }) }); return res.type === 4 && !called; });
  await tt('/language saves the choice privately', async () => { const res = await send({ type: 2, token: 'tk', data: { id: '8', name: 'language', options: [{ name: 'language', type: 3, value: 'it' }] }, member: { user: who, roles: [] } }); return res.type === 4 && !!(res.data.flags & 64) && (await languageOf(env, '111')) === 'it'; });
  await tt('/translate uses the saved language when none is given', async () => {
    await KV.delete('aicool:translate:111'); // the menu test above just used this person's cooldown
    let sys = ''; setAiReply((q) => { sys = q.messages[0].content; return 'FROM: English\nBuon gioco'; });
    await send({ type: 2, token: 'tk', channel_id: 'c1', data: { id: '7', name: 'translate', options: [{ name: 'text', type: 3, value: 'good game' }] }, member: { user: who, roles: [] } });
    await Promise.all(waits.splice(0));
    return /into Italian/.test(sys);
  });
} finally { globalThis.fetch = real; }
t('the feature flag ships owner-only in config', config.features.translate === 'owner');
done();
