// PF-024 Item 13 – the Phoenix wiki book (bot/wikibook.js): one book for all five bots, a two-page spread, setup helper, Q&A.
import { env } from './mock.mjs';
import worker from '../bot/worker.js';
import { t, tt, done } from './lib.mjs';
import { plainText } from '../bot/ui.js';
import { COMMANDS, APP_COMMANDS } from '../bot/commanddefs.js';
import { HELP_COMMANDS, pagesFor } from '../bot/help.js';
import { bookMessage, answerMessage, bookEntries, flowEntries, composeCommand, subsOf, WIKI_ID, BOT_KEYS } from '../bot/wikibook.js';
import fs from 'node:fs';

const count = (n) => (n.components ? 1 + n.components.reduce((s, c) => s + count(c), 0) : 1);
const chars = (n) => (n.content ? n.content.length : 0) + (n.components ?? []).reduce((s, c) => s + chars(c), 0);
const ids = (m) => [...JSON.stringify(m).matchAll(/"custom_id":"([^"]+)"/g)].map((x) => x[1]);
const txt = (m) => plainText({ components: m.components });
const entries = await bookEntries({}, null, null);

// ---------- every page of every bot fits Discord, is private, and navigates ----------
const bad = [];
for (const k of ['hub', ...BOT_KEYS]) {
  const n = k === 'hub' ? 1 : pagesFor(k).length;
  for (let p = 0; p < n; p++) {
    const m = bookMessage(env, k, p, { entries }), root = { components: m.components };
    if ((m.flags & 64) !== 64 || (m.flags & (1 << 15)) === 0) bad.push(`${k}:${p} not private v2`);
    if (count(root) > 40) bad.push(`${k}:${p} ${count(root)} components`);
    if (chars(root) > 4000) bad.push(`${k}:${p} ${chars(root)} characters`);
    const i = ids(m); if (new Set(i).size !== i.length) bad.push(`${k}:${p} duplicate ids`);
    if (i.some((x) => !WIKI_ID.test(x))) bad.push(`${k}:${p} odd id`);
    if (k !== 'hub' && p > 24) bad.push(`${k}:${p} beyond the 25 of the jump list`);
  }
}
t('every page: private, v2, under 40 components, under 4000 characters, unique ids that the router accepts', bad.length === 0 || (console.log(bad), false));
t('the book has a page for every command of every bot (nothing drifts from the live definitions)', BOT_KEYS.every((k) => APP_COMMANDS[k].filter((n) => !(n in HELP_COMMANDS) && COMMANDS.some((c) => c.name === n)).every((n) => pagesFor(k).some((p) => p.name === n))));

// ---------- the spread: a left page and a right page ----------
const cmdPage = pagesFor('rush').findIndex((p) => p.name === 'queue'), spread = txt(bookMessage(env, 'rush', cmdPage, { entries }));
t('a command page is a spread: LEFT page (what, who, where it fits) and RIGHT page (how to use it)', /LEFT PAGE/i.test(spread) && /RIGHT PAGE/i.test(spread) && /What it is/.test(spread) && /Who can use it/.test(spread) && /Choose one/.test(spread) && /How to use it|Choose one|What you can fill in/.test(spread));
t('purpose, access and a guide are on the page for a command', /Where it fits/.test(txt(bookMessage(env, 'rush', pagesFor('rush').findIndex((p) => p.name === 'rush'), { entries }))) && /Everyone|Managers|Owner only/.test(spread));
t('the contents page lists the bot, who it is for and how to read the book', /Who it is for/.test(txt(bookMessage(env, 'stats', 0, { entries }))) && /How to read this book/.test(txt(bookMessage(env, 'stats', 0, { entries }))));
const btn = (m, label) => JSON.parse(JSON.stringify(m)).components[0].components.flatMap(function f(c) { return c.components ? c.components.flatMap(f) : [c]; }).find((c) => c.label === label);
const mid = bookMessage(env, 'tools', 4, { entries });
t('Back is off on page 1 and Next is off on the last page; a middle page has both', btn(bookMessage(env, 'tools', 0, { entries }), 'Back').disabled === true && btn(bookMessage(env, 'tools', pagesFor('tools').length - 1, { entries }), 'Next').disabled === true && !btn(mid, 'Back').disabled && !btn(mid, 'Next').disabled);
t('the hub offers all five bots and the right page explains the ways in', BOT_KEYS.every((k) => ids(bookMessage(env, 'hub')).some((x) => x.startsWith(`norex:wiki:${k}:0`))) && /question:/.test(txt(bookMessage(env, 'hub'))));

