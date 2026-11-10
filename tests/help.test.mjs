// Per-bot help menus (bot/help.js) and the merged-command shim (bot/merged.js).
import { env } from './mock.mjs';
import { t, tt, done } from './lib.mjs';
import worker from '../bot/worker.js';
import { HELP_COMMANDS, HELP_BUTTON, helpMessage, helpButton, helpCommand, pagesFor } from '../bot/help.js';
import { COMMANDS, APP_COMMANDS, STAFF_COMMANDS } from '../bot/commanddefs.js';
import { unalias } from '../bot/merged.js';
import { plainText } from '../bot/ui.js';

const KEYS = ['core', 'stats', 'tools', 'matchday', 'rush'];
const count = (n) => (n.components ? 1 + n.components.reduce((s, c) => s + count(c), 0) : 1);
const chars = (n) => (n.content ? n.content.length : 0) + (n.components ?? []).reduce((s, c) => s + chars(c), 0);
const ids = (m) => [...JSON.stringify(m).matchAll(/"custom_id":"([^"]+)"/g)].map((x) => x[1]);

// ---------- one help command per bot ----------
t('five help commands, one per bot, each on its own bot', KEYS.every((k) => APP_COMMANDS[k].filter((n) => HELP_COMMANDS[n] === k).length === 1) && Object.keys(HELP_COMMANDS).length === 5);
t('each help name carries its bot and the word help', Object.keys(HELP_COMMANDS).every((n) => /help$/.test(n) && n.startsWith(HELP_COMMANDS[n].slice(0, 4))));
t('help commands are registered and open to everyone', Object.keys(HELP_COMMANDS).every((n) => COMMANDS.some((c) => c.name === n) && !STAFF_COMMANDS.includes(n)));

// ---------- every page fits Discord and navigates ----------
for (const k of KEYS) {
  const pages = pagesFor(k);
  t(`${k}: a contents page, then guides, then every command`, pages[0].kind === 'contents' && pages.some((p) => p.kind === 'flows') && APP_COMMANDS[k].filter((n) => !(n in HELP_COMMANDS)).every((n) => pages.some((p) => p.name === n)));
  const bad = [];
  pages.forEach((_, n) => {
    const m = helpMessage(k, n);
    const root = { components: m.components };
    if ((m.flags & 64) !== 64 || (m.flags & (1 << 15)) === 0) bad.push(`${n}: not private v2`);
    if (count(root) > 40) bad.push(`${n}: ${count(root)} components`);
    if (chars(root) > 4000) bad.push(`${n}: ${chars(root)} characters`);
    const i = ids(m); if (new Set(i).size !== i.length) bad.push(`${n}: duplicate ids`);
    if (i.some((x) => !HELP_BUTTON.test(x))) bad.push(`${n}: odd id`);
  });
  t(`${k}: every page is private, under 40 components, under 4000 characters, unique ids`, bad.length === 0 || (console.log(bad), false));
  t(`${k}: the list can reach every page (max 25)`, pages.length <= 25);
}
const first = helpMessage('stats', 0), mid = helpMessage('stats', 3), last = helpMessage('stats', pagesFor('stats').length - 1);
const btn = (m, label) => JSON.parse(JSON.stringify(m)).components[0].components.flatMap(function f(c) { return c.components ? c.components.flatMap(f) : [c]; }).find((c) => c.label === label);
t('first page: Back is off, Next is on', btn(first, 'Back').disabled === true && !btn(first, 'Next').disabled);
t('last page: Next is off, Back is on', btn(last, 'Next').disabled === true && !btn(last, 'Back').disabled);
t('a middle page has Back, Next, Contents, Step by step and Other bots', ['Back', 'Next', 'Contents', 'Step by step', 'Other bots'].every((l) => btn(mid, l)));
const nxt = helpButton({ data: { custom_id: btn(mid, 'Next').custom_id } });
t('Next updates the same message in place (type 7) to the following page', nxt.type === 7 && JSON.stringify(nxt.data) === JSON.stringify(helpMessage('stats', 4)));
t('Back and Next are inverses', JSON.stringify(helpButton({ data: { custom_id: btn(helpMessage('stats', 4), 'Back').custom_id } }).data) === JSON.stringify(helpMessage('stats', 3)));
t('the list jumps to the chosen page', JSON.stringify(helpButton({ data: { custom_id: 'norex:help:tools:j', values: ['5'] } }).data) === JSON.stringify(helpMessage('tools', 5)));
t('Other bots opens the hub, and the hub opens any bot', /Which bot/.test(plainText(helpButton({ data: { custom_id: btn(mid, 'Other bots').custom_id } }).data)) && helpButton({ data: { custom_id: 'norex:help:hub:0' } }).data.components[0].components.some((c) => JSON.stringify(c).includes('norex:help:rush:0')));
t('a bad id is ignored', helpButton({ data: { custom_id: 'norex:help:nope:1' } }) === null);

