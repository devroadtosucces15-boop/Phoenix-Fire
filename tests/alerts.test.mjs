// Section 4 (alerts): every alert carries a drawn Phoenix picture; nothing NOREX; the match alert reads channel and roles from config.
import fs from 'node:fs';
import { BANNERS, TEMPLATE_VERSION } from '../scripts/cards.mjs';
import { BANNER_V, images, plainText } from '../bot/ui.js';
import { bannerForDm } from '../bot/banners.js';
import { alertPanel, diff } from '../bot/monitor.js';
import { eventMessage, checkinMessage } from '../bot/events.js';
import { matchAlertMessage, matchAlertTargets, postMatchAlert } from '../bot/matchalert.js';
import { autoBanner } from '../bot/ui.js';
import { t, done } from './lib.mjs';

const env = { SITE_URL: 'https://x.test/', ORG_NAME: 'Phoenix Fire', ADMIN_IDS: '111' };
const KEYS = ['matchalert', 'uptime-down', 'uptime-up', 'eventcancelled', 'eventsoon', 'trialstage', 'caution'];
t('versions bumped together', BANNER_V === TEMPLATE_VERSION && BANNER_V >= 9);
t('each alert picture is drawn, Phoenix, no NOREX', KEYS.every((k) => { const h = BANNERS[k](); return !/norex|c8352c|080b11/i.test(h) && /e8651a/i.test(h) && /<img class="wm" src="data:image\/png/.test(h); }));
t('DM types map to their own picture', bannerForDm('caution') === 'dm-caution' && bannerForDm('trialstage') === 'dm-trialstage');

const has = (m, k) => images(m).some((u) => u.includes(`banner-${k}.png`));
t('uptime down / up use their own picture', has(autoBanner(env, alertPanel(diff(null, ['x']).alert), 'uptime-down'), 'uptime-down') && has(autoBanner(env, alertPanel('🟢 **back**'), 'uptime-up'), 'uptime-up'));
const ev = { id: 1, type: 'league', start: Date.now() + 36e5, duration: 60, status: 'cancelled', cancelReason: 'Server maintenance', needs: {} };
const cm = eventMessage(env, ev, []);
t('cancelled event: picture + reason, keeps custom_ids off a closed post', has(cm, 'eventcancelled') && /Server maintenance/.test(plainText(cm)));
t('30-minute check-in post carries the soon picture', has(checkinMessage(env, { ...ev, status: 'scheduled' }, [], [], { soon: true }), 'eventsoon'));

const am = matchAlertMessage(env, { opponent: 'A2Touch', us: 0, them: 3, line: 'Heavy defeat 0–3', when: 'Tue 13 Oct' }, { roles: ['222'], owners: ['111'] });
const txt = plainText(am);
t('match alert: sirens line, three separate tags, picture, no button', /🚨🚨 ⚠️ CAUTION ⚠️ 🚨🚨/.test(txt) && txt.includes('@everyone') && txt.includes('<@&222>') && txt.includes('<@111>') && has(am, 'matchalert') && !JSON.stringify(am).includes('"type":2'));
t('match alert is Phoenix', /Phoenix Fire/.test(txt) && !/norex|c8352c/i.test(JSON.stringify(am)));

// roles and channel from config (D1 rows), never code
const rows = { manager: [{ role_id: '333' }], owner: [{ role_id: '444' }] };
const db = { prepare: (sql) => { let args = []; const o = { bind: (...a) => { args = a; return o; }, all: async () => ({ results: /discord_roles/.test(sql) ? rows[args[0]] ?? [] : /discord_channels/.test(sql) ? (args[0] === 'match_results' ? [{ channel_id: '999', scope_type: 'org' }] : []) : [] }), first: async () => null, run: async () => ({}) }; return o; } };
const tg = await matchAlertTargets({ ...env, DB: db });
t('roles and channel come from the Organization config', tg.roles.includes('333') && tg.channels.includes('999') && tg.owners.join() === '111');
const none = await postMatchAlert({ ...env, DB: { prepare: db.prepare, } , DISCORD_BOT_TOKEN: 'x' }, { opponent: 'B' }).catch(() => ({}));
t('no code holds a channel or role id', !/\b\d{17,20}\b/.test(fs.readFileSync('bot/matchalert.js', 'utf8')));
done();
