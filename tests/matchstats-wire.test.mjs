// The stats look agreed in the preview (PLANNING/MATCHSTATS-REVIEW.md section 7): every stat an inline donut, the deeper stats in the same rows,
// ONE box score table with the deeper columns inside it plus a Box score button on the result post, a match review on fixed grids that reads the
// new counters, the session picture with both crests, and player and club cards with analytical views instead of extra tiles.
// Each output must stay Phoenix: no NOREX name, red or crest.
import fs from 'node:fs';
const ROOT = new URL('../', import.meta.url).pathname;
import { t, done } from './lib.mjs';
import { matchComponents } from '../bot/matchcard.js';
import { recapMessage, cleanRecap } from '../bot/sessionrecap.js';
import { buildMatchPicture } from '../scripts/lib/matchpicture.mjs';
import { buildReview } from '../scripts/lib/matchreview.mjs';
import { findSessions, buildRecap } from '../scripts/lib/sessionrecap.mjs';
import { boxEv, CARD_COLS } from '../scripts/lib/boxscore.mjs';
import { decodeEvents } from '../scripts/lib/events.mjs';
import { matchPicture, reviewCard, boxScoreCard, playerCard, clubCard, clubInsight, sessionPicture, ring } from '../scripts/cards.mjs';

const raw = (id) => JSON.parse(fs.readFileSync(`${ROOT}data/matches/${id}.json`, 'utf8'));
const homeOf = (m) => Object.keys(m.clubs).find((k) => ['2161497', '2484'].includes(k));
const EV = raw('199306568210078'), FR = raw('199420580420120'); // a league match with event counters, a friendly without
const club = { name: 'PHOENIX FIRE', crest: '' };
const NOREX = /norex|c8352c|080b11/i;

// ---- the match picture: donuts, never the old number-over-a-bar, and the deeper stats in the same rows
const mpE = buildMatchPicture(EV, homeOf(EV)), mpF = buildMatchPicture(FR, homeOf(FR));
t('deeper stats with counters: six rows, in position and possession won as percentages, fouls lower is better', mpE.deeper.events && mpE.deeper.rows.length === 6 && mpE.deeper.rows.find((r) => r.k === 'In position').kind === 'pct' && mpE.deeper.rows.find((r) => r.k === 'Fouls conceded').lower === true);
t('deeper stats for a friendly: only what EA sends, flagged as no counters', !mpF.deeper.events && mpF.deeper.rows.map((r) => r.k).join() === 'Passes attempted,Tackles attempted,Dribbles,Saves');
const boardE = matchPicture(mpE, club, new Map(), 'board'), boardF = matchPicture(mpF, club, new Map(), 'board');
t('board: every stat is a donut, no number-over-bar left', /class="dr"/.test(boardE) && !/class="mt2"|<i class="bar">/.test(boardE) && (boardE.match(/class="dr"/g) ?? []).length >= 24);
t('board: a Deeper stats header and the six deeper rows with their donuts', /Deeper stats/.test(boardE) && ['Shots on target', 'Forward passes', 'Aerial duels won', 'Possession won', 'Fouls conceded', 'In position'].every((k) => boardE.includes(k)));
t('board: friendly says event stats are not sent, still draws its rows', /not sent for friendlies/.test(boardF) && /Passes attempted/.test(boardF));
t('ring: the website dial (80 box, r 31, 8 wide round cap)', /viewBox="0 0 80 80"/.test(ring(.5, '#fff', '5')) && /r="31"/.test(ring(.5, '#fff', '5')) && /stroke-width="8"/.test(ring(.5, '#fff', '5')) && /stroke-linecap="round"/.test(ring(.5, '#fff', '5')));
t('board: Phoenix, no NOREX', !NOREX.test(boardE) && !NOREX.test(boardF));

