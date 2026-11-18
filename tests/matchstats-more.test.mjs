// The remaining stats outputs get the event counters inside their existing formats (no new layouts): the private "Show my match" card, /compare, the
// leaderboards, and the fact packs the insights writer reads. Friendlies carry no counters, so they show nothing extra, never zeros. Phoenix only.
import fs from 'node:fs';
const ROOT = new URL('../', import.meta.url).pathname;
import { t, done } from './lib.mjs';
import { personalEmbed } from '../bot/matchcard.js';
import { playerIntel } from '../scripts/lib/intel.mjs';
import { decodeEvents } from '../scripts/lib/events.mjs';
import { COMPARE_ROWS, TOP_STATS, topRows, compareCard, tableCard, playerMatchCard } from '../scripts/cards.mjs';
import { playerBreakdown, trend } from '../scripts/lib/playerinsight.mjs';

const src = (f) => fs.readFileSync(ROOT + f, 'utf8');
const m = { id: '1', res: 'W', gf: 2, ga: 1, opp: 'Them', ts: 1, url: 'https://x/m' };
const club = { name: 'PHOENIX FIRE', crest: '' };
const ev = { int: 4, aer: 3, won: 6, lost: 2, fwd: 12, pos: 80, sot: 2, fouls: 1 };
const lineEv = { k: '1', n: 'Ann', r: 7.5, g: 1, a: 0, pm: 20, pa: 25, tm: 2, ta: 4, sh: 3, pos: 'midfielder', ev };
const lineNo = { k: '1', n: 'Ann', r: 7.5, g: 1, a: 0, pm: 20, pa: 25, tm: 2, ta: 4, sh: 3, pos: 'midfielder' };
const p = { n: 'Ann', s: { gp: 5, r: 7, g: 1, a: 1, p: 80, t: 50 }, tr: [7, 6], i: { n: 4, pg: { int: 2, aer: 1, won: 3, fwd: 8, sot: 1, fouls: 0.5 }, r: { pass: 80, tackle: 50, fwd: 40, pos: 70 } } };
const body = (e) => JSON.stringify(e);

// ---- Show my match
const withEv = body(personalEmbed(m, lineEv, p, club, 'https://x/')), noEv = body(personalEmbed(m, lineNo, p, club, 'https://x/'));
t('show my match: interceptions, aerials, possession, forward passes, shots on target, in position, fouls from the counters', ['Interceptions', 'Aerial duels won', 'Possession', 'Forward passes', 'Shots on target', 'In position', 'Fouls conceded'].every((k) => withEv.includes(k)));
t('show my match: each against the player\'s own per-game average (▲ ▼ ＝), same as the other rows', /Interceptions[\s\S]*avg 2\.0 ▲/.test(withEv) && /In position[\s\S]*avg 70% ▲/.test(withEv));
t('show my match: a friendly line (no counters) shows none of it, no zeros', !/Interceptions|Aerial duels|In position/.test(noEv));
t('show my match: a player with no intel block still gets the numbers, just no average', !/avg [\d.]+ [▲▼＝]/.test(body(personalEmbed(m, lineEv, { ...p, i: undefined }, club, 'https://x/')).split('Interceptions')[1]?.slice(0, 80) ?? 'avg 1 ▲'));

// ---- players.json intel block
const evs = [decodeEvents('160:1,159:1,102:2,99:1'), decodeEvents('160:3')];
const i = playerIntel(evs);
t('intel block: appearances, per-game averages and rates; null with no counters', i.n === 2 && 'int' in i.pg && 'pass' in i.r && playerIntel([]) === null);
t('build writes the intel block into players.json for players with counters', /\.\.\.\(pl\.evs\?\.length \? \{ i: playerIntel\(pl\.evs\) \} : \{\}\)/.test(src('scripts/build.mjs')));

// ---- /compare
const a = { ovr: 80, s: { gp: 5 }, i: p.i }, b = { ovr: 70, s: { gp: 5 }, i: { n: 3, pg: { int: 1, aer: 2, won: 1, fwd: 5, sot: 0, fouls: 1 }, r: { pass: 70, tackle: 40, fwd: 30, pos: 60 } } };
const labels = COMPARE_ROWS(a, b).map((r) => r[0]);
t('compare: interceptions, aerials, possession won and in-position rows added to the same card', ['Interceptions / game', 'Aerials / game', 'Poss. won / game', 'In position %'].every((l) => labels.includes(l)));
t('compare: players without counters leave those rows out (filtered like any empty row)', !compareCard({ n: 'A', s: { gp: 1, g: 1 } }, { n: 'B', s: { gp: 1, g: 2 } }).includes('Interceptions'));
t('compare: the card draws the new rows', /Interceptions \/ game/.test(compareCard({ n: 'A', pos: 'ST', ...a }, { n: 'B', pos: 'ST', ...b })));

// ---- leaderboards
const squad = [{ k: '1', n: 'Ann', home: true, src: 'club', s: { gp: 5 }, ...{ i: p.i } }, { k: '2', n: 'Bo', home: true, src: 'club', s: { gp: 5 }, i: b.i }, { k: '3', n: 'Cy', home: true, src: 'club', s: { gp: 5 }, i: { ...b.i, n: 2 } }];
t('leaderboards: interceptions, possession won, aerials and positioning, three games minimum with counters', ['interceptions', 'won', 'aerials', 'positioning'].every((k) => TOP_STATS[k]) && topRows(squad, 'interceptions').map(([x]) => x.n).join() === 'Ann,Bo');
t('leaderboards: positioning ranks the in-position share; the table card draws it', topRows(squad, 'positioning')[0][1] === 70 && /Best positioning/.test(tableCard(squad, 'positioning', club)));
const choices = src('bot/commanddefs.js'), worker = src('bot/worker.js');
t('leaderboards: slash command choices and the Worker know the same four boards', ['interceptions', 'won', 'aerials', 'positioning'].every((k) => choices.includes(`'${k}'`) && worker.includes(`${k}: [`)));

