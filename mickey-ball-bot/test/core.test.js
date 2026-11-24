import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { makeStore, sqliteExecutor, SCHEMA } from '../core/store.js';
import { normalizeMatch, searchHits } from '../core/ea.js';
import { buildJobs, clubView, streaks } from '../core/data.js';
import { ACCENT, plainText, images, IS_V2 } from '../core/ui.js';
import * as P from '../core/panels.js';
import * as T from '../cards/templates.mjs';
import * as M from '../cards/match.mjs';
import { buildPicture } from '../core/picture.js';
import { buildReview } from '../core/review.js';
import { BOARD_LIST } from '../core/boards.js';
import { findSessions, isDue, buildRecap } from '../core/recap.js';
import { commands } from '../core/commands.js';
import { decodeEvents, boxEv, eventRows, eventSide } from '../core/events.js';
import { parseWhen, zonedToUtc, validZone } from '../core/when.js';
import { eventPanel, schedulePanel, lineupPanel, lineupOf, lineupKey, eventTitle, missing } from '../core/matchday.js';

const db = new DatabaseSync(':memory:'); SCHEMA.forEach((s) => db.exec(s));
const st = makeStore(sqliteExecutor(db));
const env = { PUBLIC_URL: 'https://bot.example' };
const pl = (name, pos, rating, goals, assists) => ({ playername: name, pos, rating: String(rating), goals: String(goals), assists: String(assists), shots: '2', passesmade: '18', passattempts: '20', tacklesmade: '3', tackleattempts: '5', saves: '0', mom: goals > 1 ? '1' : '0' });
const mk = (id, ts, gf, ga, opp) => ({ matchId: id, timestamp: ts, clubs: { 100: { goals: String(gf), details: { name: 'Alpha FC', customKit: { crestAssetId: '1' } } }, 200: { goals: String(ga), details: { name: opp, customKit: { crestAssetId: '2' } } } },
  players: { 100: { a: pl('Ana', 'forward', 8 + gf / 10, gf, 0), b: pl('Ben', 'midfielder', 7, 0, gf) }, 200: { c: pl('Zed', 'goalkeeper', 6, ga, 0) } } });
const club = clubView({ club_id: '100', name: 'Alpha FC', crest: '1' });
const none = () => null;
const withCards = (kinds) => (kind, ref) => (kinds.includes(kind) ? `https://bot.example/c/${kind}-${ref || 'x'}.png` : null);

test('normalize: asked club is home, crests for both sides, type', () => {
  const m = normalizeMatch({ ...mk('1', 1000, 3, 1, 'Beta'), _type: 'playoffMatch' }, '100');
  assert.equal(m.home.name, 'Alpha FC'); assert.equal(m.res, 'W'); assert.equal(m.type, 'playoff');
  assert.match(m.home.crest, /l1\.png$/); assert.match(`https://x/${m.away.crestId}`, /\/2$/);
  assert.equal(normalizeMatch(mk('1', 1000, 3, 1, 'Beta'), '200').res, 'L');
});
test('searchHits shapes EA rows', () => assert.deepEqual(searchHits([{ clubId: '5', clubInfo: { name: 'X', customKit: { crestAssetId: '9' } } }, { clubId: 'bad', clubInfo: { name: 'Y' } }]), [{ id: '5', name: 'X', crest: '9' }]));

for (const r of [mk('1', 1000, 3, 1, 'Beta'), mk('2', 2000, 0, 2, 'Beta'), mk('3', 3000, 2, 2, 'Gamma'), mk('4', 4000, 4, 0, 'Beta')]) await st.saveMatch('100', normalizeMatch(r, '100'));
const latest = await st.storedMatch('100', '4');

test('store keeps one copy and totals', async () => {
  assert.equal(await st.saveMatch('100', normalizeMatch(mk('4', 4000, 4, 0, 'Beta'), '100')), false);
  assert.equal((await st.clubTotals('100')).w, 2);
  assert.equal((await st.playerCard('100', 'ana')).gp, 4);
});

