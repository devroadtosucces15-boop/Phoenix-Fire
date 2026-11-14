// EA event-counter decoder (all four match_event_aggregate buckets), intel rates, schema-drift probe, platform check,
// the fetcher keeping raw events, and the data layer / intel.json feed. No club name is hardcoded here.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { t, done } from './lib.mjs';
import { EVENT_STATS, parseAggregate, rawEvents, decodeEvents, unknownIds } from '../scripts/lib/events.mjs';
import { sumEvents, ratesOf, summarize, coverage } from '../scripts/lib/intel.mjs';
import { missingKeys, platformProblem } from '../scripts/lib/schema.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const ids = EVENT_STATS.map(([, id]) => id);
t('event table has no duplicate ids or names', new Set(ids).size === ids.length && new Set(EVENT_STATS.map(([n]) => n)).size === ids.length);

t('parse sums duplicates and skips junk', JSON.stringify(parseAggregate('1:2,1:3,x:y,,7:0')) === JSON.stringify({ 1: 5, 7: 0 }));
const p = { match_event_aggregate_0: '215:21,216:5,30:8,32:2,24:17,26:2,28:1,36:1,0:3,109:4', match_event_aggregate_1: '97:10,219:2', match_event_aggregate_2: '', match_event_aggregate_3: '217:3,218:2,112:5,38:2' };
t('rawEvents merges the four buckets, drops zeros', rawEvents({ match_event_aggregate_0: '1:0,2:4', match_event_aggregate_1: '9:1' }) === '2:4,9:1');
t('rawEvents empty when no events', rawEvents({}) === '' && rawEvents(null) === '');
t('rawEvents keeps ids that have no name yet', rawEvents({ match_event_aggregate_2: '121:7,114:2' }).split(',').sort().join() === '114:2,121:7');
t('unknownIds lists unnamed ids only', JSON.stringify(unknownIds(['215:1,121:7,2:1,112:3', '121:1,8:2'])) === JSON.stringify({ 121: 8, 8: 2 }));

const d = decodeEvents(rawEvents(p));
t('named stats from every bucket', d.passesCompleted === 21 && d.dribblesCarried === 10 && d.outOfPosition === 2 && d.tacklesWon === 3 && d.possessionWonMiddleThird === 4);
t('shots = on + off target', d.shots === 5);
t('direction remainder is unknown, never negative', d.passesCompletedDirectionUnknown === 11 && decodeEvents('215:1,30:3').passesCompletedDirectionUnknown === 0);
t('length remainder', d.passesCompletedLengthUnknown === 0);
t('dribbles beaten without a skill move = 112 - 38', d.dribblesBeat === 3 && decodeEvents('38:4').dribblesBeat === 0);
t('fouls and yellows are sums', decodeEvents('2:1,3:2,95:1,213:1').foulsConceded === 3 && decodeEvents('95:1,213:1').yellowCards === 2);
t('absent ids decode to 0', decodeEvents('').passesCompleted === 0 && decodeEvents(undefined).shots === 0);

// intel: rates are null (never NaN or a fake 0%) without data, and exact with it
t('no appearances → no summary', summarize([]) === null && summarize([null, undefined]) === null);
const s = summarize([decodeEvents('215:20,216:5,30:8,109:4,0:3,1:1,6:2,111:3,219:1'), null]);
t('summary counts only rows with event data', s.apps === 1 && sumEvents([null]).apps === 0);
t('pass accuracy 80% and forward share 40%', s.rates.passAccuracy === 80 && s.rates.forwardPassShare === 40);
t('tackle win rate and positioning', s.rates.tackleWinRate === 75 && s.rates.positioning === 75);
t('rates with nothing to divide are null', ratesOf({}).passAccuracy === null && ratesOf({}).possessionWinShare === null);
t('coverage counts matches carrying events', coverage([{ id: 'a', t: 5, hasEv: true }, { id: 'b', t: 1, hasEv: false }, { id: 'c', t: 9, hasEv: true }]).withEvents === 2);

// schema-drift probe
t('schema probe: matching shape → no keys missing', missingKeys('clubs/overallStats', [{ clubId: '1', gamesPlayed: '1', wins: '1', losses: '0', ties: '0', goals: '1', goalsAgainst: '0', skillRating: '1', lastOpponent0: '2' }]).length === 0);
t('schema probe: reports dropped keys', missingKeys('members/stats', { members: [{ name: 'a', goals: '1' }] }).includes('ratingAve'));
t('schema probe: empty or unknown payload is not drift', missingKeys('clubs/matches', []).length === 0 && missingKeys('club/playoffAchievements', []).length === 0 && missingKeys('clubs/info', null).length === 0);
t('schema probe: clubs/info is keyed by club id', missingKeys('clubs/info', { 1001: { name: 'x', clubId: 1001, customKit: {} } }).length === 0);
t('platform check: gen5 and nx pass, gen4 rejected', platformProblem('common-gen5') === null && platformProblem('nx') === null && /gen4/.test(platformProblem('common-gen4')));

