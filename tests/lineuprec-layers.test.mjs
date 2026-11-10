// MB3: layered lineup recommender (PLANNING/BOT-SPLIT.md "Request 2"): asked position first, then level, commitment, check-in order.
// The five tests the spec lists, plus the DB-backed commitment and the preference reaching the route.
import { call, env, login, sqlite } from './mock.mjs';
import { layeredFill, fillSlots, rankCompare } from '../bot/lineuprec.js';
import { t, done } from './lib.mjs';

const slots = (list) => list.map(([slot, pos, grp]) => ({ slot, pos, grp }));
const SHAPE = slots([['GK', 'GK', 'GK'], ['LCB', 'CB', 'DEF'], ['RCB', 'CB', 'DEF'], ['CM', 'CM', 'MID'], ['LS', 'ST', 'FWD'], ['RS', 'ST', 'FWD']]);
const c = (id, o = {}) => ({ id, grp: 'MID', rating: null, commitment: null, at: null, prefs: [], ...o });

// 1. a clash of 3 strikers for 1 slot: the highest level takes it, the other two are not left out
const ONE_ST = slots([['ST', 'ST', 'FWD'], ['CM', 'CM', 'MID'], ['GK', 'GK', 'GK']]);
let r = layeredFill(ONE_ST, [c('a', { grp: 'FWD', rating: 6, prefs: [['ST']] }), c('b', { grp: 'FWD', rating: 8, prefs: [['ST']] }), c('d', { grp: 'FWD', rating: 7, prefs: [['ST']] })]);
t('3 strikers, 1 slot: best level wins it', r.lineup.b === 'ST');
t('…and the other two are still placed (nobody sits out)', Object.keys(r.lineup).length === 3 && new Set(Object.values(r.lineup)).size === 3);

// 2. preference beats a higher-rated player who did not ask
r = layeredFill(ONE_ST, [c('asker', { grp: 'MID', rating: 6, prefs: [['ST']] }), c('star', { grp: 'FWD', rating: 9 })]);
t('asker (6.0) gets the slot over a higher-rated non-asker (9.0)', r.lineup.asker === 'ST' && r.lineup.star !== 'ST' && r.asked.asker === 1);

// loser falls to the second pick
r = layeredFill(slots([['ST', 'ST', 'FWD'], ['CAM', 'CAM', 'MID']]), [c('x', { rating: 8, prefs: [['ST'], ['CAM']] }), c('y', { rating: 5, prefs: [['ST'], ['CAM']] })]);
t('the loser of a clash falls to their second pick', r.lineup.x === 'ST' && r.lineup.y === 'CAM' && r.asked.y === 2);

// 3. a no-show history demotes: same level, the one who turns up wins
r = layeredFill(ONE_ST, [c('flake', { grp: 'FWD', rating: 7, commitment: 0.25, prefs: [['ST']] }), c('solid', { grp: 'FWD', rating: 7, commitment: 1, prefs: [['ST']] })]);
t('same level: the member who turns up (4/4) beats the one who does not (1/4)', r.lineup.solid === 'ST' && r.lineup.flake !== 'ST');
t('but level still comes before commitment', layeredFill(ONE_ST, [c('good', { grp: 'FWD', rating: 8, commitment: 0.2, prefs: [['ST']] }), c('steady', { grp: 'FWD', rating: 7, commitment: 1, prefs: [['ST']] })]).lineup.good === 'ST');

// 4. same level and commitment: whoever ticked in first
r = layeredFill(ONE_ST, [c('late', { grp: 'FWD', rating: 7, commitment: 1, at: 2000, prefs: [['ST']] }), c('early', { grp: 'FWD', rating: 7, commitment: 1, at: 1000, prefs: [['ST']] })]);
t('tie on level and commitment: the earlier check-in wins', r.lineup.early === 'ST');
t('rankCompare ignores missing values (no data never reorders)', rankCompare(c('p'), c('q')) === 0 && rankCompare(c('p', { rating: 7 }), c('q')) < 0);

// 5. no preference at all equals today's output exactly
const pool = [c('gk', { grp: 'GK', rating: 7 }), c('d1', { grp: 'DEF', rating: 6.5 }), c('d2', { grp: 'DEF', rating: 7.5 }), c('m1', { grp: 'MID', rating: 7.1 }), c('f1', { grp: 'FWD', rating: 8 }), c('f2', { grp: 'FWD' }), c('m2', { grp: 'MID', rating: 6 })];
const today = fillSlots(SHAPE, pool);
t('no preferences → identical to the previous fill', JSON.stringify(layeredFill(SHAPE, pool).lineup) === JSON.stringify(today));
const withTies = pool.map((p) => ({ ...p, commitment: 0.5, at: 1 }));
t('…also when only equal commitment/check-in data is present', JSON.stringify(layeredFill(SHAPE, withTies).lineup) === JSON.stringify(today));
t('"LB/RB" style asks (two positions per pick) match either slot', layeredFill(slots([['RB', 'RB', 'DEF']]), [c('z', { prefs: [['LB', 'RB']] })]).lineup.z === 'RB');

// --- DB-backed: pref_pos and turn-up history reach POST /api/events/recommend
env.FEATURES = JSON.stringify({ ...JSON.parse(env.FEATURES), events: 'public', lineupRec: 'members' });
const mgr = await login('700', ['mgr'], 'Coach');
const p1 = await login('710', [], 'Striker One'), p2 = await login('711', [], 'Striker Two');
const day = (d) => new Date(Date.now() + d * 86400e3).toISOString().slice(0, 10);
const ev = (await call(mgr, '/api/events', { type: 'league', date: day(4), time: '20:00', tz: 'UTC' })).d.id;
// Two earlier nights: p2 said yes both times but never checked in; p1 checked in both times.
const now = Date.now();
for (const [i, days] of [[1, 3], [2, 6]]) {
  sqlite.prepare("INSERT INTO events (id, type, title, start, duration, tz, needs, public, status, lineup, at) VALUES (?, 'league', 'old', ?, 120, 'UTC', '{}', 0, 'scheduled', '{}', ?)").run(9000 + i, now - days * 86400e3, now - 9 * 86400e3);
  for (const u of ['710', '711']) sqlite.prepare("INSERT INTO event_rsvps (event_id, user_id, status, name, at) VALUES (?, ?, 'yes', ?, ?)").run(9000 + i, u, u, now - 8 * 86400e3);
  sqlite.prepare("INSERT INTO event_checkins (event_id, user_id, name, at) VALUES (?, '710', 'p1', ?)").run(9000 + i, now - days * 86400e3);
}
await call(p1, '/api/events/rsvp', { ids: [ev], status: 'yes' });
await call(p2, '/api/events/rsvp', { ids: [ev], status: 'yes' });
sqlite.prepare("UPDATE event_rsvps SET pref_pos = '[\"GK\"]' WHERE event_id = ? AND user_id IN ('710', '711')").run(ev);
const rec = await call(mgr, '/api/events/recommend', { id: ev });
t('both asked for GK: the one who turns up gets it', rec.s === 200 && rec.d.lineup['710'] === 'GK' && rec.d.lineup['711'] !== 'GK');
t('the reason says what they asked for and their turn-up record', /Asked for GK \(1st pick\)/.test(rec.d.reasons['710']) && /turned up 2\/2/.test(rec.d.reasons['710']) && /turned up 0\/2/.test(rec.d.reasons['711']));
t('the one who lost still has a place in the lineup', Object.keys(rec.d.lineup).length === 2);

done();
