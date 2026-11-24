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
import { commands } from '../core/commands.js';

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

test('match message: crest header, score card, field view, select, three buttons; falls back to text without pictures', () => {
  const full = P.matchPanel(club, latest, withCards(['score', 'field']));
  assert.ok(full.flags & IS_V2);
  const t = plainText(full), imgs = images(full);
  assert.match(t, /Alpha FC 4–0 Beta/); assert.match(t, /MATCH CENTRE · LEAGUE/); assert.match(t, /FIELD VIEW/);
  assert.ok(imgs.some((u) => u.includes('l1.png'))); assert.ok(imgs.some((u) => u.includes('score-4'))); assert.ok(imgs.some((u) => u.includes('field-4')));
  const rows = full.components[0].components.filter((c) => c.type === 1);
  assert.equal(rows[0].components[0].type, 3); assert.deepEqual(rows[1].components.map((b) => b.label), ['Box score', 'Club stats', 'Leaderboard']);
  const bare = P.matchPanel(club, latest, none);
  assert.match(plainText(bare), /`8\.4` Ana/); assert.ok(!images(bare).some((u) => u.includes('score')));
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

test('jobs: all three match cards plus club-wide cards, then nothing once drawn', async () => {
  const jobs = await buildJobs(st, club, [latest]);
  const kinds = jobs.map((j) => j.kind);
  for (const k of ['score', 'field', 'box', 'club', 'results', 'top', 'player']) assert.ok(kinds.includes(k), k);
  assert.equal(jobs.filter((j) => j.kind === 'top').length, 6);
  for (const j of jobs) await st.putCard('100', j.kind, j.ref, j.key);
  assert.equal((await buildJobs(st, club, [latest])).length, 0);
});

test('every card draws as HTML with the club and the neutral palette, nothing club-branded', async () => {
  const jobs = await buildJobs(makeStore(sqliteExecutor((() => { const d = new DatabaseSync(':memory:'); SCHEMA.forEach((s) => d.exec(s)); return d; })())), club, [latest]);
  const players = await st.rosterData('100'), c = { name: 'Alpha FC', crest: club.crest };
  const html = [T.scoreCard(jobs[0].data.m, c), T.fieldCard(jobs[0].data.m, c), T.boxScoreCard(jobs[0].data.m, c), T.clubCard({ ...c, form: ['W'] }), T.resultsCard({ ...c, matches: [jobs[0].data.m] }), T.tableCard(players, 'goals', c), T.playerCard(players[0], c), T.compareCard(players[0], players[1], c), T.bannerCard({ title: 'x' })];
  for (const h of html) { assert.match(h, /^<!doctype html>/); assert.doesNotMatch(h, /e8651a|c8352c|phoenix|norex/i); }
  assert.match(html[0], /l1\.png/); assert.match(html[0], /l2\.png/); // both crests on the score card
});

test('no club-specific branding anywhere in the shipped sources', () => {
  for (const f of ['core/panels.js', 'core/ui.js', 'core/theme.js', 'cards/templates.mjs', 'worker/index.js', 'relay/relay.mjs']) assert.doesNotMatch(fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'), /phoenix|norex|#e8651a|0xe8651a/i, f);
});

test('10 generic commands', () => assert.equal(commands.length, 10));
