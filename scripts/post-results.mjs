// Posts the results fetch.mjs queued in .outbox/results.json. Runs in update.yml after the site build and the Discord cards, so every
// result carries its score card and field view (attached straight from site/cards). Missing cards just mean a post without the pictures.
import fs from 'node:fs';
import { DATA, loadConfig, readJson } from './lib.mjs';
import { postResults } from './lib/resultpost.mjs';
import { resolveOrgClubs } from './lib/org.mjs';

const FILE = '.outbox/results.json';
if (!fs.existsSync(FILE)) { console.log('No results waiting to be posted'); process.exit(0); }
const { matches = [], hidden = [] } = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const config = loadConfig();
const manifest = readJson('site/api/cards.json', null);
// Same club list the fetch used (Worker → snapshot → config.homeClubId); the destination of each post is resolved per source club.
const org = await resolveOrgClubs(config, { dataDir: DATA, live: true });
const result = await postResults(matches, { config, homeId: org.primary, orgIds: org.ids, hidden, drawn: manifest ? { dir: 'site/cards', manifest } : null });
fs.rmSync(FILE, { force: true });
const n = result?.posted ?? matches.length;
console.log(`Posted ${n} result${n === 1 ? '' : 's'}${manifest ? ' with cards' : ' without cards'}`);
if (result?.missing?.length) { console.error(`${result.missing.length} result(s) NOT posted – missing destination(s), see .outbox/missing-destinations.json`); process.exitCode = 1; }
