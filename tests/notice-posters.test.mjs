// Section 9 (buttons, menus, notices): every notice kind has a compact drawn Phoenix picture, and the shared reply helper sends the right one
// without touching the message's buttons, menus or modals.
import fs from 'node:fs';
import { BANNERS, NOTICES, noticePicture, TEMPLATE_VERSION } from '../scripts/cards.mjs';
import { BANNER_V, images, notice, privateNote, withNotice, noticeKind, message, header, text, footer, buttons, cards, plainText } from '../bot/ui.js';
import { BANNER_SPEC, NOTICE_KINDS, noticeKindFor, noticeBanner } from '../bot/banners.js';
import { channelNotice } from '../bot/orgconfig.js';
import { t, done } from './lib.mjs';

const NOREX = /norex|c8352c|080b11/i;
const env = { SITE_URL: 'https://x.test/' };
t('nine notice kinds', NOTICE_KINDS.length === 9 && Object.keys(NOTICES).length === 9);
t('versions bumped together', BANNER_V === TEMPLATE_VERSION && BANNER_V >= 14);

// (a) every kind: a drawn picture, a banner entry with alt text, compact, Phoenix
for (const k of NOTICE_KINDS) {
  const key = noticeBanner(k), h = BANNERS[key]?.();
  t(`${key}: registered, alt text, drawn`, typeof BANNERS[key] === 'function' && NOTICES[key] && BANNER_SPEC[key]?.title && h === noticePicture(key));
  t(`${key}: compact strip, Phoenix orange and crest, no NOREX`, /body\{height:150px\}/.test(h) && /e8651a/i.test(h) && /<img class="wm" src="data:image\/png/.test(h) && !NOREX.test(h));
}
t('unknown kind falls back to info', noticeBanner('nope') === 'notice-info');

// (b) the kind comes from the words and the stripe
const kinds = [
  ['Managers only', 'steel', 'locked'], ['This isn’t switched on yet', 'steel', 'locked'], ['The member database isn’t connected', 'steel', 'notconfigured'],
  ['No channel is set for awards', 'steel', 'notconfigured'], ['That button has expired', 'steel', 'expired'], ['Slow down – try again in 30 seconds', 'steel', 'cooldown'],
  ['Nothing here yet', 'steel', 'empty'], ['Something went wrong', 'loss', 'error'], ['Saved', 'win', 'success'], ['FYI', 'steel', 'info'], ['Careful', 'gold', 'warning'],
];
for (const [w, tone, k] of kinds) t(`"${w}" → ${k}`, noticeKindFor(w, tone) === k);

// (c) the shared helper sends one picture, first, and only for a short private notice
const n = withNotice(notice('Managers only', 'Ask a manager.'), env);
t('a notice gets its strip first', images(n).length === 1 && images(n)[0].includes(`banner-notice-locked.png?v=${BANNER_V}`) && n.components[0].components[0].type === 12);
t('privateNote (the one-line helper) gets one too', images(withNotice(privateNote('⚠️ Something went wrong').data, env))[0]?.includes('banner-notice-error.png'));
t('no SITE_URL, no picture, no crash', images(withNotice(notice('Managers only'), {})).length === 0);
t('a message with its own picture keeps it', images(withNotice(message({ accent: 'red', blocks: [cards('https://x.test/a.png'), text('hi')], ephemeral: true }), env)).join() === 'https://x.test/a.png');
t('a headed panel is not a notice', noticeKind(message({ accent: 'red', ephemeral: true, blocks: [header({ title: 'T' }), text('b')] })) === null);
t('a public message is not a notice', noticeKind(message({ accent: 'steel', blocks: [text('**Done**')] })) === null);

// (d) a component reply keeps its custom ids, labels and select menus exactly
const select = { type: 1, components: [{ type: 3, custom_id: 'norex:fun:pick', placeholder: 'Pick one', options: [{ label: 'A', value: 'a' }] }] };
const comp = message({ accent: 'steel', ephemeral: true, blocks: [text('**Too late**\nThis vote has closed.'), ...buttons([{ label: 'Try again', id: 'norex:ev:retry' }, { label: 'Open', url: 'https://a.b' }]), select] });
const ids = (m) => JSON.stringify(m).match(/"custom_id":"[^"]+"/g) ?? [];
const wrapped = withNotice(comp, env);
t('custom ids unchanged', JSON.stringify(ids(wrapped)) === JSON.stringify(ids(comp)) && ids(comp).length === 2);
t('labels, link button and menu unchanged', plainText(wrapped).replace(/\n/g, ' ') === plainText(comp).replace(/\n/g, ' ') && JSON.stringify(wrapped).includes('"placeholder":"Pick one"') && JSON.stringify(wrapped).includes('https://a.b'));
t('flags, accent and mentions unchanged', wrapped.flags === comp.flags && wrapped.components[0].accent_color === comp.components[0].accent_color && JSON.stringify(wrapped.allowed_mentions) === JSON.stringify(comp.allowed_mentions));
t('it was read as expired', images(wrapped)[0].includes('banner-notice-expired.png'));

// (e) a missing channel is reported from the Organization config, never guessed
const db = (rows) => ({ prepare: () => ({ bind: () => ({ all: async () => ({ results: rows }), first: async () => null }) }) });
const none = await channelNotice({ ...env, DB: db([]) }, 'awards');
t('no channel: says so and where to set it', /No channel is set for awards/.test(plainText(none)) && /Boardroom/.test(plainText(none)) && images(none)[0].includes('banner-notice-notconfigured.png') && !/<#\d/.test(plainText(none)));
const some = await channelNotice({ ...env, DB: db([{ channel_id: '123456789012345678', scope_type: 'org' }]) }, 'awards');
t('a channel it names comes from the config rows', plainText(some).includes('<#123456789012345678>'));
const src = fs.readFileSync('bot/banners.js', 'utf8') + fs.readFileSync('bot/ui.js', 'utf8') + fs.readFileSync('bot/orgconfig.js', 'utf8').split('export async function channelNotice')[1].split('\n}\n')[0];
t('no channel or role id in the notice code', !/\b\d{17,20}\b/.test(src));
done();
