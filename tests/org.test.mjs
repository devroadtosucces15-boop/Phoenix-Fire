// Phase 2 data layer: one organization, three EA clubs. The club list comes from the Worker (/api/org/clubs/public) with
// data/org.json as the last snapshot and config.json homeClubId as the fallback; the combined view is the default, every match
// mode is in, every match keeps its source club ID, a player across clubs is one identity, and a match counts once.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { t, tt, done } from './lib.mjs';
import { combineMatches, combineOrg, loadOrgClubs, orgKey, orgOverview, resolveOrgClubs, resolveRoute, readSnapshot } from '../scripts/lib/org.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const A = '1111', B = '2222', C = '3333'; // A = primary (config.homeClubId)
const quiet = () => {};

// ---------- fixtures ----------
const club = (id, name, members, overall = {}) => ({ id, tier: 'home', fetchedAt: '2026-11-09T00:00:00Z', info: { name }, overall: { gamesPlayed: '10', wins: '6', ties: '2', losses: '2', goals: '20', goalsAgainst: '10', ...overall }, members, career: members.map((m) => ({ name: m.name, gamesPlayed: m.gamesPlayed, goals: m.goals })) });
const mem = (name, gp, goals, rating = '7.0') => ({ name, gamesPlayed: String(gp), goals: String(goals), assists: '1', ratingAve: rating, manOfTheMatch: '1', proOverall: '80', winRate: '50' });
const side = (win, goals, name) => ({ wins: win === 'W' ? '1' : '0', losses: win === 'L' ? '1' : '0', goals: String(goals), goalsAgainst: '0', name });
const mt = (matchId, ts, type, clubs, players = {}) => ({ matchId, timestamp: ts, matchType: type, clubs, players });
const rec = { [A]: club(A, 'Phoenix Fire', [mem('Dual', 10, 5, '8.0'), mem('Alpha', 8, 2)]), [B]: club(B, 'Phoenix Mixed', [mem('dual', 5, 4, '6.0'), mem('Bravo', 7, 1)], { gamesPlayed: '5', wins: '3', ties: '1', losses: '1', goals: '9', goalsAgainst: '4' }), [C]: club(C, 'Phoenix Rush', [mem('Charlie', 3, 3)], { gamesPlayed: '3', wins: '1', ties: '1', losses: '1', goals: '5', goalsAgainst: '5' }) };
const matches = [
  mt('m1', 1000, 'leagueMatch', { [A]: side('W', 2, 'Phoenix Fire'), 9001: side('L', 1, 'Opp One') }, { [A]: { p1: { playername: 'Dual', goals: '2', rating: '9' } } }),
  mt('m2', 2000, 'playoffMatch', { [B]: side('W', 3, 'Phoenix Mixed'), 9002: side('L', 0, 'Opp Two') }, { [B]: { p1: { playername: 'dual', goals: '1', rating: '7' } } }),
  mt('m3', 3000, 'friendlyMatch', { [C]: side('D', 1, 'Phoenix Rush'), 9003: side('D', 1, 'Opp Three') }, { [C]: { p3: { playername: 'Charlie', goals: '1', rating: '7' } } }),
  // a derby: two of our clubs against each other (EA lists it under both clubs, so it is fetched twice – the archive keeps the matchId once)
  mt('m4', 4000, 'leagueMatch', { [A]: side('W', 2, 'Phoenix Fire'), [B]: side('L', 1, 'Phoenix Mixed') }, { [A]: { p1: { playername: 'Dual', goals: '1', rating: '8' } }, [B]: { p4: { playername: 'Bravo', goals: '1', rating: '6' } } }),
  mt('m4', 4000, 'leagueMatch', { [A]: side('W', 2, 'Phoenix Fire'), [B]: side('L', 1, 'Phoenix Mixed') }), // the same matchId again
  mt('x5', 5000, 'leagueMatch', { [A]: side('W', 4, 'Phoenix Fire'), 9004: side('L', 0, 'Opp Four') }), // ... and a duplicate that arrives under another matchId
  mt('y5', 5000, 'leagueMatch', { [A]: side('W', 4, 'Phoenix Fire'), 9004: side('L', 0, 'Opp Four') }),
  mt('z6', 6000, 'leagueMatch', { 9005: side('W', 1, 'Stranger'), 9006: side('L', 0, 'Other') }), // not ours at all
];
const cfgClubs = [{ ea_club_id: A, display_name: 'Phoenix Fire', division_id: 1 }, { ea_club_id: B, display_name: 'Phoenix Mixed', division_id: 2 }, { ea_club_id: C, display_name: 'Phoenix Rush', division_id: 2 }];
const org3 = { source: 'api', clubs: cfgClubs.map((c) => ({ sync_members: true, sync_matches: true, ...c })), ids: [A, B, C], primary: A };