test('stripe colours: win green, draw yellow, loss red, everything else blue', () => {
  assert.equal(ACCENT.win, 0x3ddc84); assert.equal(ACCENT.draw, 0xf5c842); assert.equal(ACCENT.loss, 0xff5a52); assert.equal(ACCENT.info, 0x4aa8ff);
  const accent = (m) => P.matchPanel(club, m, none).components[0].accent_color;
  assert.equal(accent(latest), ACCENT.win);
  assert.equal(accent({ ...latest, res: 'D' }), ACCENT.draw);
  assert.equal(accent({ ...latest, res: 'L' }), ACCENT.loss);
  assert.equal(P.helpPanel(env).components[0].accent_color, ACCENT.info);
  assert.equal(P.clubPanel(club, { gp: 4, w: 2, d: 1, l: 1, gf: 9, ga: 5 }, ['W'], { n: 1, res: 'W' }, none).components[0].accent_color, ACCENT.info);
});

test('match message: big board, divider, then pitch and review in two columns; select, three buttons; falls back to text without pictures', () => {
  const full = P.matchPanel(club, latest, withCards(['board', 'pitch', 'review']));
  assert.ok(full.flags & IS_V2);
  const t = plainText(full), imgs = images(full);
  assert.match(t, /Alpha FC vs Beta/); assert.match(t, /MATCH CENTRE · LEAGUE/);
  assert.ok(imgs.some((u) => u.includes('l1.png')));
  const kids = full.components[0].components;
  const gal = kids.map((c, i) => [c.type, c.items?.map((x) => x.media.url.match(/c\/(\w+)-/)?.[1]), i]).filter(([ty]) => ty === 12 || ty === 14);
  assert.deepEqual(gal.map(([ty, it]) => [ty, it]), [[12, ['board']], [14, undefined], [12, ['pitch', 'review']]]); // big picture, faint divider, two columns
  assert.equal(kids.find((c) => c.type === 14 && kids.indexOf(c) === gal[1][2]).divider, true);
  const rows = kids.filter((c) => c.type === 1);
  assert.equal(rows[0].components[0].type, 3); assert.deepEqual(rows[1].components.map((b) => b.label), ['Box score', 'Club stats', 'Leaderboard']);
  const bare = P.matchPanel(club, latest, none);
  assert.match(plainText(bare), /Alpha FC 4–0 Beta/); assert.match(plainText(bare), /`8\.4` Ana/); assert.ok(!images(bare).some((u) => u.includes('/c/')));
  assert.deepEqual(images(P.matchPanel(club, latest, withCards(['board']))).filter((u) => u.includes('/c/')).length, 1); // no divider or empty row when the others are missing
});

test('every other message builds and stays on the shared layout', async () => {
  const rows = await st.allResults('100'), u = withCards(['club', 'results', 'player', 'top']);
  const msgs = [
    P.boxPanel(club, latest, none), P.personalPanel(club, latest, latest.home.players[0], await st.playerCard('100', 'Ana')),
    P.clubPanel(club, await st.clubTotals('100'), ['W', 'L'], streaks(rows), u), P.resultsPanel(club, await st.recentResults('100', 5), u),
    P.playerPanel(club, 'Ana', await st.playerCard('100', 'Ana'), u), P.comparePanel(club, await st.playerCard('100', 'Ana'), await st.playerCard('100', 'Ben'), null),
    P.leaderboardPanel(club, 'goals', (await st.leaderboard('100', 'goals')).rows, u), P.historyPanel(env, club, 'beta', await st.headToHead('100', 'beta')),
    ...['form', 'last5', 'streaks'].map((k) => P.insightPanel(env, club, k, rows, streaks(rows))), P.helpPanel(env),
    P.pickerPanel(env, [{ id: '1', name: 'A', crest: '1' }], 'a', 'stats', 1, () => null), P.trackedPanel(env, club, 4, '123'), P.trackedList(env, []), P.opponentsPanel(env, club, []),
  ];
  for (const m of msgs) { assert.ok(m.flags & IS_V2); assert.equal(m.components.length, 1); assert.equal(m.components[0].type, 17); assert.ok(plainText(m).length > 3); }
  assert.match(plainText(msgs[4]), /Ana/);
});

test('jobs: all the match pictures plus club-wide cards, then nothing once drawn', async () => {
  const jobs = await buildJobs(st, club, [latest]);
  const kinds = jobs.map((j) => j.kind);
  for (const k of ['board', 'pitch', 'review', 'box', 'club', 'results', 'top', 'player']) assert.ok(kinds.includes(k), k);
  assert.equal(jobs.filter((j) => j.kind === 'top').length, 17);
  for (const j of jobs) await st.putCard('100', j.kind, j.ref, j.key);
  assert.equal((await buildJobs(st, club, [latest])).length, 0);
});

