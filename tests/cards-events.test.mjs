// The match-night pictures drawn at build time (scripts/cards-events.mjs): lineup pitches and the check-in banner, in Phoenix colours.
import fs from 'node:fs';
import { eventJobs, lineupCard, checkinBanner, lineupSlug } from '../scripts/cards-events.mjs';
import { cardJobs, BANNERS } from '../scripts/cards.mjs';
import { FORMATIONS } from '../bot/events.js';
import { lineupUrl } from '../bot/ui.js';
import { t, done } from './lib.mjs';

const jobs = eventJobs();
t('one pitch per formation from eventJobs', jobs.length === Object.keys(FORMATIONS).length);
const all = cardJobs({ matches: [], name: 'PHOENIX FIRE' }, []);
t('the check-in banner is a BANNERS entry and gets exactly one job (banner-checkin.png)', typeof BANNERS.checkin === 'function' && all.filter((j) => j.file === 'banner-checkin.png').length === 1);
t('brand: BANNERS.checkin renders the same Phoenix banner', BANNERS.checkin() === checkinBanner());
t('cards.mjs includes them in its job list', cardJobs({ matches: [], name: 'PHOENIX FIRE' }, []).filter((j) => j.key[0] === 'lineup').length === Object.keys(FORMATIONS).length);
t('file names match the URLs the bot builds', lineupUrl({ SITE_URL: 'https://x/' }, '4-3-3').includes(`cards/${jobs.find((j) => j.key[1] === '4-3-3').file}`) && lineupSlug('4-2-3-1') === '4-2-3-1');
const crestB64 = fs.readFileSync(new URL('../phoenix/overlay/crest-sm.png', import.meta.url)).toString('base64').slice(0, 60);
for (const [name, html] of [['pitch 4-3-3', lineupCard('4-3-3')], ['check-in banner', checkinBanner()]]) {
  t(`brand: ${name} is Phoenix – name, ember accent, overlay crest`, /PHOENIX FIRE/i.test(html) && html.includes('#e8651a') || html.includes('232,101,26'));
  t(`brand: ${name} carries the Phoenix crest from phoenix/overlay`, html.includes(crestB64));
  t(`brand: ${name} has no NOREX name, red or blue-black`, !/norex|#c8352c|#080b11|200,53,44/i.test(html));
}
t('the pitch shows every slot of the shape', (lineupCard('4-3-3').match(/text-anchor="middle"/g) ?? []).length === FORMATIONS['4-3-3'].length);
t('the banner carries the motto from config', /Rise\. Burn\. Repeat\./.test(checkinBanner()));
done();