// ---------- the setup helper ----------
const coreSetup = pagesFor('core').findIndex((p) => p.name === 'setup');
const c = COMMANDS.find((x) => x.name === 'setup'), subs = subsOf(c);
t('the helper offers every subcommand, and its line carries the required fields', subs.length > 2 && /^\/setup /.test(composeCommand(c, subs[0], [])));
const ch = subs.findIndex((s) => s.name === 'channel'), chSub = subs[ch];
const required = (chSub?.options ?? []).filter((o) => o.required).map((o) => o.name);
t('the line is built the way Discord needs it: /command sub field:‹value›, required fields always, optional ones when picked', required.every((r) => composeCommand(c, chSub, []).includes(` ${r}:`)) && (chSub.options.filter((o) => !o.required)[0] ? composeCommand(c, chSub, [chSub.options.filter((o) => !o.required)[0].name]).split(':').length > composeCommand(c, chSub, []).split(':').length : true));
const first = bookMessage(env, 'core', coreSetup, { view: 's', entries });
t('the helper view shows the subcommand list, no field list until one is chosen, and a way back to the page', ids(first).some((x) => x.endsWith(':u')) && !ids(first).some((x) => /:o:/.test(x)) && !!btn(first, 'Back to the page'));
const picked = bookMessage(env, 'core', coreSetup, { view: 's', sub: ch, picks: [], entries });
t('after a subcommand is chosen, the optional fields can be picked and the command line is on the right page', /\/setup channel/.test(txt(picked)) && ids(picked).some((x) => x === `norex:wiki:core:${coreSetup}:o:${ch}`));
t('both lists stay inside Discord limits (25 options, unique ids)', count({ components: picked.components }) <= 40 && new Set(ids(picked)).size === ids(picked).length);
t('a command with nothing to fill in has no helper button', (() => { const none = pagesFor('stats').find((p) => p.kind === 'command' && !(COMMANDS.find((x) => x.name === p.name).options ?? []).length); return !none || !btn(bookMessage(env, 'stats', pagesFor('stats').indexOf(none), { entries }), 'Setup helper'); })());