test('every card draws as HTML with the club and the neutral palette, nothing club-branded', async () => {
  const fresh = makeStore(sqliteExecutor((() => { const d = new DatabaseSync(':memory:'); SCHEMA.forEach((x) => d.exec(x)); return d; })()));
  const jobs = await buildJobs(fresh, club, [latest]);
  const players = await st.rosterData('100'), c = { name: 'Alpha FC', crest: club.crest }, by = (k) => jobs.find((j) => j.kind === k);
  const html = [M.boardCard(by('board').data.mp, c), M.pitchCard(by('pitch').data.mp, c), M.reviewCard(by('review').data.model, c), T.boxScoreCard(by('box').data.m, c), T.clubCard({ ...c, form: ['W'] }), T.resultsCard({ ...c, matches: [by('box').data.m] }), T.tableCard(players, 'goals', c), T.playerCard(players[0], c), T.compareCard(players[0], players[1], c), T.bannerCard({ title: 'x' })];
  for (const h of html) { assert.match(h, /^<!doctype html>/); assert.doesNotMatch(h, /e8651a|c8352c|phoenix|norex/i); }
  assert.match(html[0], /l1\.png/); assert.match(html[0], /l2\.png/); // both crests on the board
});

test('no club-specific branding anywhere in the shipped sources', () => {
  for (const f of ['core/panels.js', 'core/ui.js', 'core/theme.js', 'cards/templates.mjs', 'cards/match.mjs', 'core/picture.js', 'core/review.js', 'worker/index.js', 'worker/matchday.js', 'relay/relay.mjs']) assert.doesNotMatch(fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'), /phoenix|norex|#e8651a|0xe8651a/i, f);
});

test('13 generic commands: stats plus match day', () => assert.deepEqual(commands.map((c) => c.name).sort(), ['club', 'compare', 'help', 'history', 'host', 'insight', 'last', 'leaderboard', 'lineup', 'matchday', 'match', 'player', 'results'].sort()));


// ---------- decoded event stats ----------
const withEv = (p, agg) => ({ ...p, match_event_aggregate_0: agg });
const EVM = { ...mk('9', 9000, 2, 1, 'Delta'), players: { 100: { a: withEv(pl('Ana', 'forward', 8.2, 2, 0), '6:3,30:5,108:2,109:4,110:6,105:1,106:2,107:0,265:2,266:1,111:8,219:2'), b: withEv(pl('Ben', 'midfielder', 7, 0, 2), '6:1,30:2,215:20,216:5'), c: pl('Cy', 'defender', 6.5, 0, 0) },
  200: { z: withEv(pl('Zed', 'goalkeeper', 6, 1, 0), '6:2,110:3,111:1,219:1') } } };
const evMatch = normalizeMatch(EVM, '100');

test('event counters decode into named stats and box columns', () => {
  const e = decodeEvents('6:3,30:5,215:20,216:5');
  assert.equal(e.interceptions, 3); assert.equal(e.passesCompletedForward, 5); assert.equal(e.passesCompleted, 20);
  const b = boxEv('6:3,30:5,108:2,109:4,110:6,105:1,106:2,265:2,266:1,111:8,219:2');
  assert.deepEqual(b, { fwd: 5, int: 3, won: 12, lost: 3, aer: 3, pos: 80 });
  assert.equal(boxEv(''), null); assert.equal(eventSide([{ ev: '' }]), null);
});

test('events travel with the match: both sides, summed, us first then them', () => {
  assert.ok(evMatch.home.players.find((p) => p.name === 'Ana').ev.includes('6:3'));
  assert.ok(evMatch.away.players[0].ev);
  const x = eventRows(evMatch.home.players, evMatch.away.players);
  assert.equal(x.apps, 2); assert.equal(x.of, 3);
  const ints = x.rows.find((r) => r.k === 'Interceptions'); assert.equal(ints.a, 4); assert.equal(ints.b, 2);
  assert.equal(x.rows.find((r) => r.k === 'Players in position').u, '%');
  assert.equal(eventRows(latest.home.players, latest.away.players), null); // a match with no counters says nothing rather than zeros
});

test('stored per player, summed over history, and back-filled onto an older copy', async () => {
  await st.saveMatch('100', normalizeMatch({ ...EVM, matchId: '8', timestamp: 8000 }, '100'));
  const old = normalizeMatch({ ...EVM, matchId: '7', timestamp: 7000 }, '100'); old.home.players.forEach((p) => { p.ev = ''; });
  await st.saveMatch('100', old);
  assert.equal((await st.storedMatch('100', '7')).home.players[0].ev, '');
  assert.equal(await st.saveMatch('100', normalizeMatch({ ...EVM, matchId: '7', timestamp: 7000 }, '100')), false); // not new, but the counters are added
  assert.ok((await st.storedMatch('100', '7')).home.players.some((p) => p.ev));
  const e = await st.playerEvents('100', 'Ana');
  assert.equal(e.apps, 2); assert.equal(e.ints, 6); assert.equal(await st.playerEvents('100', 'Nobody'), null);
  const board = await st.leaderboard('100', 'ints');
  assert.equal(board.rows[0].player, 'Ana'); assert.equal(board.rows[0].shown, 6);
  const roster = await st.rosterData('100');
  assert.equal(roster.find((p) => p.n === 'Ana').ev.ints, 6);
});

test('messages and cards show the event data', async () => {
  const m = await st.storedMatch('100', '8'), c = { name: 'Alpha FC', crest: club.crest };
  assert.match(plainText(P.matchPanel(club, m, none)), /From the event data[\s\S]*Interceptions: \*\*4\*\* vs 2/);
  assert.match(plainText(P.boxPanel(club, m, none)), /int 3 · won 12/);
  assert.match(plainText(P.personalPanel(club, m, m.home.players[0], null)), /Interceptions \*\*3\*\*/);
  assert.match(plainText(P.playerPanel(club, 'Ana', await st.playerCard('100', 'Ana'), none, await st.playerEvents('100', 'Ana'))), /From the event data/);
  assert.match(plainText(P.leaderboardPanel(club, 'ints', (await st.leaderboard('100', 'ints')).rows, none)), /Most interceptions/);
  const draw = (await buildJobs(st, club, [m], { clubWide: false })).find((j) => j.kind === 'box').data.m;
  const box = T.boxScoreCard(draw, c);
  assert.match(box, />Int</); assert.match(box, /From the event data/); assert.match(box, /vs Delta|Us first, then Delta/);
  assert.doesNotMatch(T.boxScoreCard({ ...draw, ps: draw.ps.map((p) => ({ ...p, ev: null })), evx: null }, c), />Int</); // no counters: no empty columns
  const roster = await st.rosterData('100');
  assert.match(T.playerCard(roster.find((p) => p.n === 'Ana'), c), /From the event data/);
  assert.match(T.tableCard(roster, 'ints', c), /Interceptions/);
});

// ---------- match days ----------
test('time words are read in the host zone', () => {
  const now = Date.parse('2026-11-24T12:00:00Z');
  const w = parseWhen('fri 8:30pm', 'America/New_York', now);
  assert.deepEqual(w, { date: '2026-11-27', time: '20:30' });
  assert.equal(new Date(zonedToUtc(w.date, w.time, 'America/New_York')).toISOString(), '2026-11-28T01:30:00.000Z');
  assert.ok(parseWhen('nonsense', 'UTC', now).error); assert.ok(parseWhen('yesterday 9pm', 'UTC', now).error);
  assert.ok(validZone('Europe/London')); assert.ok(!validZone('Mars/Base'));
});

const EV = { id: 'ab12cd34', guild_id: 'g', channel_id: 'c', message_id: 'm', kind: 'league', title: eventTitle('league', 'Rivals FC'), opponent: 'Rivals FC', start: Date.now() + 864e5, duration: 120, players: 11, notes: 'Lobby: abc' };
const RS = [{ user_id: '1', name: 'Ana', status: 'yes', pos: 'ST', checked_in: 1 }, { user_id: '2', name: 'Ben', status: 'yes', pos: 'CB' }, { user_id: '3', name: 'Cy', status: 'maybe' }, { user_id: '4', name: 'Di', status: 'no' }];

test('match day post: time, counts, names, gaps, three answer buttons and a position picker; blue', () => {
  const p = eventPanel(EV, RS, { club });
  assert.equal(p.components[0].accent_color, ACCENT.info);
  const t = plainText(p);
  assert.match(t, /League vs Rivals FC/); assert.match(t, /2\/11/); assert.match(t, /🟢Ana `ST`/); assert.match(t, /Maybe \(1\)/); assert.match(t, /goalkeeper/); assert.match(t, /Lobby: abc/);
  assert.ok(images(p).some((u) => u.includes('l1.png')));
  const rows = p.components[0].components.filter((c) => c.type === 1);
  assert.deepEqual(rows[0].components.map((b) => b.label), ['In', 'Maybe', 'Out']);
  assert.deepEqual(rows[0].components.map((b) => b.custom_id), ['ml:ev:ab12cd34:yes', 'ml:ev:ab12cd34:maybe', 'ml:ev:ab12cd34:no']);
  assert.equal(rows[1].components[0].type, 3); assert.equal(rows[1].components[0].custom_id, 'ml:evp:ab12cd34');
  assert.ok(!plainText(eventPanel(EV, RS, { answers: false })).includes('undefined'));
  assert.equal(eventPanel(EV, RS, { answers: false, who: true }).components[0].components.filter((c) => c.type === 1).length, 0);
  assert.deepEqual(missing({ players: 3 }, [{ status: 'yes', pos: 'GK' }]), ['2 more players']);
});

test('schedule lists events with their own buttons; lineup places players by line and keys change with sign-ups', () => {
  const s = schedulePanel([EV], () => ({ yes: 2, maybe: 1, no: 1 }), club);
  assert.match(plainText(s), /✅ 2\/11/); assert.ok(plainText(schedulePanel([], () => ({}))).includes('Nothing scheduled'));
  const L = lineupOf(RS);
  assert.deepEqual(L.placed.map((p) => [p.n, p.pos]), [['Ana', 'forward'], ['Ben', 'defender']]); assert.deepEqual(L.maybe, ['Cy']);
  const k1 = lineupKey(EV, L), k2 = lineupKey(EV, lineupOf([...RS, { user_id: '5', name: 'Ed', status: 'yes', pos: 'GK' }]));
  assert.notEqual(k1, k2); assert.match(k1, /^events\/ab12cd34\/lineup-[a-z0-9]+\.png$/);
  const pic = T.lineupCard({ ...L, title: EV.title }, { name: 'Alpha FC' });
  assert.match(pic, /ST/); assert.match(pic, /Ana/);
  assert.match(plainText(lineupPanel(EV, RS, null, club)), /Defence[\s\S]*CB.* Ben/);
  assert.ok(images(lineupPanel(EV, RS, 'https://x/y.png', club)).includes('https://x/y.png'));
});

test('match days are stored per server and answers replace each other', async () => {
  await st.addEvent({ id: 'e1', guild: 'g1', channel: 'c', club: '100', kind: 'league', title: 'League night', start: Date.now() + 3600_000 * 5, duration: 120, tz: 'UTC', players: 11, by: 'u' });
  await st.addEvent({ id: 'e2', guild: 'g1', channel: 'c', kind: 'friendly', title: 'Friendly', start: Date.now() + 3600_000 * 30, duration: 90, tz: 'UTC', players: 5, by: 'u' });
  assert.deepEqual((await st.upcoming('g1', 5)).map((e) => e.id), ['e1', 'e2']); assert.equal((await st.upcoming('g2', 5)).length, 0);
  await st.answer('e1', 'u1', 'Ana', 'maybe'); await st.answer('e1', 'u1', 'Ana', 'yes'); await st.setPos('e1', 'u1', 'Ana', 'ST'); await st.checkIn('e1', 'u2', 'Ben');
  const rs = await st.rsvps('e1');
  assert.equal(rs.length, 2); assert.equal(rs.find((r) => r.user_id === 'u1').pos, 'ST'); assert.equal(rs.find((r) => r.user_id === 'u2').checked_in, 1);
  assert.equal((await st.countsFor('g1')).get('e1|yes'), 2);
  assert.equal((await st.dueReminders()).length, 0); // 5 h away: not yet
  await st.setTz('u1', 'Europe/London'); assert.equal(await st.getTz('u1'), 'Europe/London');
  await st.cancelEvent('e2'); assert.equal((await st.upcoming('g1', 5)).length, 1);
});

test('the first tracked club is the main one, and /match main moves it', async () => {
  await st.track('gm', { id: '100', name: 'Alpha FC', crest: '1' }, 'c1', 'u'); await st.track('gm', { id: '200', name: 'Beta', crest: '2' }, 'c2', 'u');
  assert.deepEqual((await st.trackedFor('gm')).map((r) => [r.club_id, r.main]), [['100', 1], ['200', 0]]);
  await st.setMain('gm', '200'); assert.equal((await st.trackedFor('gm'))[0].club_id, '200');
  await st.untrack('gm', '200'); assert.equal((await st.trackedFor('gm'))[0].main, 1); // removing the main club promotes the next
});

// ---------- the big board, review and leaderboards ----------
test('board numbers: paired rows with deltas, deeper event stats only where counters exist', async () => {
  const mp = buildPicture(evMatch);
  assert.deepEqual(mp.rows.map((r) => r.k), ['Shots', 'Passes completed', 'Pass accuracy', 'Tackles won', 'Tackle success', 'Average rating']);
  assert.deepEqual(mp.deeper.rows.map((r) => r.k), ['Shots on target', 'Forward passes', 'Aerial duels won', 'Possession won', 'Fouls conceded', 'In position']);
  assert.equal(mp.deeper.cover.us, 2); assert.equal(mp.deeper.cover.of, 3); assert.equal(mp.deeper.cover.them, 1);
  assert.equal(buildPicture(latest).deeper, null);
  const html = M.boardCard(mp, { name: 'Alpha FC', crest: null });
  assert.match(html, /Deeper stats/); assert.match(html, /EA event counters · 2 of 3 of ours, 1 of 1 of theirs/); assert.match(html, /Ahead/);
  assert.doesNotMatch(M.boardCard(buildPicture(latest), { name: 'Alpha FC' }), /Deeper stats/);
  assert.equal(mp.motm.n, 'Ana'); assert.deepEqual(mp.contrib.map((c) => c.n), ['Ana', 'Ben']);
});

test('review: honest wording, no names in problems, event data section, skipped for unfinished games', () => {
  const m = normalizeMatch({ ...EVM, matchId: 'r1', timestamp: 1 }, '100');
  const rv = buildReview(m);
  assert.ok(rv.title); assert.ok(rv.good.length >= 1); assert.equal(rv.opp, 'Delta'); assert.equal(rv.shape.humans, 3);
  assert.ok(rv.ev.rows.some((r) => r.k === 'Interceptions'));
  const html = M.reviewCard(rv, { name: 'Alpha FC' });
  assert.match(html, /How we lined up/); assert.match(html, /What went well/); assert.match(html, /What to work on/); assert.match(html, /From the event data/);
  const unfinished = { ...m, dnf: true }; assert.equal(buildReview(unfinished), null);
  assert.equal(buildReview({ ...m, home: { ...m.home, players: m.home.players.map((p) => ({ ...p, secs: 300 })) } }), null);
  assert.ok(buildReview(latest)); // older stored matches carry no minutes and count as full
  assert.match(M.reviewCard(buildReview(latest), { name: 'Alpha FC' }), /No event counters/);
});

test('leaderboards: any stat, picker under the board, a card for each', async () => {
  assert.ok(BOARD_LIST.length >= 15 && BOARD_LIST.length <= 25); // a slash command takes at most 25 choices
  assert.equal(commands.find((c) => c.name === 'leaderboard').toJSON().options.find((o) => o.name === 'stat').choices.length, BOARD_LIST.length);
  const roster = await st.rosterData('100');
  for (const b of BOARD_LIST) {
    const board = await st.leaderboard('100', b.key);
    const msg = P.leaderboardPanel(club, b.key, board.rows, none);
    if (board.rows.length) assert.ok(plainText(msg).includes(b.title), b.key); else assert.match(plainText(msg), /data yet/i);
    const sel = msg.components[0].components.find((c) => c.type === 1 && c.components[0].type === 3).components[0];
    assert.equal(sel.custom_id, 'ml:lbs:100'); assert.equal(sel.options.find((o) => o.default).value, b.key); assert.equal(sel.options.length, BOARD_LIST.length);
    assert.match(T.tableCard(roster, b.key, { name: 'Alpha FC' }), /<!doctype html>/);
  }
  assert.ok((await st.leaderboard('100', 'shots')).rows[0].v > 0); assert.ok((await st.leaderboard('100', 'thru')).rows.length >= 0);
  assert.match(plainText(P.leaderboardPanel(club, 'ints', [], none)), /event counters/);
});

// ---------- session recap ----------
const mkAt = (id, minsAgo, gf, ga, opp, evAgg) => normalizeMatch({ ...mk(id, Math.floor(Date.now() / 1000) - minsAgo * 60, gf, ga, opp), players: { 100: { a: withEv(pl('Ana', 'forward', 8 + gf / 10, gf, 0), evAgg), b: withEv(pl('Ben', 'midfielder', 7, 0, gf), evAgg) }, 200: { c: pl('Zed', 'goalkeeper', 6, ga, 0) } } }, '100');

test('sessions: runs of matches with no long gap; due only when over, fresh and long enough', () => {
  const now = Math.floor(Date.now() / 1000);
  const ms = [mkAt('s1', 400, 2, 0, 'A'), mkAt('s2', 380, 1, 1, 'B'), mkAt('s3', 200, 3, 1, 'C'), mkAt('s4', 170, 0, 2, 'D'), mkAt('s5', 100, 1, 0, 'E'), mkAt('s6', 80, 2, 0, 'F')];
  const ss = findSessions('100', ms);
  assert.deepEqual(ss.map((s) => s.matches.length), [2, 2, 2]); assert.equal(ss[0].key, 'recap:100:s1');
  assert.deepEqual(ss.map((s) => isDue(s, now)), [false, true, true]); // the oldest is past the 6 h freshness window
  const live = findSessions('100', [mkAt('l1', 50, 1, 0, 'A'), mkAt('l2', 20, 1, 0, 'B')]); assert.equal(isDue(live[0], now), false); // still going: the last match was 20 min ago
  assert.equal(isDue(findSessions('100', [mkAt('o1', 100, 1, 0, 'A')])[0], now), false); // one match is not a session
});

test('recap numbers: record, scorers, best average, man of the match, standout stats, work-ons', () => {
  const r = buildRecap(findSessions('100', [mkAt('a1', 200, 3, 1, 'Cee', '6:4,110:6,111:12,219:2'), mkAt('a2', 170, 0, 2, 'Dee', '6:5,110:6,111:12,219:2')])[0]);
  assert.deepEqual([r.w, r.d, r.l, r.gf, r.ga, r.cs, r.count], [1, 0, 1, 3, 3, 0, 2]);
  assert.equal(r.scorers[0].n, 'Ana'); assert.equal(r.best[0].apps, 2); assert.equal(r.matches[0].oppCrest.includes('l2.png'), true);
  assert.equal(r.standout.matches, 2); assert.ok(r.standout.lines.some((x) => x.k === 'Interceptions' && x.v >= 8));
  assert.ok(r.work.length >= 1 && r.work.length <= 3);
  assert.equal(buildRecap(findSessions('100', [mkAt('b1', 200, 2, 0, 'A'), mkAt('b2', 170, 1, 0, 'B')])[0]).standout, null); // no counters: the stats section says so
});

test('recap message: banner, header, record facts, matches picture, sections, footer; colour by the night', () => {
  const r = buildRecap(findSessions('100', [mkAt('c1', 200, 3, 1, 'Cee', '6:4,110:6,111:12,219:2'), mkAt('c2', 170, 2, 0, 'Dee')])[0]);
  const withCard = P.recapPanel(env, club, r, (k) => (k === 'recap' ? 'https://bot.example/c/recap.png' : null)), t = plainText(withCard);
  assert.equal(withCard.components[0].accent_color, ACCENT.win); assert.match(t, /2 from 2/); assert.match(t, /SESSION RECAP/); assert.match(t, /Record\*\* 2W 0D 0L/); assert.match(t, /STANDOUT STATS/); assert.match(t, /WHAT TO WORK ON/);
  assert.ok(images(withCard).some((u) => u.includes('banners/recap'))); assert.ok(images(withCard).includes('https://bot.example/c/recap.png'));
  assert.match(plainText(P.recapPanel(env, club, r, none)), /✅ \*\*3–1\*\* Cee/); // no picture: the matches as text
  const lost = { ...r, w: 0, l: 2 }, level = { ...r, w: 1, l: 1 };
  assert.equal(P.recapPanel(env, club, lost, none).components[0].accent_color, ACCENT.loss); assert.equal(P.recapPanel(env, club, level, none).components[0].accent_color, ACCENT.draw);
  assert.match(M.recapCard(r, { name: 'Alpha FC', crest: club.crest }), /2 WON, 0 DRAWN, 0 LOST/);
});
