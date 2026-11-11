// Rush screenshot scans: reading (scanocr.js), the numbers (lbinsights.js), routes, storage, Discord posts and the Phoenix look (rushscan.js).
// The vision model is faked: tests control exactly what "the photo says".
import { call, env, login, sqlite } from './mock.mjs';
import { t, tt, done } from './lib.mjs';
import { num, cleanBoard, cleanSeason, validateSeason, extractJson, parseDataUrl, visionJson, VISION_MODEL, FALLBACK_VISION_MODEL } from '../bot/scanocr.js';
import { boardInsights, boardSeries, ladder, seasonBoard, seasonClock } from '../bot/lbinsights.js';
import { tableText, sparkline, DEFAULT_SEASON } from '../bot/rushscan.js';
import { plainText } from '../bot/ui.js';

const H = 3600e3;
const setFlags = (o) => { env.FEATURES = JSON.stringify({ ...JSON.parse(env.FEATURES), ...o }); };
const row = (rank, club, vp, gp, m, bfg, avg_vp) => ({ rank, club, vp, gp, m, bfg, avg_vp });
const BOARD = {
  season_label: 'Season 2', highlighted_rank: 2,
  rows: [row(1, 'Shadow Assassin', '11,976', '7,081', 47, 1, 254.81), row(2, 'Phoenix Fire', 7711, 4752, 45, 0, 171.36), row(3, 'I BANDITI', 7659, 4359, 50, 0, 153.18),
    row(4, 'Fantastic', 6612, 3674, 49, 1, 134.94), row(5, 'RUSH N MAFIA', 5624, 3691, 45, 1, 124.98), row(6, 'Sh2dow Assassin', 4642, 4980, 36, 0, 128.94)],
};
const clone = (o) => JSON.parse(JSON.stringify(o));

// ---------- number reading ----------
t('num: thousands separators, dots, spaces, letter O', num('11,976') === 11976 && num('17.520') === 17520 && num('1 753') === 1753 && num('2O6') === 206 && num('abc') === null && num(null) === null && num('') === null);
t('num: decimals keep their point', num('254.81', { decimals: true }) === 254.81 && num('254,81', { decimals: true }) === 254.81 && num('1,234.5', { decimals: true }) === 1234.5);
t('extractJson copes with prose and code fences', extractJson('Sure!\n```json\n{"a":1,}\n```')?.a === 1 && extractJson('nothing here') === null);
t('parseDataUrl: only jpeg/png/webp, not tiny, not huge', parseDataUrl('data:image/png;base64,' + 'A'.repeat(3000)).url && parseDataUrl('data:text/html;base64,AAAA').error && parseDataUrl('data:image/png;base64,AAAA').error && parseDataUrl('data:image/png;base64,' + 'A'.repeat(9e6)).error);

// ---------- leaderboard checks ----------
const ok = cleanBoard(BOARD);
t('board: rows normalised, us = the highlighted row, no errors', ok.rows.length === 6 && ok.rows[0].vp === 11976 && ok.rows[0].gp === 7081 && ok.us === 1 && ok.qc.errors.length === 0 && ok.season === 'Season 2');
const bad = clone(BOARD); bad.rows[3].vp = 16612;
const badC = cleanBoard(bad);
t('board: a misread digit (row above has less VP) blocks saving', badC.qc.errors.some((e) => /Fantastic/.test(e) && /misread/.test(e)));
const avg = clone(BOARD); avg.rows[2].avg_vp = 15.3;
t('board: AVG ≠ VP ÷ M raises a warning, not an error', cleanBoard(avg).qc.warnings.some((w) => /I BANDITI/.test(w)) && cleanBoard(avg).qc.errors.length === 0);
const noavg = clone(BOARD); noavg.rows[2].avg_vp = null;
t('board: a missing AVG is worked out from VP ÷ M', cleanBoard(noavg).rows[2].avg === 153.18 && cleanBoard(noavg).qc.fixed.length === 1);
const lost = clone(BOARD); lost.highlighted_rank = null; lost.rows[1].club = 'Mystery FC';
t('board: no highlighted row and no name match → asks to mark our row', cleanBoard(lost).us === null && cleanBoard(lost).qc.errors.some((e) => /not found/.test(e)));
const byName = clone(BOARD); byName.highlighted_rank = null;
t('board: no highlight but our name is listed → found by name', cleanBoard(byName).us === 1);
t('board: fewer than 3 rows is refused', cleanBoard({ rows: BOARD.rows.slice(0, 2) }).qc.errors.some((e) => /Only 2 rows/.test(e)));
const dupe = clone(BOARD); dupe.rows.push(row(7, 'Phoenix Fire', 1753, 1686, 33, 1, 53.12)); dupe.highlighted_rank = 2;
t('board: the same club twice warns and the highlighted row wins', cleanBoard(dupe).qc.warnings.some((w) => /listed 2 times/.test(w)) && cleanBoard(dupe).us === 1);
t('board: names are stripped of mentions', !/[<>@]/.test(cleanBoard({ rows: [row(1, '@everyone <x>', 10, 1, 1, 0, 10), row(2, 'B', 9, 1, 1, 0, 9), row(3, 'C', 8, 1, 1, 0, 8)] }).rows[0].club));