// ---------- where the club list comes from ----------
const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'norex-org-'));
const dataDir = path.join(tmp, 'live'); fs.mkdirSync(dataDir);
const config = { homeClubId: 1111, siteTitle: 'Phoenix Fire', members: { api: 'https://worker.test' } };
const SECRET = 's3cret';
let seen = null, body = { clubs: cfgClubs.map((c) => ({ ...c, sync_members: 1, sync_matches: 1 })) };
const fetchFn = async (url, init) => { seen = { url: String(url), key: init.headers['X-Phoenix-Key'] }; return new Response(JSON.stringify(body), { status: 200 }); };

const live = await resolveOrgClubs(config, { dataDir, live: true, write: true, fetchFn, secret: SECRET, log: quiet });
t('live: reads /api/org/clubs/public with the keyed header', seen.url === 'https://worker.test/api/org/clubs/public' && seen.key === orgKey(SECRET));
t('live: all three clubs, primary = config.homeClubId, IDs as strings', live.source === 'api' && live.ids.join() === `${A},${B},${C}` && live.primary === A);
t('live: sync flags arrive as booleans', live.clubs.every((c) => c.sync_members === true && c.sync_matches === true));
t('live: the list is saved as a snapshot', readSnapshot(dataDir)?.clubs.length === 3);
const offline = await resolveOrgClubs(config, { dataDir, live: true, fetchFn: async () => { throw new Error('boom'); }, secret: SECRET, log: quiet });
t('Worker unreachable → the last snapshot, not a single club', offline.source === 'snapshot' && offline.ids.length === 3);
const empty = await resolveOrgClubs(config, { dataDir, live: true, fetchFn: async () => new Response(JSON.stringify({ clubs: [] })), secret: SECRET, log: quiet });
t('an empty club list is not trusted (nothing would sync) → snapshot', empty.source === 'snapshot' && empty.ids.length === 3);
const fresh = await resolveOrgClubs(config, { dataDir: path.join(tmp, 'none'), live: true, fetchFn: async () => new Response('x', { status: 500 }), secret: SECRET, log: quiet });
t('no Worker and no snapshot → config.homeClubId is the fallback', fresh.source === 'config' && fresh.ids.join() === A && fresh.primary === A);
const nosecret = await resolveOrgClubs(config, { dataDir: path.join(tmp, 'none'), live: true, secret: '', log: quiet });
t('no secret → fallback, no request made', nosecret.source === 'config');
t('loadOrgClubs reports why it failed', (await loadOrgClubs(config, { fetchFn: async () => new Response('', { status: 403 }), secret: SECRET })).error === 'HTTP 403');
const odd = await resolveOrgClubs({ homeClubId: 7777 }, { dataDir: path.join(tmp, 'none'), live: false });
t('primary falls back to the first club when homeClubId is not in the organization', (await resolveOrgClubs({ ...config, homeClubId: 7777 }, { dataDir, live: false })).primary === A && odd.primary === '7777');

// ---------- combined view ----------
const { matches: all, dropped } = combineMatches(matches, { ids: org3.ids, primary: A });
const ours = all.filter((m) => m.src);
t('every mode is in: league, playoff and friendly', ['leagueMatch', 'playoffMatch', 'friendlyMatch'].every((k) => ours.some((m) => m.mode === k)));
t('a match nobody of ours played is left alone', all.some((m) => m.matchId === 'z6' && !m.src));
t('each record keeps its source club ID', ours.find((m) => m.matchId === 'm2').src === B && ours.find((m) => m.matchId === 'm3').src === C && ours.find((m) => m.matchId === 'm1').src === A);
t('provenance stays readable after merging (sources lists our clubs in it)', ours.find((m) => m.matchId === 'm2').sources.join() === B);
t('a non-primary club\'s side is read under the primary ID so pages work unchanged', all.find((m) => m.matchId === 'm2').clubs[A].goals === '3' && all.find((m) => m.matchId === 'm2').players[A].p1.playername === 'dual');
t('the derby is one match, flagged internal, with both of our clubs as sources', ours.filter((m) => m.matchId === 'm4').length === 1 && ours.find((m) => m.matchId === 'm4').internal && ours.find((m) => m.matchId === 'm4').sources.join() === `${A},${B}`);
t('same-matchId duplicates are dropped', all.filter((m) => m.matchId === 'm4').length === 1);
t('same match under two matchIds (same time, clubs and score) counts once', all.filter((m) => m.timestamp === 5000).length === 1);
t('3 duplicates seen, 3 dropped… (m4 again, y5)', dropped === 2);
t('our match count: m1 m2 m3 m4 x5 = 5', ours.length === 5);
t('the input is not mutated', matches[1].clubs[B] && !matches[1].src);

