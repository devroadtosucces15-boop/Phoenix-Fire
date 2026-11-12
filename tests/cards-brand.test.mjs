// Card art and banners must be Phoenix-themed, every banner the bot links must be drawn, and Discord-bad picture URLs are dropped.
import fs from 'node:fs';
import { t, done } from './lib.mjs';
import { TEMPLATE_VERSION, BANNERS, clubCard } from '../scripts/cards.mjs';
import { BANNER_V, header, thumb } from '../bot/ui.js';

const src = fs.readFileSync(new URL('../scripts/cards.mjs', import.meta.url), 'utf8');
t('card template has no NOREX red or blue-black', !/#c8352c|#080b11|200,\s*53,\s*44|#e0493f/i.test(src));
t('card template uses the Phoenix accent', src.includes('#e8651a') && src.includes('#0a0705'));
t('BANNER_V matches TEMPLATE_VERSION', BANNER_V === TEMPLATE_VERSION);

for (const n of ['channel', 'onair']) t(`banner "${n}" is drawn (stream alerts link it)`, typeof BANNERS[n] === 'function');
for (const [n, f] of Object.entries(BANNERS)) t(`banner "${n}" renders without NOREX colours`, !/c8352c|080b11|200,53,44/i.test(f()));
t('stream alerts only link banners that exist', [...fs.readFileSync(new URL('../bot/streamalerts.js', import.meta.url), 'utf8').matchAll(/bannerUrl\(env, [^']*'(\w+)'/g)].every((m) => BANNERS[m[1]]));

t('cards draw the Phoenix crest from the overlay, not site/assets', src.includes("phoenix/overlay/crest-sm.png"));
t('the merged match picture and review are drawn by cardJobs', /matchPicture\(\{ \.\.\.pic\.model/.test(src) && /reviewCard\(model, club\)/.test(src));

const data = 'data:image/svg+xml,%3Csvg%3E';
t('header drops a data: picture', !JSON.stringify(header({ title: 'x', thumb: data })).includes('data:'));
t('thumb drops a data: picture', thumb(data) === null);
t('header keeps an https picture', JSON.stringify(header({ title: 'x', thumb: 'https://e.test/a.png' })).includes('https://e.test/a.png'));
done();