// ---------- season card checks ----------
const GOOD = { club: 'Phoenix Fire', season_label: 'Season 1', tier: 'Top 1%', matches: 241, wins: 189, goals: 144, club_vp: '17,520', my_vp: 188 };
const sc = cleanSeason(GOOD);
t('season: a complete read passes with no errors', sc.qc.errors.length === 0 && sc.stats.clubVp === 17520 && sc.stats.myVp === 188 && sc.stats.tier === 'Top 1%');
t('season: missing required fields are named', cleanSeason({ club: 'Phoenix Fire', matches: 100 }).qc.errors.length === 3);
t('season: wins above matches, contribution above club total', validateSeason({ matches: 10, wins: 11, goals: 1, myVp: 5 }).qc.errors.some((e) => /Wins/.test(e)) && validateSeason({ matches: 10, wins: 5, goals: 1, myVp: 50, clubVp: 20 }).qc.errors.some((e) => /contribution/.test(e)));
t('season: another club’s screen is refused', cleanSeason({ ...GOOD, club: 'Fantastic' }).qc.errors.some((e) => /not Phoenix Fire/.test(e)));
t('season: weak numbers become flags for managers, not errors', ((q) => q.errors.length === 0 && q.warnings.length >= 2)(validateSeason({ club: 'Phoenix Fire', matches: 100, wins: 20, goals: 5, myVp: 30, clubVp: 1000 }).qc));

// ---------- vision call (fake model) ----------
let seen = null, reply = JSON.stringify(BOARD), failOnce = 0;
env.AI = { run: async (model, input) => {
  if (input.prompt === 'agree') return {};
  if (failOnce) { failOnce--; throw new Error('5016: Submit the prompt agree to accept the licence'); }
  seen = { model, input }; return { response: reply };
} };
const IMG = 'data:image/png;base64,' + 'A'.repeat(3000);
const v = await visionJson(env, IMG, 'p');
t('vision: sends the image as image_url to the Llama vision model', seen.model === VISION_MODEL && seen.input.messages[0].content.some((c) => c.type === 'image_url' && c.image_url.url === IMG) && v.rows.length === 6);
failOnce = 1;
t('vision: the one-off licence prompt is accepted and the call retried', (await visionJson(env, IMG, 'p')).rows.length === 6);
reply = 'I cannot read this';
await tt('vision: unreadable answer is a friendly error', async () => { try { await visionJson(env, IMG, 'p'); return false; } catch (e) { return /could not be read/.test(e.message); } });
reply = JSON.stringify(BOARD);
// the strong model failing falls back to the older one; OpenAI-style answers are understood
const tried = [], realAI = env.AI;
env.AI = { run: async (model) => { tried.push(model); if (model === VISION_MODEL) throw new Error('model unavailable'); return { choices: [{ message: { content: JSON.stringify(BOARD) } }] }; } };
t('vision: falls back to the older model and reads {choices} answers', (await visionJson(env, IMG, 'p')).rows.length === 6 && tried.length === 2 && tried[1] === FALLBACK_VISION_MODEL);
t('vision: the strong model is Llama 4 Scout', /llama-4-scout/.test(VISION_MODEL));
env.AI = realAI;