const records = new Map(Object.entries(rec));
const comb = combineOrg({ org: org3, records, matches });
const dual = comb.club.members.filter((m) => m.name.toLowerCase() === 'dual');
t('one player across clubs is a single identity (tag compared case-insensitively)', dual.length === 1 && comb.club.members.length === 4);
t('…with their stats added up', dual[0].gamesPlayed === '15' && dual[0].goals === '9');
t('…averages weighted by games played (8.0×10 + 6.0×5)/15 = 7.33', dual[0].ratingAve === '7.33');
t('…and their memberships kept (club, games, goals)', dual[0].clubs.length === 2 && dual[0].clubs[0].clubId === A && dual[0].clubs[1].clubId === B && dual[0].clubs[1].goals === 4);
t('a player in only one club stays as they were', comb.club.members.find((m) => m.name === 'Charlie').gamesPlayed === '3');
t('club totals add up, the derby taken out of the second club so it counts once', comb.club.overall.gamesPlayed === '17' && comb.club.overall.wins === '10' && comb.club.overall.losses === '3' && comb.club.overall.goals === '33');
t('career rows merge the same way', comb.club.career.filter((m) => m.name.toLowerCase() === 'dual').length === 1);
t('per-club breakdown lists all three with their own counts', comb.perClub.length === 3 && comb.perClub.find((c) => c.id === B).matches === 2 && comb.perClub.find((c) => c.id === A).matches === 3 && comb.perClub.find((c) => c.id === C).matches === 1);
t('stats: matches by mode, duplicates dropped, derbies, memberships vs players', comb.stats.matches === 5 && comb.stats.byMode.leagueMatch === 3 && comb.stats.byMode.playoffMatch === 1 && comb.stats.byMode.friendlyMatch === 1 && comb.stats.duplicatesDropped === 2 && comb.stats.internal === 1 && comb.stats.players === 4 && comb.stats.memberships === 5);
t('overview says where the list came from and when history starts', orgOverview(comb, org3).source === 'api' && orgOverview(comb, org3).coverage.firstMatch === 1000);
const one = combineOrg({ org: { ...org3, ids: [A], clubs: org3.clubs.slice(0, 1) }, records: new Map([[A, rec[A]]]), matches: matches.filter((m) => m.clubs[A] || m.clubs[9005]) });
t('with a single club the combined view is that club (record untouched)', one.club.members.length === 2 && one.club.overall.gamesPlayed === '10' && one.stats.clubs === 1);
const lone = combineOrg({ org: { source: 'config', clubs: [], ids: [A], primary: A }, records: new Map(), matches: [] });
t('no data at all → empty, not a crash', lone.matches.length === 0 && lone.club && lone.stats.matches === 0);

// ---------- destinations ----------
const asked = [];
const routeOk = await resolveRoute(config, 'match_results', B, { fetchFn: async (u, i) => { asked.push({ u: String(u), key: i.headers['X-Phoenix-Key'] }); return new Response(JSON.stringify({ channelId: '555', guildId: '9', scope: 'division' })); }, secret: SECRET });
t('resolveRoute asks the Worker per purpose and club, keyed', asked[0].u === 'https://worker.test/api/org/route/public?purpose=match_results&club=2222' && asked[0].key === orgKey(SECRET) && routeOk.channelId === '555' && routeOk.scope === 'division');
t('an unconfigured destination comes back as null, never a guess', (await resolveRoute(config, 'match_results', C, { fetchFn: async () => new Response(JSON.stringify({ channelId: null })), secret: SECRET })).channelId === null);
t('a failed lookup is ok:false with the reason', (await resolveRoute(config, 'match_results', C, { fetchFn: async () => new Response('', { status: 502 }), secret: SECRET })).error === 'HTTP 502');

// ---------- full build with 3 clubs ----------
const D = path.join(tmp, 'data'), OUT = path.join(tmp, 'site');
fs.cpSync(ROOT + 'data', D, { recursive: true });
for (const f of fs.readdirSync(path.join(D, 'matches'))) fs.rmSync(path.join(D, 'matches', f));
const w = (rel, o) => { fs.mkdirSync(path.dirname(path.join(D, rel)), { recursive: true }); fs.writeFileSync(path.join(D, rel), JSON.stringify(o)); };
for (const id of [A, B, C]) w(`clubs/${id}.json`, rec[id]);
for (const m of matches.filter((x, i, arr) => arr.findIndex((y) => y.matchId === x.matchId) === i)) w(`matches/${m.matchId}.json`, m); // the archive keeps one file per matchId
w('org.json', { fetchedAt: '2026-11-09T00:00:00Z', clubs: cfgClubs.map((c) => ({ ...c, sync_members: true, sync_matches: true })) });
const run = (script) => spawnSync('node', [ROOT + script], { cwd: ROOT, env: { ...process.env, NOREX_DATA: D, NOREX_OUT: OUT }, encoding: 'utf8' });
const built = run('scripts/build.mjs');
t('the site builds from three clubs', built.status === 0 || (console.log(built.stderr.slice(-600)), false));
const J = (f) => JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));
await tt('api/org.json lists the clubs, modes and the dedupe counts', () => { const o = J('api/org.json'); return o.clubs === 3 && o.matches === 5 && o.byMode.friendlyMatch === 1 && o.duplicatesDropped >= 1 && o.perClub.length === 3; });
await tt('api/players.json has the dual-club player once', () => { const ps = J('api/players.json'); return ps.filter((p) => String(p.n ?? p.name).toLowerCase() === 'dual').length === 1; });
await tt('the club feed counts the combined matches, not one club\'s', () => J('api/club.json').matches.length >= 4);

fs.rmSync(tmp, { recursive: true, force: true });
done();