// ---- the drawn player card for "Show my match", the compare header and the leaderboard crest
const crestClub = { name: 'PHOENIX FIRE', crest: 'data:image/png;base64,AAAA' };
const hot = { ...lineEv, r: 8.6, ev: { int: 6, aer: 4, won: 7, lost: 1, fwd: 14, pos: 90, sot: 3, fouls: 0 } }; // well above his averages
const cold = { ...lineEv, r: 5.4, ev: { int: 0, aer: 0, won: 1, lost: 6, fwd: 2, pos: 50, sot: 0, fouls: 4 } }; // well below
const pb = { ...p, s: { ...p.s, gp: 20 }, tr: [7, 7.2, 6.8, 7.1, 7.4, 7.6, 7.2, 7.8, 7.5, 7.9] };
const good = playerBreakdown(hot, pb, m), bad = playerBreakdown(cold, pb, m), none = playerBreakdown(lineNo, pb, m);
t('player insight: a big night puts the rating and counters under strengths; a poor night puts them under weak spots, fouls counted the other way', good.strengths.length >= 4 && good.weak.length === 0 && bad.weak.length >= 4 && bad.weak.some((r) => r.id === 'fouls') && good.strengths.every((r) => r.tone === 'good'));
t('player insight: each insight says what the number does and one thing to do, with a target for the weak spots', bad.insights.some((x) => x.aim && /next game/.test(x.aim) && x.text.length > 40) && bad.insights.length <= 4);
t('player insight: a friendly lists the same stats, the counters as a dash (na), never zeros or a different set', none.rows.filter((r) => ['int', 'aer', 'won', 'lost', 'pos', 'fouls', 'sot', 'fwd'].includes(r.id)).every((r) => r.tone === 'na' && r.v == null) && none.insights.some((x) => /friendl/i.test(x.lead)));
t('player insight: every player and every game gets the SAME stat list in the same order, whatever the match was like', [good, bad, none, playerBreakdown(lineEv, { n: 'New', s: { gp: 1 } }, m)].every((b, _, all) => b.rows.map((r) => r.id).join() === all[0].rows.map((r) => r.id).join()));
t('player insight: no average yet (under 3 games) still lists every stat with the value, no comparison, no crash', playerBreakdown(lineEv, { n: 'New', s: { gp: 1 } }, m).rows.every((r) => r.tone !== 'good' && r.tone !== 'bad') && trend({ tr: [7, 7] }) === null);
t('player insight: the trend compares the last five games with his own average', trend(pb).delta > 0 && trend(pb).points.length === 10);
const pmc = playerMatchCard(m, hot, pb, crestClub), pmFriendly = playerMatchCard(m, lineNo, pb, crestClub);
t('player match card: rating, diverging bars against his own average, insights and the rating trend with his average line', ['Your match', 'above your average', 'What it means', 'Rating trend', 'stroke-dasharray'].every((x) => pmc.includes(x)) && /class="dv"/.test(pmc));
t('player match card: crest on the right, Phoenix name, no NOREX', /class="hd"[\s\S]*data:image\/png/.test(pmc) && /PHOENIX FIRE/.test(pmc) && !/norex|c8352c/i.test(pmc));
t('player match card: a friendly still draws all the rows, the counters marked not sent', /Your match/.test(pmFriendly) && /class="lb">Interceptions/.test(pmFriendly) && /not sent/.test(pmFriendly));
t('player match card: the same rows in the same order for a quiet and a big night', (() => { const lbs = (h) => [...h.matchAll(/class="lb">([^<]+)</g)].map((x) => x[1]).join('|'); return lbs(pmc) === lbs(playerMatchCard(m, cold, pb, crestClub)) && lbs(pmc) === lbs(pmFriendly); })());
t('player match card: drawn for the newest matches through the card jobs; Show my match uses it and falls back to the text embed', /pm-\$\{m\.id\}/.test(src('scripts/cards.mjs')) && /cardUrl\(deck, 'match', matchId, 'pm', key\)/.test(src('bot/matchcard.js')) && /return reply\(personalEmbed/.test(src('bot/matchcard.js')));
const cmp = compareCard(squad[0], squad[1], crestClub);
t('compare card: a "Player comparison" title with the crest on the right, the names below the stats', /Player comparison/.test(cmp) && /class="head"[\s\S]*data:image\/png/.test(cmp) && cmp.indexOf('<div class="row">') < cmp.indexOf('<div class="names">') && cmp.indexOf('<h2>Ann') > cmp.indexOf('<div class="row">'));
t('leaderboard card: the crest sits on the right of the title', /class="lh"[\s\S]*data:image\/png/.test(tableCard(squad, 'interceptions', crestClub)));

// ---- insights fact packs
const ins = src('bot/statinsights.js');
t('insights: the latest-match pack carries our counter totals only when players have them', /function eventFacts/.test(ins) && /if \(!have\.length\) return \{\}/.test(ins) && /\.\.\.eventFacts\(m\.ps\)/.test(ins));
t('insights: the player pack carries per-game counters from the intel block, absent without it', /\.\.\.\(p\.i \? \{ gamesWithEventCounters/.test(ins));
t('none of it names NOREX', ![src('bot/matchcard.js'), ins].some((s) => /norex name|NOREX UNITED/i.test(s)));
done();
