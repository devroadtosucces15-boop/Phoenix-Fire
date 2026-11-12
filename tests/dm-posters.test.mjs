// Section 8 (DMs): every notification type carries its own drawn Phoenix picture through the one DM builder (bot/notify.js deliverDMs).
import fs from 'node:fs';
import { BANNERS, DMS, TEMPLATE_VERSION } from '../scripts/cards.mjs';
import { BANNER_V, images } from '../bot/ui.js';
import { BANNER_SPEC, BANNER_BY_DM, bannerForDm } from '../bot/banners.js';
import { TYPES, deliverDMs } from '../bot/notify.js';
import { message, header, text, footer, buttons } from '../bot/ui.js';
import { t, done } from './lib.mjs';

const NOREX = /norex|c8352c|080b11/i;
const types = Object.keys(TYPES);
t('27 notification types', types.length === 27);
t('versions bumped together', BANNER_V === TEMPLATE_VERSION && BANNER_V >= 13);

// (a) every type resolves to a registered picture with alt text
t('every type has its own dm picture, drawn and with alt text', types.every((k) => bannerForDm(k) === `dm-${k}` && typeof BANNERS[`dm-${k}`] === 'function' && DMS[`dm-${k}`] && BANNER_SPEC[`dm-${k}`]?.title));
t('no stray dm pictures', Object.keys(DMS).length === types.length && Object.keys(BANNER_BY_DM).length === types.length);
t('every type has its own title and a tag', new Set(Object.values(DMS).map((d) => d.title)).size === types.length && Object.values(DMS).every((d) => d.tag));

// (b) Phoenix orange, Phoenix crest, no NOREX
for (const k of types) {
  const h = BANNERS[`dm-${k}`]();
  t(`dm-${k}: Phoenix orange, Phoenix crest, tag, no NOREX name or colour`, !NOREX.test(h) && /e8651a/i.test(h) && /<img class="wm" src="data:image\/png/.test(h) && h.includes(`class="tag">${DMS[`dm-${k}`].tag}`));
}

// (c) the built DM keeps its custom ids (none), link button and accent
const sent = [];
const rows = types.map((type, i) => ({ id: i + 1, user_id: '500', type, icon: TYPES[type].icon, title: `Title ${type}`, body: 'Body', link: 'members.html#alerts', ack: type === 'announce' ? 1 : 0, reminders: 0, at: 1700000000000, dm_channel: 'c1' }));
const stmt = (sql) => ({ bind: () => ({ all: async () => ({ results: /FROM notifications/.test(sql) ? rows : [] }), run: async () => ({}), first: async () => null }) });
const env = { DB: { prepare: stmt }, DISCORD_BOT_TOKEN: 'x', SITE_URL: 'https://x.test/', ORG_NAME: 'Phoenix Fire' };
const real = globalThis.fetch;
globalThis.fetch = async (url, init) => { sent.push(JSON.parse(init.body)); return Response.json({ id: 'm' }); };
const r = await deliverDMs(env, 50);
globalThis.fetch = real;
t('all 27 DMs went through the one builder', r.sent === 27 && sent.length === 27);
const ACCENT = { live: 'win', award: 'gold', card: 'gold', predict: 'gold', moderation: 'loss', queue: 'steel', storage: 'steel', test: 'steel' };
const flat = (c) => [c, ...(c.components ?? []).flatMap(flat)];
sent.forEach((m, i) => {
  const type = types[i], all = flat({ components: m.components }), j = JSON.stringify(m);
  const btn = all.find((c) => c.type === 2);
  t(`${type}: picture right under the header, own picture`, images(m).length === 1 && images(m)[0].includes(`banner-dm-${type}.png?v=${BANNER_V}`));
  const shape = m.components[0].components.map((c) => (c.type === 10 ? (/\n#{1,3} /.test(c.content) ? 'header' : c.content.startsWith('-# ') ? 'footer' : 'text') : c.type === 12 ? 'picture' : c.type === 1 ? 'buttons' : c.type)).join();
  t(`${type}: one layout, picture, header, body, footer, buttons`, shape === 'header,picture,text,footer,buttons');
  t(`${type}: "Open on the site" link button only, no custom_id`, all.filter((c) => c.type === 2).length === 1 && btn?.style === 5 && btn.label === 'Open on the site' && btn.url === 'https://x.test/members.html#alerts' && !/custom_id/.test(j));
  t(`${type}: DM accent kept (${ACCENT[type] ?? 'red'})`, m.components[0].accent_color === message({ accent: ACCENT[type] ?? 'red', blocks: [header({ title: 'x' }), text('y'), footer('z'), buttons([{ label: 'a', url: 'https://a.b' }])] }).components[0].accent_color);
  t(`${type}: no NOREX in the DM`, !NOREX.test(j));
});
t('announce still asks to acknowledge', JSON.stringify(sent[0]).includes('Got it'));

// (d) no channel or role ids in the DM code
const src = fs.readFileSync('bot/notify.js', 'utf8') + fs.readFileSync('bot/banners.js', 'utf8');
t('no channel or role id in the DM code', !/\b\d{17,20}\b/.test(src) && !/discord_channels|discord_roles|ROLE_ID|CHANNEL_ID/.test(fs.readFileSync('bot/notify.js', 'utf8')));
t('the DM goes to the member\'s own dm_channel from notify_prefs', /dm_channel/.test(fs.readFileSync('bot/notify.js', 'utf8')));
done();
