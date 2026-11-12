// Step 5: no NOREX red as a fallback. Colours come from config.json brand (Phoenix).
import fs from 'node:fs';
import { loadBotSettings } from '../scripts/lib.mjs';
import { t, done } from './lib.mjs';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const config = JSON.parse(read('config.json'));
const realLog = console.warn; console.warn = () => {};
delete process.env.DISCORD_CLIENT_SECRET;
const s = await loadBotSettings(config); // no secret → the "none" defaults
console.warn = realLog;
t('bot settings fall back to the Phoenix accent from config', s.color === config.brand.red.replace('#', '') && s.color.toLowerCase() === 'e8651a');
t('a config with no brand does not invent a colour', (await loadBotSettings({})).color === '');
t('scripts/lib.mjs no longer names the NOREX red', !/c8352c/i.test(read('scripts/lib.mjs')));
t('scripts/build.mjs no longer names the NOREX red or its blue-black', !/c8352c|0b0f16|080b11/i.test(read('scripts/build.mjs')));
t('the build refuses to run without brand colours', /brand\.red and brand\.ink are required/.test(read('scripts/build.mjs')));
done();