// ---------- the guides are in the right order ----------
const flows = plainText({ components: helpMessage('rush', 1).components });
t('rush guide: log first, a manager confirms after', flows.indexOf('/rush log') < flows.indexOf('A manager confirms'));
const sc = plainText({ components: helpMessage('stats', 1).components });
t('stats guide: scan, then check, then save', sc.indexOf('/seasoncard scan') < sc.indexOf('Check the reading') && sc.indexOf('Check the reading') < sc.indexOf('Save my card'));
const md = plainText({ components: helpMessage('matchday', 1).components });
t('matchday guide: create, then who, then check in', md.indexOf('/matchday create') < md.indexOf('/matchday who') && md.indexOf('/matchday who') < md.indexOf('/matchday checkin'));
t('command pages come from the live definitions', /Choose one/.test(plainText({ components: helpMessage('rush', pagesFor('rush').findIndex((p) => p.name === 'queue')).components })) && /settings/.test(plainText({ components: helpMessage('rush', pagesFor('rush').findIndex((p) => p.name === 'queue')).components })));
t('no NOREX in help text', !/norex(?!:help)/i.test(JSON.stringify(KEYS.flatMap((k) => pagesFor(k).map((_, n) => helpMessage(k, n))).map((m) => JSON.stringify(m).replace(/norex:help:[a-z0-9:]+/g, '')))));

// ---------- through the Worker ----------
env.DISCORD_BOT_TOKEN = 'bot';
const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
env.DISCORD_PUBLIC_KEY = Buffer.from(await crypto.subtle.exportKey('raw', kp.publicKey)).toString('hex');
async function send(payload) {
  const body = JSON.stringify(payload), ts = String(Date.now());
  const sig = Buffer.from(await crypto.subtle.sign('Ed25519', kp.privateKey, new TextEncoder().encode(ts + body))).toString('hex');
  return (await worker.fetch(new Request('https://bot.example/', { method: 'POST', body, headers: { 'X-Signature-Ed25519': sig, 'X-Signature-Timestamp': ts } }), env, { waitUntil() {} })).json();
}
const as = { member: { user: { id: '900', username: 'u900' }, roles: [] }, channel_id: '700100', token: 'tok' };
await tt('/corehelp answers privately with the menu', async () => { const r = await send({ type: 2, data: { name: 'corehelp' }, ...as }); return r.type === 4 && (r.data.flags & 64) === 64 && /How Phoenix Core works/.test(plainText(r.data)); });
await tt('/rushhelp is not "not on this bot" on a single-app setup', async () => !/not on this bot/.test(plainText((await send({ type: 2, data: { name: 'rushhelp' }, ...as })).data)));
await tt('a help button through the Worker updates the message', async () => { const r = await send({ type: 3, data: { custom_id: 'norex:help:core:2:n', component_type: 2 }, ...as, message: { id: '1' } }); return r.type === 7 && /\/aispike|\/syncroles|Step by step/.test(plainText(r.data)); });

// ---------- the merge shim ----------
const o = (name, options) => ({ name, options });
const sub = (n, options = []) => ({ type: 1, name: n, options });
t('matchday schedule | next | who become the old commands', unalias(o('matchday', [sub('schedule')])).name === 'schedule' && unalias(o('matchday', [sub('next')])).name === 'nextevent' && unalias(o('matchday', [sub('who')])).name === 'availability');
t('matchday create | checkin | status are untouched', ['create', 'checkin', 'status'].every((s) => unalias(o('matchday', [sub(s)])).name === 'matchday'));
t('tag post → tag with its options; tag list/set/delete → tags with the sub', JSON.stringify(unalias(o('tag', [sub('post', [{ name: 'name', value: 'x' }])]))) === JSON.stringify(o('tag', [{ name: 'name', value: 'x' }])) && unalias(o('tag', [sub('set', [{ name: 'name', value: 'x' }])])).name === 'tags' && unalias(o('tag', [sub('list')])).options[0].name === 'list');
t('remind add → remind; remind list → reminders', unalias(o('remind', [sub('add', [{ name: 'in', value: '5m' }])])).options[0].name === 'in' && unalias(o('remind', [sub('list')])).name === 'reminders');
t('watch latest → watch; add/remove/list → watchlist with the sub', unalias(o('watch', [sub('latest')])).name === 'watch' && unalias(o('watch', [sub('add')])).name === 'watchlist' && unalias(o('watch', [sub('list')])).options[0].name === 'list');
t('renames: intel → insights, rushladder → board', unalias(o('intel')).name === 'insights' && unalias(o('rushladder', [sub('latest')])).name === 'board');
t('anything else passes through', unalias(o('club')).name === 'club' && unalias(undefined) === undefined);
done();
