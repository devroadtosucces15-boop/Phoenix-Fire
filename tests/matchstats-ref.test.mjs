// Reference-project items (PLANNING/MATCHSTATS-REVIEW.md section 6): offside-aware pass check, candidate id labels, EA image helpers,
// stored club aggregate, season board, and the guards "event sums are a breakdown, EA's named fields are the totals" and "keeper saves
// come from EA's saves + save types, never ids 202 or 267". Phoenix: no NOREX in what these add.
import fs from 'node:fs';
const ROOT = new URL('../', import.meta.url).pathname;
import { t, done } from './lib.mjs';
import { decodeEvents, CANDIDATE_IDS, candidateLabel, EVENT_STATS, unknownIds } from '../scripts/lib/events.mjs';
import { CHECKS, validateDecoder, formatReport } from '../scripts/lib/validate.mjs';
import { crestUrl, crestCandidates, clubCrestUrl, divisionBadgeUrl, reputationTierUrl, kitColorHex, NOT_FOUND_CREST_URL } from '../scripts/lib/ea-assets.mjs';
import { slimAggregate, seasonBoard } from '../scripts/lib/matchslim.mjs';
import { BOX_COLS } from '../scripts/lib/boxscore.mjs';
import { matches, clubStats } from '../next/lib/data.mjs';

// ---- pass check counts offside passes (EA passesmade = 215 + 153)
const row = { playername: 'X', passesmade: '12', passattempts: '15', evraw: '215:10,153:2,216:3' };
const r = validateDecoder([{ players: { 1: { a: row } } }]);
const pm = r.checks.find((c) => c.field === 'passesmade'), pa = r.checks.find((c) => c.field === 'passattempts');
t('validate: passesmade rebuilt as 215 + 153 (agrees)', pm.agree === 1 && /153/.test(pm.label));
t('validate: pass attempts rebuilt as 215 + 153 + 216 (agrees)', pa.agree === 1 && /153/.test(pa.label));

// ---- candidate ids: labels only, never decoded
t('candidates: 151, 121, 157 labelled', ['151', '121', '157'].every((id) => candidateLabel(id)));
t('candidates: none of them is in EVENT_STATS (not decoded)', Object.keys(CANDIDATE_IDS).every((id) => !EVENT_STATS.some(([, i]) => String(i) === id)));
t('candidates: still reported as unnamed ids', unknownIds(['151:3'])[151] === 3 && !('badPasses' in decodeEvents('151:3')));
t('report names a candidate beside its id', /151×\d+ \(candidate: bad/.test(formatReport({ rows: 1, checks: [], unknown: { 151: 3 } })));

// ---- EA image helpers
t('crest: 256 px png url by id', crestUrl('99090304').endsWith('/crests/256x256/l99090304.png'));
t('crest chain: TEAM first, then custom, real badge; ends with the not-found crest', (() => { const c = crestCandidates({ team: '1824', teamId: '243', crestAssetId: '99090304', selectedKitType: '1' }); return c.length === 4 && c[0].endsWith('l1824.png') && c[1].endsWith('l99090304.png') && c[2].endsWith('l243.png') && c[3] === NOT_FOUND_CREST_URL; })());
t('crest chain: real badge before custom when selectedKitType is 0; duplicates and zero ids dropped', (() => { const c = crestCandidates({ teamId: '243', crestAssetId: '0', selectedKitType: '0' }); return c.length === 2 && c[0].endsWith('l243.png'); })());
t('crest: bad id throws, club url is the first candidate', (() => { try { crestUrl(0); return false; } catch { return clubCrestUrl({ team: 5 }).endsWith('l5.png'); } })());
t('division badge 1 to 6 and reputation tier 0 to 3, out of range throws', divisionBadgeUrl(3).endsWith('divisioncrest3.png') && reputationTierUrl(0).endsWith('reputation-tier0.png') && (() => { try { divisionBadgeUrl(7); return false; } catch { try { reputationTierUrl(4); return false; } catch { return true; } } })());
t('kit colour decimal → hex', kitColorHex('16777215') === '#ffffff' && kitColorHex(0) === '#000000' && kitColorHex('255') === '#0000ff');

// ---- stored aggregate and season board
const sa = slimAggregate({ 1001: { goals: '4', passesmade: '90', match_event_aggregate_0: '215:21', match_event_aggregate_1: '215:4,30:2', vproattr: 'NH' }, 2001: null });
t('aggregate: club sums kept, buckets and vproattr dropped, evraw summed', sa[1001].goals === '4' && sa[1001].evraw && /215:25/.test(sa[1001].evraw) && !('match_event_aggregate_0' in sa[1001]) && !('vproattr' in sa[1001]) && !(2001 in sa));
t('aggregate: empty when EA sends none', Object.keys(slimAggregate(undefined)).length === 0);
const sb = seasonBoard({ currentDivision: '2', points: '31', gamesPlayed: '14', wins: '9', ties: '2', losses: '3', goals: '40', goalsAgainst: '20', cleanSheets: '5', reputationtier: '1' }, 'now');
t('season board: strings become numbers, running season only', sb.currentDivision === 2 && sb.points === 31 && sb.w === 9 && sb.gf === 40 && sb.cs === 5 && sb.fetchedAt === 'now');
t('data layer exposes the season slot and per-match aggregate/crests (null until fetched)', 'season' in clubStats && matches.every((m) => 'agg' in m && Array.isArray(m.oppCrests) && m.oppCrests.at(-1) === NOT_FOUND_CREST_URL));

// ---- guards
t('totals rule: no box column is a named EA total (they are breakdown counters)', BOX_COLS.every(([k]) => !['passes', 'pass', 'tackles', 'saves', 'goals', 'assists', 'shots'].includes(k)));
const out = ['next/pages/matches.mjs', 'scripts/cards.mjs', 'scripts/lib/boxscore.mjs', 'scripts/lib/matchreview.mjs'].map((f) => fs.readFileSync(ROOT + f, 'utf8')).join('\n');
t('keeper saves: no output reads event ids 202 or 267 (shotsSaved, goodDirectionSaves event)', !/shotsSaved|\.goodDirectionSaves|ev\??\.goodDirection/.test(out.replace(/gk\.dir|goodDirectionSaves: num/g, '')));
t('CHECKS still compare saves to EA, flagged as unreliable ids', CHECKS.some(([, l]) => /id 202/.test(l)) && CHECKS.some(([, l]) => /id 267/.test(l)));
const added = ['scripts/lib/ea-assets.mjs', 'scripts/lib/matchslim.mjs'].map((f) => fs.readFileSync(ROOT + f, 'utf8')).join('\n');
t('new files carry no NOREX name or red', !/norex|c8352c|080b11/i.test(added));
done();
