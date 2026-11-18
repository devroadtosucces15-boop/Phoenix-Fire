// /results: one drawn card per count (1 to 10) so the picture, the title and the W/D/L line always agree, and a friendly is scored by its goals, not as a
// draw. Reported 2026-11-18: "Last 10 results" over a "LAST 8 MATCHES" picture, and 3–0 / 7–0 / 4–0 marked DRAW. Phoenix only.
import fs from 'node:fs';
const ROOT = new URL('../', import.meta.url).pathname;
import { t, done } from './lib.mjs';
import { resultsCard, RESULT_COUNTS, cardJobs } from '../scripts/cards.mjs';
import { slimBurnerMatch } from '../bot/burnerstats.js';

const src = (f) => fs.readFileSync(ROOT + f, 'utf8');
const mk = (i, gf, ga, res) => ({ id: String(i), ts: 1700000000 + i, gf, ga, res, opp: `Opp${i}`, scorers: [], ps: [], url: 'https://x/' });
const matches = Array.from({ length: 12 }, (_, i) => mk(i, i % 4, 1, ['W', 'D', 'L'][i % 3]));
const club = { name: 'PHOENIX FIRE', crest: '', matches };
const rows = (h) => (h.match(/<div class="row">/g) ?? []).length;

t('counts: a card exists for every choice from 1 to 10', RESULT_COUNTS.join() === '1,2,3,4,5,6,7,8,9,10' && RESULT_COUNTS.every((n) => cardJobs(club, []).some((j) => j.key.join() === `results,${n}`)));
t('card: exactly the asked number of rows, whatever the count', [1, 2, 3, 7, 8, 10].every((n) => rows(resultsCard(club, n)) === n));
t('card: the title says the same number as the rows ("Last result" for one)', /Last result</.test(resultsCard(club, 1)) && [3, 7, 10].every((n) => resultsCard(club, n).includes(`Last ${n} results`)) && !/Last 8 matches/i.test(resultsCard(club, 10)));
t('card: each row\'s label comes from the match result and sits beside the same score', (() => { const h = resultsCard(club, 3); return matches.slice(0, 3).every((m) => h.includes(`${m.gf}–${m.ga}`)); })());
const worker = src('bot/worker.js'), block = worker.slice(worker.indexOf("case 'results'"), worker.indexOf("case 'player'"));
t('command: the Worker picks the card for exactly the rows it lists and titles the post the same', /cardUrl\(deck, 'results', String\(list\.length\)\)/.test(block) && /Last \$\{list\.length\} results/.test(block) && !/n > 8|slice\(card \? 8/.test(block));
const flag = (w, l, goals) => ({ wins: w, losses: l, goals: String(goals) });
const fr = (a, b) => ({ matchId: '1', timestamp: 1, clubs: { 1: flag('0', '0', a), 2: flag('0', '0', b) }, players: {} });
t('friendly scoring: a friendly (no win/loss flag) is a win, a loss or a draw by its goals', slimBurnerMatch(fr(3, 0), '1', 'friendly').res === 'W' && slimBurnerMatch(fr(0, 2), '1', 'friendly').res === 'L' && slimBurnerMatch(fr(1, 1), '1', 'friendly').res === 'D');
t('friendly scoring: EA\'s own flag still wins when it sends one', slimBurnerMatch({ matchId: '1', timestamp: 1, clubs: { 1: flag('1', '0', 1), 2: flag('0', '1', 1) }, players: {} }, '1', 'league').res === 'W');
const build = src('scripts/build.mjs');
t('site build: the result helper falls back to the goals and every caller passes the opponent', /const result = \(c, opp\)/.test(build) && !/result\(m\.clubs\[(id|homeId|clubId|h)\]\)/.test(build) && !/result\((us|e\.last\.clubs\[homeId\])\)/.test(build));
t('none of it names NOREX', !/norex/i.test(block + src('scripts/cards.mjs').slice(src('scripts/cards.mjs').indexOf('export function resultsCard'), src('scripts/cards.mjs').indexOf('export function resultsCard') + 1500)));
done();