// ---------- the Q&A is the navigator's wiki plus the guides ----------
t('guide steps become questions, and commands answer "what does it do"', flowEntries().length >= 8 && entries.some((e) => /^What does \/rush do/.test(e.q)));
t('a question finds its answer', /log/i.test(txt(answerMessage(env, 'how do I log a rush game', entries))) && /\/rush log/.test(txt(answerMessage(env, 'how do I log a rush game', entries))));
t('an unknown question says so and points to the book', /couldn't find/.test(txt(answerMessage(env, 'zzzqqq', entries))));

// ---------- through the Worker ----------
const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
env.DISCORD_PUBLIC_KEY = Buffer.from(await crypto.subtle.exportKey('raw', kp.publicKey)).toString('hex');
env.FEATURES = JSON.stringify({ ...JSON.parse(env.FEATURES), wiki: 'members' });
async function send(payload, e = env) {
  const body = JSON.stringify(payload), ts = String(Date.now());
  const sig = Buffer.from(await crypto.subtle.sign('Ed25519', kp.privateKey, new TextEncoder().encode(ts + body))).toString('hex');
  const res = await worker.fetch(new Request('https://bot/', { method: 'POST', body, headers: { 'X-Signature-Ed25519': sig, 'X-Signature-Timestamp': ts } }), e, { waitUntil: () => {} });
  return { s: res.status, d: await res.json().catch(() => null) };
}
const MEMBER = { member: { user: { id: '500', username: 'Ash' }, roles: [] }, channel_id: 'c1', token: 'tok' };
await tt('/wiki opens the hub, privately', async () => { const r = await send({ type: 2, ...MEMBER, data: { name: 'wiki' } }); return r.d.type === 4 && (r.d.data.flags & 64) === 64 && /Which bot/.test(txt(r.d.data)); });
await tt('/wiki bot:rush opens that chapter', async () => { const r = await send({ type: 2, ...MEMBER, data: { name: 'wiki', options: [{ name: 'bot', value: 'rush' }] } }); return /Phoenix Rush/.test(txt(r.d.data)); });
await tt('/wiki question: answers from the book', async () => { const r = await send({ type: 2, ...MEMBER, data: { name: 'wiki', options: [{ name: 'question', value: 'how do I log a rush game' }] } }); return /\/rush log/.test(txt(r.d.data)); });
await tt('a page button updates the same message in place (type 7)', async () => { const r = await send({ type: 3, ...MEMBER, data: { custom_id: 'norex:wiki:stats:2:n', component_type: 2 } }); return r.d.type === 7 && /Page 3 of/.test(txt(r.d.data)); });
await tt('the jump list, the setup helper and its lists all answer', async () => {
  const j = await send({ type: 3, ...MEMBER, data: { custom_id: 'norex:wiki:tools:j', component_type: 3, values: ['3'] } });
  const s = await send({ type: 3, ...MEMBER, data: { custom_id: `norex:wiki:core:${coreSetup}:s`, component_type: 2 } });
  const u = await send({ type: 3, ...MEMBER, data: { custom_id: `norex:wiki:core:${coreSetup}:u`, component_type: 3, values: [String(ch)] } });
  const o = await send({ type: 3, ...MEMBER, data: { custom_id: `norex:wiki:core:${coreSetup}:o:${ch}`, component_type: 3, values: [] } });
  return j.d.type === 7 && /Page 4 of/.test(txt(j.d.data)) && /Setup helper/.test(txt(s.d.data)) && /\/setup channel/.test(txt(u.d.data)) && /\/setup channel/.test(txt(o.d.data));
});
await tt('with the flag on, /corehelp opens the book on Core; with it off, the old help menu', async () => {
  const on = await send({ type: 2, ...MEMBER, data: { name: 'corehelp' } });
  const e = { ...env, FEATURES: JSON.stringify({ ...JSON.parse(env.FEATURES), wiki: 'off' }) };
  const off = await send({ type: 2, ...MEMBER, data: { name: 'corehelp' } }, e);
  return ids(on.d.data).some((x) => x.startsWith('norex:wiki:core:')) && ids(off.d.data).some((x) => x.startsWith('norex:help:core:'));
});
await tt('flag off: /wiki and its buttons are locked', async () => {
  const e = { ...env, FEATURES: JSON.stringify({ ...JSON.parse(env.FEATURES), wiki: 'off' }) };
  const a = await send({ type: 2, ...MEMBER, data: { name: 'wiki' } }, e), b = await send({ type: 3, ...MEMBER, data: { custom_id: 'norex:wiki:hub:0:h', component_type: 2 } }, e);
  return /Not switched on/.test(txt(a.d.data)) && /Not switched on/.test(txt(b.d.data));
});

// ---------- definitions, config, branding ----------
const src = fs.readFileSync(new URL('../bot/wikibook.js', import.meta.url), 'utf8');
const wiki = COMMANDS.find((x) => x.name === 'wiki');
t('/wiki is a tools command with a bot choice and a question; the flag ships owner-only', APP_COMMANDS.tools.includes('wiki') && wiki?.options?.[0]?.choices?.length === 5 && wiki.options[1].name === 'question' && JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url), 'utf8')).features.wiki === 'owner');
const all = ['hub', ...BOT_KEYS].flatMap((k) => (k === 'hub' ? [0] : pagesFor(k).map((_, n) => n)).map((n) => JSON.stringify(bookMessage(env, k, n, { entries })).replace(/norex:wiki:[a-z0-9:-]+/g, '')));
t('no NOREX name, NOREX red or NOREX crest anywhere in the book, and the ember accent is steel/Phoenix', all.every((s) => !/norex|c8352c|080b11/i.test(s)) && !/norex(?!:wiki)/i.test(src.replace(/norex:wiki/g, '')) && !/c8352c/i.test(src));
t('the book names no channel or ID in code and writes nothing twice (guides come from help.js, Q&A from the navigator)', !/\b\d{17,20}\b/.test(src) && /from '.\/help.js'/.test(src) && /from '.\/navigator.js'/.test(src));
done();