// the fetcher must keep every raw counter and run the drift probe (fetch.mjs hits the network when imported, so it is checked as source)
const fetchSrc = fs.readFileSync(path.join(ROOT, 'scripts/fetch.mjs'), 'utf8');
t('fetch keeps raw events and runs the drift probe', /rawEvents\(p\)/.test(fetchSrc) && /\{ \.\.\.keep, \.\.\.eventCounts\(match_event_aggregate_0\), \.\.\.\(evraw \? \{ evraw \} : \{\}\) \}/.test(fetchSrc) && /missingKeys\(endpoint, body\)/.test(fetchSrc));

// data layer + intel.json feed, on a throwaway copy of the repo's data layer so nothing in data/ is touched
const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'phoenix-evdec-'));
try {
  for (const dir of ['next/lib', 'scripts/lib']) fs.cpSync(path.join(ROOT, dir), path.join(tmp, dir), { recursive: true });
  fs.cpSync(path.join(ROOT, 'data'), path.join(tmp, 'data'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'config.json'), path.join(tmp, 'config.json'));
  const cfg = JSON.parse(fs.readFileSync(path.join(tmp, 'config.json'), 'utf8'));
  const mdir = path.join(tmp, 'data/matches');
  const all = fs.readdirSync(mdir).filter((f) => f.endsWith('.json')).map((f) => ({ f, m: JSON.parse(fs.readFileSync(path.join(mdir, f), 'utf8')) }));
  const home = String(cfg.homeClubId);
  for (const x of all) for (const list of Object.values(x.m.players || {})) for (const q of Object.values(list)) delete q.evraw;
  const mine = all.filter((x) => x.m.clubs?.[home]).sort((a, b) => b.m.timestamp - a.m.timestamp);
  if (!mine.length) t('fixture needs a home match', false);
  else {
    const write = (x) => fs.writeFileSync(path.join(mdir, x.f), JSON.stringify(x.m));
    all.forEach(write);
    const load = async (tag) => import(`${path.join(tmp, 'next/lib/data.mjs')}?${tag}`);
    const before = await load('before');
    t('no event data → no intel, coverage says 0', before.intel.club === null && before.intel.coverage.withEvents === 0 && before.matches.every((m) => !m.intel.us && !m.intel.opp));
    const first = mine[0];
    const [pid, pl] = Object.entries(first.m.players[home])[0];
    pl.evraw = '215:20,216:5,30:8,109:4,0:3,1:1,6:2,111:3,219:1,121:6';
    write(first);
    const after = await load('after');
    const mm = after.matches.find((m) => String(m.id) === String(first.m.matchId));
    t('decoded counters reach the match line', !!mm && mm.lines.some((l) => l.ev && l.ev.passesCompleted === 20));
    t('match, player and club intel appear with rates', mm.intel.us.rates.passAccuracy === 80 && after.intel.coverage.withEvents === 1 && after.intel.club.apps === 1 && after.players.some((q) => q.intel && q.intel.apps === 1));
    t('the raw record keeps the unnamed id', JSON.parse(fs.readFileSync(path.join(mdir, first.f), 'utf8')).players[home][pid].evraw.includes('121:6'));
    t('no template leftovers in the intel feed', !/NaN|undefined/.test(JSON.stringify({ c: after.intel, m: mm.intel })));
  }
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }


// validation against EA's own named fields (scripts/lib/validate.mjs)
{
  const { validateDecoder, formatReport } = await import('../scripts/lib/validate.mjs');
  const rows = [
    { playername: 'a', passesmade: '3', passattempts: '4', shots: '1', goals: '1', assists: '0', saves: '0', tacklesmade: '1', tackleattempts: '2', evraw: '215:3,216:1,217:1,214:1,0:1,1:1,121:4' },
    { playername: 'b', passesmade: '2', passattempts: '2', shots: '0', goals: '0', assists: '1', saves: '2', tacklesmade: '0', tackleattempts: '0', evraw: '215:1,11:1,267:2' },
    { playername: 'noev', passesmade: '9' },
  ];
  const r = validateDecoder([{ players: { 1: { x: rows[0], y: rows[1], z: rows[2] } } }]);
  const by = (label) => r.checks.find((c) => c.label.startsWith(label));
  t('validation counts only rows with event data', r.rows === 2);
  t('goals and assists ids 214 and 11 agree with EA', by('goals').agree === 2 && by('assists').agree === 2 && by('saves (id 267)').agree === 2);
  t('a disagreement is listed with both numbers', by('passes completed').agree === 1 && /b: EA 2, decoded 1/.test(by('passes completed').differs[0]));
  t('ids with no name are reported, never dropped', r.unknown['121'] === 4 && /121×4/.test(formatReport(r)));
}

// Phoenix identity: nothing the decoder files ship names another club
for (const f of ['scripts/lib/events.mjs', 'scripts/lib/intel.mjs', 'scripts/lib/schema.mjs', 'scripts/lib/validate.mjs']) t(`${f} carries no other club's name`, !/norex/i.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
done();