// ---------- insights ----------
const T0 = Date.parse('2026-11-09T12:00:00Z');
const snap = (at, rows, us) => ({ taken_at: at, rows: rows.map((r, i) => ({ rank: i + 1, club: r[0], vp: r[1], m: r[2], avg: r[3] })), us });
const earlier = snap(T0 - 10 * H, [['Shadow Assassin', 11000, 43, 255.8], ['I BANDITI', 7500, 49, 153], ['Phoenix Fire', 7400, 43, 172.1], ['Fantastic', 6600, 48, 137.5]], 2);
const later = snap(T0, [['Shadow Assassin', 11976, 47, 254.81], ['Phoenix Fire', 7711, 45, 171.36], ['I BANDITI', 7659, 50, 153.18], ['Fantastic', 6612, 49, 134.94]], 1);
const ins = boardInsights(later, [earlier], { season: DEFAULT_SEASON, now: T0 });
t('insights: rank, VP and the gaps to #1 (4,265) and to the club below (52)', ins.rank === 2 && ins.vp === 7711 && ins.gaps.leader === 4265 && ins.gaps.above === 4265 && ins.gaps.below === 52 && ins.near.below === 'I BANDITI' && ins.near.leader === 'Shadow Assassin');
t('insights: movement since the last photo – up a place, +311 VP, lost ground on the leader, stretched away from the club below', ins.delta.rank === 1 && ins.delta.vp === 311 && ins.delta.hours === 10 && ins.delta.leaderGap === -665 && ins.delta.belowGap === 152);
t('insights: our pace is 31.1 VP/h and the club below is on 15.9', ins.pace.mine === 31.1 && ins.pace.below === 15.9);
t('insights: the club below is not catching us at this pace; we are pulling away', ins.pace.caughtByBelowIn === null);
t('insights: season clock reads Day 19/42', ins.season.day === 19 && ins.season.total === 42 && ins.season.daysLeft > 20);
t('insights: projection is VP now + pace × time left', ins.forecast.projected > 7711 && ins.forecast.needPerDayForFirst > 0);
t('insights: efficiency vs the leader and top five', ins.efficiency.avg === 171.36 && ins.efficiency.leaderAvg === 254.81 && ins.efficiency.matchesToLead > 0);
t('insights: advice cites the numbers and starts with the rank move', /Up 1 place/.test(ins.advice[0]) && ins.advice.some((a) => /52 VP/.test(a)) && ins.advice.some((a) => /Quality/.test(a)));
const noHist = boardInsights(later, [], { season: null, now: T0 });
t('insights: first ever photo works with no history', noHist.delta === null && noHist.pace === null && noHist.forecast === null && noHist.advice.length > 0);
t('seasonClock: before, inside and after the season', seasonClock(DEFAULT_SEASON, Date.parse('2026-10-22T08:00:00Z')).day === 1 && seasonClock(DEFAULT_SEASON, Date.parse('2026-12-03T23:00:00Z')).day === 42 && seasonClock(DEFAULT_SEASON, Date.parse('2026-12-05T00:00:00Z')).over);
const lad = ladder(later, earlier);
t('ladder: every row carries its VP and rank change', lad[1].dVp === 311 && lad[1].dRank === 1 && lad[1].us && lad[0].dVp === 976);
const ser = boardSeries([earlier, later]);
t('series: one point per photo, rivals tracked by name', ser.points.length === 2 && ser.points[1].rank === 2 && ser.clubs[0] === 'Phoenix Fire' && ser.points[0].by['Shadow Assassin'] === 11000);
t('tableText: marks our row, keeps the top three and a gap', ((s) => /▶/.test(s) && /Shadow Assassin/.test(s) && /\+311/.test(s))(tableText(lad, 1)) && /…/.test(tableText(ladder(snap(T0, Array.from({ length: 12 }, (_, i) => [`C${i}`, 1000 - i * 10, 10, 100]), 9), null), 9)));
t('sparkline: lowest to highest', sparkline([1, 5, 9]) === '▁▅█' && sparkline([5]) === '');

// ---------- season rankings ----------
const card = (id, name, m, w, g, vp) => ({ user_id: id, name, stats: { matches: m, wins: w, goals: g, myVp: vp, clubVp: 17520 }, qc: { warnings: [] }, at: 1 });
const sb = seasonBoard([card('1', 'Ace', 200, 150, 120, 400), card('2', 'Bee', 180, 100, 70, 220), card('3', 'Cy', 190, 90, 60, 200), card('4', 'Di', 60, 10, 5, 40), card('5', 'Ed', 170, 85, 50, 190)]);
t('rankings: ordered by VP, ranks per measure, totals', sb.people[0].name === 'Ace' && sb.people[0].rank.vp === 1 && sb.people[0].rank.winRate === 1 && sb.totals.people === 5 && sb.totals.matches === 800);
t('rankings: praise the standouts, flag the person falling behind', sb.praise.includes('1') && sb.concern.includes('4') && !sb.concern.includes('1'));
t('rankings: under four cards nobody is graded', seasonBoard([card('1', 'A', 10, 5, 5, 50)]).people[0].grade === null);