// ---- box score: one table
const clubJson = JSON.parse(fs.readFileSync(`${ROOT}site/api/club.json`, 'utf8'));
const mk = (m) => ({ id: m.matchId, gf: 1, ga: 0, opp: 'Them', res: 'W', ps: Object.values(m.players[homeOf(m)]).map((p) => ({ n: p.playername, r: +p.rating || 0, pm: +p.passesmade, pa: +p.passattempts, pos: p.pos, ...(p.evraw ? { ev: boxEv(decodeEvents(p.evraw)) } : {}) })) });
const boxE = boxScoreCard(mk(EV), club), boxF = boxScoreCard(mk(FR), club);
t('box: boxEv carries the two new counters (shots on target, fouls)', boxEv(decodeEvents('1:1')) && ['sot', 'fouls'].every((k) => k in boxEv(decodeEvents('1:1'))));
t('box: ONE table, the deeper columns in the same rows under a Deeper stats header', (boxE.match(/class="h"/g) ?? []).length === 1 && /Deeper stats/.test(boxE) && CARD_COLS.every(([, h]) => boxE.includes(`<span>${h}</span>`)));
t('box: wider card only when counters exist; a friendly keeps the 1200 px table and says why', /width:1500px/.test(boxE) && /width:1200px/.test(boxF) && /EA sends no event counters for friendlies/.test(boxF) && !/Deeper stats<\/span>/.test(boxF));
t('box: Phoenix, no NOREX', !NOREX.test(boxE));

// ---- the Box score button on the result post (the handler for norex:box: already exists in bot/worker.js)
const comps = (box) => matchComponents('99', [{ k: '1', n: 'A', r: 7 }], 'https://x/y', { box });
const btnIds = (rows) => rows.flatMap((r) => r.components).map((c) => c.custom_id).filter(Boolean);
t('result post: Box score button when the box card is drawn, handled by the existing norex:box: route', btnIds(comps(true)).includes('norex:box:99') && fs.readFileSync(`${ROOT}bot/worker.js`, 'utf8').includes("/^norex:box:/"));
t('result post: no button when no box card was drawn', !btnIds(comps(false)).includes('norex:box:99') && !btnIds(matchComponents('99', [{ k: '1', n: 'A', r: 7 }], 'https://x/y')).includes('norex:box:99'));
t('result post: resultpost passes whether the box was drawn', /box: !!drawn\?\.manifest\?\.match\?\.\[m\.matchId\]\?\.box/.test(fs.readFileSync(`${ROOT}scripts/lib/resultpost.mjs`, 'utf8')));

// ---- the match review: the new counters feed the conclusions; the picture is fixed grids
const rvE = buildReview(EV, homeOf(EV)), rvF = buildReview(FR, homeOf(FR));
const leads = (r) => [...r.good, ...r.work].map((x) => x.lead);
t('review: conclusions drawn from the new counters (shots on target, forward play, discipline, interceptions)', ['We hit the target.', 'We played forward.', 'Clean and disciplined.', 'Midfield: step in earlier.'].every((l) => leads(rvE).includes(l)));
t('review: a friendly has no counters, so no counter-based conclusion and no made-up ones', rvF.ev === null && !leads(rvF).some((l) => /target|forward\.|disciplined|step in earlier|ball back/.test(l)));
t('review: the numbers model exists for friendlies (six slots drawn from EA match numbers)', ['shots', 'pass', 'tackle', 'dribbles', 'attempted', 'saves'].every((k) => Array.isArray(rvF.numbers[k])));
const pageE = reviewCard(rvE, club, mpE), pageF = reviewCard(rvF, club, mpF), pageNo = reviewCard(rvE, club);
t('review: aligned grids, always three next-match targets and six numbers, whatever the data', [pageE, pageF].every((h) => (h.match(/class="nx"/g) ?? []).length === 3 && (h.match(/class="ns"/g) ?? []).length === 6));
t('review: the lineup is the field view (same pitch marks), the old shape sketch only without a picture model', /class="pitch"/.test(pageE) && /class="lp"/.test(pageE) && !/class="pitch"/.test(pageNo));
t('review: good and work-on items sit in paired rows', /class="pr"/.test(pageE) && !/class="two"/.test(pageE));
t('review: no tile cards in the numbers, donuts instead', !/class="evt"|class="evg"/.test(pageE) && /class="dr"/.test(pageE));
t('review: friendly says why there are no counters; Phoenix, no NOREX', /No event counters for this match/.test(pageF) && !NOREX.test(pageE + pageF));

