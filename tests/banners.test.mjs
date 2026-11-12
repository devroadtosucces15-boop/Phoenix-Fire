// Every kind of message has a banner: a family for each command, button, DM type and post; each is drawn; the picture goes in under the header.
import { BANNER_SPEC, BANNER_BY_COMMAND, BANNER_BY_DM, BANNER_BY_COMPONENT, bannerForCommand, bannerForComponent, bannerForDm, bannerFromEyebrow } from '../bot/banners.js';
import { BANNERS } from '../scripts/cards.mjs';
import { COMMANDS } from '../bot/commanddefs.js';
import { TYPES } from '../bot/notify.js';
import { message, header, text, cards, notice, withBanner, autoBanner, images, bannerUrl, buttons } from '../bot/ui.js';
import { HELP_POSTER_KEYS, helpMessage, helpPosterModel } from '../bot/help.js';
import { boardMessage } from '../bot/rushqueue.js';
import { t, done } from './lib.mjs';

const env = { SITE_URL: 'https://x.test/' };
t('every family in the spec is drawn by cards.mjs', Object.keys(BANNER_SPEC).every((k) => typeof BANNERS[k] === 'function'));
t('every mapping points at a known family or a drawn banner', [...Object.values(BANNER_BY_COMMAND), ...Object.values(BANNER_BY_DM), ...BANNER_BY_COMPONENT.map((x) => x[1])].every((k) => BANNERS[k]));
t('every slash command has its own family (none falls to the general banner by accident)', COMMANDS.every((c) => c.name in BANNER_BY_COMMAND));
t('every notification type has a family', Object.keys(TYPES).every((k) => k in BANNER_BY_DM));
t('lookups', bannerForCommand('club') === 'club' && bannerForComponent('pf:rq:join') === 'queue' && bannerForDm('award') === 'dm-award' && bannerFromEyebrow('PHOENIX FIRE · Rush queue') === 'queue' && bannerForCommand('nope') === 'general');

const panel = () => message({ accent: 'red', blocks: [header({ eyebrow: 'Phoenix · Club', title: 'T', sub: 's' }), text('body'), buttons([{ label: 'Go', id: 'x' }])] });
const withPic = withBanner(panel(), bannerUrl(env, 'club'), 'Club');
t('the banner goes in right under the header', images(withPic).length === 1 && JSON.stringify(withPic.components[0].components.map((c) => c.type)) === '[10,12,10,1]');
t('a message with a picture of its own keeps it, no second picture', images(withBanner(message({ accent: 'red', blocks: [header({ title: 'T' }), cards('https://x.test/a.png')] }), bannerUrl(env, 'club'))).join() === 'https://x.test/a.png');
t('a one-line notice stays compact', images(withBanner(notice('No'), bannerUrl(env, 'club'))).length === 0);
t('no site URL, no banner, no crash', images(withBanner(panel(), bannerUrl({}, 'club'))).length === 0);
t('autoBanner picks the family from the header label', images(autoBanner(env, message({ accent: 'red', blocks: [header({ eyebrow: 'Phoenix · Rush queue', title: 'T' })] }))).some((u) => u.includes('banner-queue.png')));
t('banners are drawn Phoenix, not NOREX', Object.values(BANNERS).every((f) => !/norex|c8352c|080b11/i.test(f())) && /Rise\. Burn\. Repeat\./.test(BANNERS.general()));

// ----- help and queue posters -----
t('a help poster is drawn for every bot and the hub', HELP_POSTER_KEYS.every((k) => typeof BANNERS[`help-${k}`] === 'function') && HELP_POSTER_KEYS.length === 6);
t('the poster lists the live commands of the bot', helpPosterModel('rush').cmds.some((c) => c.name === '/queue') && helpPosterModel('stats').cmds.every((c) => c.desc.length > 0));
t('help posters carry Phoenix branding and no NOREX', HELP_POSTER_KEYS.every((k) => { const h = BANNERS[`help-${k}`](); return !/norex|c8352c|080b11/i.test(h) && /Phoenix|PHOENIX/i.test(h); }));
t('the help contents page shows the poster, a command page does not', images(helpMessage('stats', 0, env)).some((u) => u.includes('banner-help-stats.png')) && !images(helpMessage('stats', 2, env)).some((u) => u.includes('banner-help-stats.png')));
t('the queue board shows the how-it-works poster, and no second banner', (() => { const u = images(boardMessage([], { poster: bannerUrl(env, 'queueflow') })); return u.length === 1 && u[0].includes('banner-queueflow.png'); })());
t('the queue poster is drawn Phoenix', typeof BANNERS.queueflow === 'function' && !/norex|c8352c/i.test(BANNERS.queueflow()) && /Rush queue/i.test(BANNERS.queueflow()));
done();