// ---------- routes ----------
env.DISCORD_BOT_TOKEN = 'bot';
sqlite.exec("INSERT INTO discord_channels (server_id, channel_id, purpose) VALUES ((SELECT id FROM discord_servers LIMIT 1), '80001', 'rush_board'), ((SELECT id FROM discord_servers LIMIT 1), '80002', 'season_stats')");
const posts = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const m = String(url).match(/\/channels\/(\w+)\/messages$/);
  if (m) { posts.push({ channel: m[1], ...JSON.parse(init.body) }); return Response.json({ id: `msg${posts.length}` }); }
  return realFetch(url, init);
};
const mgr = await login('600', ['mgr'], 'Coach');
const mem = await login('500', [], 'Player One');
const mem2 = await login('501', [], 'Player Two');

setFlags({ rushBoard: 'owner', seasonCards: 'owner' });
t('flags: both features are dark for managers and members until switched on', (await call(mgr, '/api/lb')).s === 404 && (await call(mem, '/api/seasoncard')).s === 404);
t('flags ship owner-only in config.json', JSON.parse(JSON.stringify((await import('../config.json', { with: { type: 'json' } })).default.features)).rushBoard === 'owner');
setFlags({ rushBoard: 'members', seasonCards: 'members' });

t('board: empty before the first photo', (await call(mem, '/api/lb')).d.latest === null);
t('board: a member cannot scan or save (403)', (await call(mem, '/api/lb/scan', { image: IMG })).s === 403 && (await call(mem, '/api/lb/save', { rows: [] })).s === 403);
t('board: a bad image is refused before the model is called', (await call(mgr, '/api/lb/scan', { image: 'hello' })).s === 400);
const scan = await call(mgr, '/api/lb/scan', { image: IMG });
t('board: scan returns the rows, our row and the checks without saving', scan.s === 200 && scan.d.rows.length === 6 && scan.d.us === 1 && scan.d.qc.errors.length === 0 && sqlite.prepare('SELECT COUNT(*) n FROM rush_boards').get().n === 0);
const s1 = await call(mgr, '/api/lb/save', { rows: scan.d.rows, us: scan.d.us, takenAt: T0 - 10 * H });
t('board: first save stores it and posts to the rush_board channel', s1.s === 200 && s1.d.posted.ok && posts.at(-1).channel === '80001' && sqlite.prepare('SELECT COUNT(*) n FROM rush_boards').get().n === 1);
t('board: the same photo again is refused (409)', (await call(mgr, '/api/lb/save', { rows: scan.d.rows, us: 1, takenAt: T0 - 9 * H })).s === 409);
const moved = clone(scan.d.rows); moved[1].vp += 311; moved[1].m += 2; moved[1].avg = Math.round((moved[1].vp / moved[1].m) * 100) / 100;
const s2 = await call(mgr, '/api/lb/save', { rows: moved, us: 1, takenAt: T0 });
const post2 = posts.at(-1);
t('board: second save works out the movement and posts again', s2.s === 200 && s2.d.insights.delta.vp === 311 && s2.d.insights.delta.hours === 10 && posts.length === 2);
t('board: the post is a Phoenix panel with the table, gaps and advice', post2.flags === 32768 && post2.components.at(-1).accent_color === 0xe8651a && /Rush leaderboard/i.test(plainText(post2)) && /▶/.test(plainText(post2)) && /\+311/.test(plainText(post2)) && /Season 2 · Day/.test(plainText(post2)));
t('board: Phoenix look, no NOREX name or colour', !/norex|c8352c/i.test(JSON.stringify(post2).replace(/norex:\w+(:\w+)*/g, '')));
t('board: invalid numbers are refused with the checks (422)', ((r) => r.s === 422 && r.d.qc.errors.length)(await call(mgr, '/api/lb/save', { rows: (() => { const x = clone(moved); x[3].vp = 99999; return x; })(), us: 1 })));
const view = await call(mem, '/api/lb');
t('board: members see the latest ladder, insights, series and history', view.s === 200 && view.d.ladder.length === 6 && view.d.insights.rank === 2 && view.d.series.points.length === 2 && view.d.history.length === 2 && view.d.canScan === false && view.d.clock.day >= 1);
t('board: managers can set the season clock; members cannot', (await call(mem, '/api/lb/season', { name: 'Season 3', start: '2027-01-01', end: '2027-02-11' })).s === 403
  && (await call(mgr, '/api/lb/season', { name: 'Season 3', start: '2027-02-11', end: '2027-01-01' })).s === 400
  && (await call(mgr, '/api/lb/season', { name: 'Season 3', start: '2027-01-01', end: '2027-02-11', cardsFor: 'Season 2' })).d.season.name === 'Season 3');
