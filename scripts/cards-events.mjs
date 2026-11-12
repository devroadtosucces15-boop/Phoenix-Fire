// Match-night pictures drawn at build time (Phoenix look): one empty pitch per formation for the line-up post, and the
// Check-in banner. Kept out of scripts/cards.mjs so that file stays shared; cards.mjs adds `eventJobs()` to its job list.
// Every picture carries the Phoenix crest from phoenix/overlay/crest-sm.png (single source), the accent from config.json brand
// and the club name from config.siteTitle – nothing NOREX. Player pictures in this family follow the chest-up rule
// (CLAUDE.md); these two pictures show no player.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORMATIONS, POS_OF } from '../bot/events.js';
import { lineupSlug } from '../bot/ui.js';
import { esc, page } from './cards.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const W = 1200;
const config = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')); } catch { return {}; } })();
const SITE = String(config.siteTitle || '').trim() || 'Phoenix Fire';
const ACCENT = /^#[0-9a-f]{6}$/i.test(config.brand?.red ?? '') ? config.brand.red : '#e8651a';
const MOTTO = String(config.brand?.motto || '').trim();
const crestUri = (() => { try { return `data:image/png;base64,${fs.readFileSync(path.join(ROOT, 'phoenix/overlay/crest-sm.png')).toString('base64')}`; } catch { return ''; } })();
const crestImg = (px, extra = '') => (crestUri ? `<img src="${crestUri}" width="${px}" height="${px}" style="object-fit:contain;${extra}" alt="">` : '');

export { lineupSlug };

// One empty pitch per formation – the names sit in the message text beside it. Same pitch and markers as the field view,
// with the Phoenix crest in the corner and the formation in the Phoenix accent.
export function lineupCard(formation) {
  const stripes = Array.from({ length: 7 }, (_, k) => `<rect x="${7.5 + 15 * k}" width="7.5" height="68" fill="#17603a"/>`).join('');
  const markers = (FORMATIONS[formation] ?? []).map(([slot, x, y]) => {
    const px = 6 + ((92 - y) / 80) * 90, py = 5 + (x / 100) * 58;
    return `<g><circle cx="${px}" cy="${py}" r="4" fill="#0a0705" stroke="${ACCENT}" stroke-width=".7"/><text x="${px}" y="${py + 1.1}" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="3" fill="#efcf7a">${esc(POS_OF(slot))}</text></g>`;
  }).join('');
  const crest = crestUri ? `<image href="${crestUri}" x="97.2" y="1.6" width="5.6" height="5.6" preserveAspectRatio="xMidYMid meet"/>` : '';
  return page('body{height:777px}svg{display:block}', `<svg viewBox="0 0 105 68" width="${W}" height="777">
<defs><radialGradient id="vig" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient></defs>
<rect width="105" height="68" fill="#14502e"/>${stripes}
<g fill="none" stroke="#ffffffb0" stroke-width=".3"><rect x="1" y="1" width="103" height="66"/><line x1="52.5" y1="1" x2="52.5" y2="67"/><circle cx="52.5" cy="34" r="9.15"/>
<rect x="1" y="13.84" width="16.5" height="40.32"/><rect x="1" y="24.84" width="5.5" height="18.32"/><rect x="87.5" y="13.84" width="16.5" height="40.32"/><rect x="98.5" y="24.84" width="5.5" height="18.32"/></g>
<rect width="105" height="68" fill="url(#vig)"/>
<rect x="0" y="0" width="105" height=".9" fill="${ACCENT}"/>
<text x="3" y="4.4" font-family="Inter" font-weight="800" font-size="1.75" letter-spacing=".45" fill="#ffffffb0">${esc(SITE).toUpperCase()} LINE-UP · <tspan fill="#ffb27a">${esc(formation).toUpperCase()}</tspan></text>
<text x="94" y="4.4" text-anchor="end" font-family="Inter" font-weight="800" font-size="1.75" letter-spacing=".45" fill="#ffffffb0">ATTACKING →</text>
${crest}${markers}</svg>`);
}

// The banner on top of the Check-in post (the drawn roster replaces it once the picture is on): crest, "Check in now", the motto.
export const checkinBanner = () => page('body{height:300px}.bn{position:absolute;inset:0;display:flex;align-items:center;gap:56px;padding:0 76px}.bn h1{font:700 104px/.95 Oswald;text-transform:uppercase;letter-spacing:.03em;text-shadow:0 8px 40px rgba(232,101,26,.55)}.bn p{margin-top:16px;font:600 26px Inter;letter-spacing:.22em;text-transform:uppercase;color:var(--soft)}.art{flex:none}',
  `<div class="bn">${crestImg(190, 'filter:drop-shadow(0 6px 30px rgba(232,101,26,.5))')}<div><div class="eyebrow">${esc(SITE)}</div><h1 class="gold">Check in</h1><p>${esc(MOTTO || 'Be there')} · tap the button</p></div></div><div class="brand">${esc(SITE)}</div>`);

// Jobs for cards.mjs (the Check-in banner is a BANNERS entry there, so it is drawn with the other banners): { key, file, html } like its own. Stable file names (the ?v= in the URL busts Discord's cache).
export function eventJobs() {
  return [
    ...Object.keys(FORMATIONS).map((f) => ({ key: ['lineup', f], file: `lineup-${lineupSlug(f)}.png`, html: () => lineupCard(f) })),
  ];
}
