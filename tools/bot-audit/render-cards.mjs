// Bot output audit, step 0: draw the cards the bot attaches (score, field, box score, player, compare, top lists, club, results, banners)
// with the repo's own templates and headless Chrome, into tools/bot-audit/out/cards/ + out/cards.json (a manifest like site/api/cards.json).
// Needs Chrome (unsandboxed). The real site/cards is never touched. Run from the repo root: node tools/bot-audit/render-cards.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cardJobs, TEMPLATE_VERSION } from '../../scripts/cards.mjs';
import { launchChrome } from '../../scripts/lib/chrome.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT = fileURLToPath(new URL('./out/cards/', import.meta.url));
fs.mkdirSync(OUT, { recursive: true });
const read = (f) => JSON.parse(fs.readFileSync(ROOT + 'site/api/' + f, 'utf8'));
const club = structuredClone(read('club.json')), players = read('players.json');
const SITE_URL = 'http://localhost:4321/';
const inline = (url) => { // site-relative crests inline from site/; anything remote stays a URL
  const rel = club.url && url?.startsWith(club.url) ? url.slice(club.url.length) : url?.startsWith(SITE_URL) ? url.slice(SITE_URL.length) : null;
  const f = rel && path.join(ROOT, 'site', rel);
  return f && fs.existsSync(f) ? `data:image/png;base64,${fs.readFileSync(f).toString('base64')}` : url;
};
club.crest = inline(club.crest);
const jobs = cardJobs(club, players, { matches: 6 });
const manifest = { v: TEMPLATE_VERSION, at: Date.now(), base: `${SITE_URL}cards/` };
const setIn = (o, key, v) => { let x = o; key.slice(0, -1).forEach((k) => (x = x[k] ??= {})); x[key.at(-1)] = v; };
const chrome = await launchChrome();
let n = 0;
try {
  for (const j of jobs) {
    try { fs.writeFileSync(OUT + j.file, await chrome.shot(j.html(), 1200)); setIn(manifest, j.key, j.file); n++; }
    catch (e) { console.log('card failed', j.file, e.message); }
  }
} finally { await chrome.close(); }
fs.writeFileSync(OUT + '../cards.json', JSON.stringify(manifest));
console.log(`cards drawn ${n}/${jobs.length}`);