// ---- the session recap: picture with both crests and no stats; the counters feed the text; the post carries the picture
const orgIds = ['2161497', '2484'];
const raws = fs.readdirSync(`${ROOT}data/matches`).map((f) => JSON.parse(fs.readFileSync(`${ROOT}data/matches/${f}`, 'utf8')));
const ses = findSessions(raws, orgIds).find((s) => s.matches.some((x) => String(x.matchId) === '199306568210078'));
const rc = buildRecap(ses, {});
t('recap: each match carries its opponent crest, scorers and man of the match for the picture', rc.matches.every((m) => /^https:\/\//.test(m.oppCrest) && Array.isArray(m.scorers) && 'motm' in m));
t('recap: standout stats gain the team line (shots on target, fouls) from the counters', rc.standout.team && rc.standout.team.shots > 0 && 'foulsUs' in rc.standout.team);
const pic = sessionPicture(rc, { name: 'PHOENIX FIRE', crest: 'data:image/png;base64,AAAA' });
t('recap picture: our crest and the opponent crest on every row, score, scorers, no stat columns', (pic.match(/<img /g) ?? []).length >= rc.matches.length * 2 - rc.matches.filter((m) => !m.oppCrest).length && rc.matches.every((m) => pic.includes(`${m.gf}–${m.ga}`)) && !/pass accuracy|net possession|shots on target/i.test(pic));
t('recap picture: Phoenix, no NOREX', !NOREX.test(pic));
const env = { SITE_URL: 'https://x/' };
const withPic = JSON.stringify(recapMessage(env, cleanRecap({ ...rc, picture: 'QUJD' }))), without = JSON.stringify(recapMessage(env, cleanRecap(rc)));
t('recap post: with the picture the Matches text list is replaced by the attachment', withPic.includes('attachment://session.png') && !/\*\*\d+–\d+\*\*/.test(withPic));
t('recap post: without a picture the text list stays, so nothing is lost', !without.includes('attachment://session.png') && /\*\*\d+–\d+\*\*/.test(without));
t('recap post: the team line shows shots on target and fouls', /Shots on target/.test(withPic) && /Fouls conceded/.test(withPic));
t('recap: a bad picture field is refused', cleanRecap({ ...rc, picture: '<script>' }).picture === null && cleanRecap({ ...rc, picture: 'A'.repeat(900001) }).picture === null);
t('recap: the Action draws the picture and the Worker posts it as multipart', /sessionPicture/.test(fs.readFileSync(`${ROOT}scripts/session-recap.mjs`, 'utf8')) && /FormData/.test(fs.readFileSync(`${ROOT}bot/sessionrecap.js`, 'utf8')));

// ---- player and club cards: analytical views inside the layout, no extra rows of tiles
const intel = { apps: 14, perApp: { interceptions: 1.7, aerialDuelsWonAttacking: .7, aerialDuelsWonDefending: .4, passesCompletedForward: 5.6 }, rates: { passAccuracy: 84, tackleWinRate: 47, forwardPassShare: 53, positioning: 90 } };
const pl = { n: 'A', pos: 'ST', ovr: 80, s: { gp: 9, g: 1, a: 1, r: 7, m: 0 }, tr: [7, 6, 8, 7] };
const cardP = playerCard(pl, intel, [intel.perApp]), cardP0 = playerCard(pl);
t('player card: intelligence donuts and per-game bars beside the rating graph, still five tiles', (cardP.match(/class="dr"/g) ?? []).length === 4 && /class="pb"/.test(cardP) && (cardP.match(/<div class="tile[ "]/g) ?? []).length === 5);
t('player card: without intel it is the old card (graph only)', !/class="pg"/.test(cardP0) && (cardP0.match(/<div class="tile[ "]/g) ?? []).length === 5);
const ins = clubInsight(clubJson);
const cardC = clubCard({ ...clubJson, crest: '' }, ins);
t('club insight: ten league games at most, pass accuracy per game, shares only from counters', ins && ins.games.length <= 10 && ins.games.every((g) => g.pass == null || (g.pass > 0 && g.pass <= 100)));
t('club card: one analytics band (bars per game and three donuts), still six tiles and the form row', /class="cbs"/.test(cardC) && (cardC.match(/class="dr"/g) ?? []).length >= 2 && (cardC.match(/<div class="tile[ "]/g) ?? []).length === 6 && /FORM/.test(cardC));
t('player and club cards: Phoenix, no NOREX', !NOREX.test(cardP + cardC));
t('cards: template version bumped together with the bot banners', /TEMPLATE_VERSION = 18/.test(fs.readFileSync(`${ROOT}scripts/cards.mjs`, 'utf8')) && /BANNER_V = 18/.test(fs.readFileSync(`${ROOT}bot/ui.js`, 'utf8')));
done();
