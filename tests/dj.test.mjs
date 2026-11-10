// Phoenix DJ (dj/): every name, colour and picture the music bot shows must be Phoenix, never NOREX (CLAUDE.md rule 5).
import fs from 'node:fs'; import path from 'node:path'; import { t, done } from './lib.mjs';

const ROOT = new URL('../dj/', import.meta.url).pathname;
const files = (d) => fs.readdirSync(path.join(ROOT, d)).filter((f) => f.endsWith('.js')).map((f) => path.join(d, f));
const src = [...files('src'), 'package.json', '.env.example', 'DEPLOY.md', 'phoenix-dj.service', 'pc-install.sh'];
for (const f of src) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  // The PC shares the home audio engine, so its real paths/unit names may appear (they are infrastructure, never shown in Discord).
  const shown = s.replace(/norex-dj-home|norex-lavalink\.service|norex-heal\.(?:service|timer)/g, '');
  t(`dj/${f}: no NOREX name`, !/norex/i.test(shown));
  t(`dj/${f}: no NOREX colour`, !/#?(c8352c|080b11|e0493f)\b|0xc8352c|0x6b7785/i.test(s));
  t(`dj/${f}: no NOREX server or role IDs`, !/1371311947894489299|1371389857649393684|1451571867579322422/.test(s));
}
const brand = await import('../dj/src/brand.js');
const cfg = JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url), 'utf8')).brand;
t('brand accent comes from config.json', brand.ACCENT === cfg.red && brand.COLORS.accent === parseInt(cfg.red.slice(1), 16));
t('bot name is Phoenix DJ, rooms category is PHOENIX ROOMS', brand.BOT === 'Phoenix DJ' && brand.ROOMS === 'PHOENIX ROOMS');
const crest = fs.readFileSync(path.join(ROOT, 'assets/crest.png')), phoenix = fs.readFileSync(new URL('../phoenix/overlay/crest.png', import.meta.url));
t('panel crest is the Phoenix crest (not the NOREX one)', crest.length > 0 && crest.length !== 60713 && phoenix.length > 0);
t('six rooms: Phoenix DJ + DJ 1..5', /MAX_ROOMS = 6/.test(fs.readFileSync(path.join(ROOT, 'src/index.js'), 'utf8')));
done();