t('board: a new season starts a clean history', (await call(mem, '/api/lb')).d.latest === null);
await call(mgr, '/api/lb/season', { name: 'Season 2', start: '2026-10-22', end: '2026-12-03' });
t('board: a manager can remove a bad photo', (await call(mgr, '/api/lb/remove', { id: s2.d.id })).d.history.length === 1);

// ---------- season cards ----------
reply = JSON.stringify(GOOD);
const cscan = await call(mem, '/api/seasoncard/scan', { image: IMG });
t('card: a member scan returns stats + checks without saving', cscan.s === 200 && cscan.d.stats.matches === 241 && cscan.d.qc.errors.length === 0 && sqlite.prepare('SELECT COUNT(*) n FROM rush_season_cards').get().n === 0);
const before = posts.length;
const c1 = await call(mem, '/api/seasoncard/save', { stats: cscan.d.stats });
const cp = posts.at(-1);
t('card: save posts to season_stats with @here and the member, and nobody else', c1.s === 200 && posts.length === before + 1 && cp.channel === '80002' && cp.components[0].content === '@here <@500>' && JSON.stringify(cp.allowed_mentions) === '{"parse":["everyone"],"users":["500"]}');
t('card: the post shows the numbers and the Phoenix look', /241/.test(plainText(cp)) && /189 \(78%\)/.test(plainText(cp)) && /Season 2 Rush card/i.test(plainText(cp)) && cp.components[1].accent_color !== 0xc8352c && !/norex/i.test(JSON.stringify(cp).replace(/norex:\w+(:\w+)*/g, '')));
t('card: wins above matches is refused (422) and nothing is posted', (await call(mem2, '/api/seasoncard/save', { stats: { ...cscan.d.stats, wins: 999 } })).s === 422 && posts.length === before + 1);
t('card: someone else’s club screen is refused', (await call(mem2, '/api/seasoncard/save', { stats: { ...cscan.d.stats, club: 'Fantastic' } })).s === 422);
const c1b = await call(mem, '/api/seasoncard/save', { stats: { ...cscan.d.stats, goals: 150 }, edited: true });
t('card: sending again replaces the earlier card (one per member per season)', c1b.s === 200 && sqlite.prepare('SELECT COUNT(*) n FROM rush_season_cards').get().n === 1 && sqlite.prepare('SELECT stats FROM rush_season_cards').get().stats.includes('150'));
await call(mem2, '/api/seasoncard/save', { stats: { club: 'Phoenix Fire', matches: 120, wins: 30, goals: 10, clubVp: 17520, myVp: 60 } });
t('card: weak numbers are saved but flagged, and managers are told', sqlite.prepare('SELECT qc FROM rush_season_cards WHERE user_id = ?').get('501').qc.includes('Win rate'));
const mv = await call(mem, '/api/seasoncard'), gv = await call(mgr, '/api/seasoncard');
t('card: everyone sees the rankings, only managers see flags, grades and who is missing', mv.d.people.length === 2 && mv.d.people[0].flags === undefined && mv.d.missing === undefined && gv.d.people[1].flags.length > 0 && Array.isArray(gv.d.missing) && gv.d.mine === null && mv.d.mine.user_id === '500');
t('card: members cannot take a card down; managers can', (await call(mem, '/api/seasoncard/remove', { id: gv.d.people[1].id })).s === 403 && (await call(mgr, '/api/seasoncard/remove', { id: gv.d.people[1].id })).d.people.length === 1);

// ---------- scan budget ----------
let limited = 0;
for (let k = 0; k < 8; k++) if ((await call(mem2, '/api/seasoncard/scan', { image: IMG })).s === 429) limited++;
t('budget: a member gets 6 photo reads an hour, then a polite 429', limited >= 2);
done();
