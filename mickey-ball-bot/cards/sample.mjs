// Draws one of every card from made-up data into ./out so the look can be checked: node cards/sample.mjs
import fs from 'node:fs';
import { openRenderer } from './render.mjs';
import * as T from './templates.mjs';

const crest = (id) => `https://eafc24.content.easports.com/fifa/fltOnlineAssets/24B23FDE-7835-41C2-87A2-F453DFDB2E82/2024/fcweb/crests/256x256/l${id}.png`;
const club = { name: 'Alpha United FC', crest: crest('99160221'), gp: 12, w: 7, d: 2, l: 3, gf: 31, ga: 19, winPct: 58, form: ['W', 'W', 'L', 'D', 'W', 'W', 'L', 'W', 'D', 'W'],
  matches: Array.from({ length: 8 }, (_, i) => ({ res: 'WDL'[i % 3], gf: 3 - (i % 3), ga: i % 3, opp: ['Beta Rovers', 'Gamma City FC', 'Delta Athletic', 'Epsilon SC'][i % 4], oppCrest: crest(['99160304', '99160501', '99160111', '99160222'][i % 4]), ts: 1790000000 - i * 90000, scorers: [{ n: 'NovaCrest', g: 2 }, { n: 'EmberFox', g: 1 }].slice(0, 1 + (i % 2)) })) };
const names = ['NovaCrest', 'GoldenLoom', 'EmberFox', 'BlazeGuard', 'PyraMind', 'Zephyr_Fx', 'Vesper_X', 'Sunforge', 'SolarGlove', 'CinderRock', 'Helios_10'];
const pos = ['midfielder', 'midfielder', 'forward', 'defender', 'midfielder', 'forward', 'midfielder', 'defender', 'goalkeeper', 'defender', 'midfielder'];
const ps = names.map((n, i) => ({ n, pos: pos[i], r: 8.7 - i * 0.27, g: i === 0 ? 2 : 0, a: i === 1 || i === 4 ? 1 : 0, sh: (i * 3) % 7, pa: 20 + i, pm: 15 + (i % 5), ta: 4 + i, tm: 2 + (i % 4), mom: i === 0 }));
const m = { id: '1', ts: 1790000000, res: 'D', gf: 2, ga: 2, opp: 'Copperhead FC', oppCrest: crest('99160304'), type: 'league', scorers: [{ n: 'NovaCrest', g: 2 }], motm: 'NovaCrest', ps };
const players = names.map((n, i) => ({ n, pos: pos[i], s: { gp: 12 - (i % 4), g: 9 - i, a: (i * 2) % 6, r: 8.1 - i * 0.2, m: i < 3 ? 3 - i : 0, p: 80 - i, t: 60 + i }, tr: [6.8, 7.2, 7.9, 6.5, 8.4, 7.7, 8.8, 7.1, 8.2, 8.7 - i * 0.2] }));

fs.mkdirSync('out', { recursive: true });
const r = await openRenderer();
const jobs = { score: T.scoreCard(m, club), field: T.fieldCard(m, club), box: T.boxScoreCard(m, club), club: T.clubCard(club), results: T.resultsCard(club),
  'top-goals': T.tableCard(players, 'goals', club), player: T.playerCard(players[0], club), compare: T.compareCard(players[0], players[1], club),
  banner: T.bannerCard({ title: 'Head to head', sub: 'Record against Beta Rovers', icon: '⚔️', club }) };
for (const [k, html] of Object.entries(jobs)) { fs.writeFileSync(`out/${k}.png`, await r.png(html)); console.log('drew', k); }
await r.close();
