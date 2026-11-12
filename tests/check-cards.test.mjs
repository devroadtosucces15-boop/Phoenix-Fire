// The card step may not block the site, but a run with no manifest must go red: scripts/check-cards.mjs and update.yml wiring.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { t, done } from './lib.mjs';
import { checkCards } from '../scripts/check-cards.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-'));
t('no manifest fails', checkCards(dir).length === 1);
fs.mkdirSync(path.join(dir, 'api')); fs.mkdirSync(path.join(dir, 'cards'));
fs.writeFileSync(path.join(dir, 'api/cards.json'), JSON.stringify({ v: 1, base: 'x/', banner: { a: 'banner-a.png' } }));
t('listed picture missing on disk fails', checkCards(dir).some((p) => /missing/.test(p)));
fs.writeFileSync(path.join(dir, 'cards/banner-a.png'), 'x');
t('complete output passes', checkCards(dir).length === 0);
fs.writeFileSync(path.join(dir, 'api/cards.json'), JSON.stringify({ v: 1, banner: {} }));
t('no banners fails', checkCards(dir).some((p) => /no banners/.test(p)));
const wf = fs.readFileSync(new URL('../.github/workflows/update.yml', import.meta.url), 'utf8');
t('update.yml runs the check after drawing', wf.indexOf('scripts/cards.mjs') < wf.indexOf('scripts/check-cards.mjs'));
t('check step is not continue-on-error', !/check-cards[\s\S]{0,40}continue-on-error/.test(wf) && !/Check the card manifest[\s\S]{0,200}continue-on-error/.test(wf));
done();
