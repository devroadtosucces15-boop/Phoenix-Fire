// EA's per-player event counters (match_event_aggregate_0..3: "215:21,216:5,…") decoded into named stats.
// The id table is community observation, not EA documentation: credit to the "EA FC Pro Clubs API research" project
// (~51,000 FC 27 player-match rows), as published by the fc-clubs-api docs (1erkandogan.github.io/fc27-clubs-api/match-events/).
// Only the "confirmed" table is decoded; partial/exploratory ids stay raw in `evraw` so they can be decoded later.
export const EVENT_STATS = [
  // passing
  ['passesCompleted', 215], ['passesFailed', 216],
  ['passesCompletedForward', 30], ['passesCompletedBackward', 32], ['passesCompletedSideways', 34],
  ['passesCompletedShort', 24], ['passesCompletedMedium', 26], ['passesCompletedLong', 28], ['passesCompletedCross', 36],
  ['passesFailedForward', 31], ['passesFailedBackward', 33], ['passesFailedSideways', 35],
  ['passesFailedShort', 25], ['passesFailedMedium', 27], ['passesFailedLong', 29], ['passesFailedCross', 37],
  ['firstTimePasses', 143], ['switchesOfPlay', 144], ['flairPasses', 147], ['throughPasses', 152], ['offsidePasses', 153],
  // shooting and goals
  ['shotsOnTarget', 217], ['shotsOffTarget', 218],
  ['shotsOnTargetInsideBox', 13], ['shotsOnTargetOutsideBox', 18], ['shotsOffTargetInsideBox', 14], ['shotsOffTargetOutsideBox', 19],
  ['shotsSaved', 202], ['goalsFirstTime', 128], ['goalsWeakFoot', 131], ['goalsOffPost', 136],
  ['secondAssists', 115], ['throughBallAssists', 118],
  // ids 214 and 11 agree with EA's own goals/assists on every row of the 2026-11-14 live check (3 and 5 non-zero rows) and equal the "undecoded duplicates" of the earlier recon
  ['goalsEvent', 214], ['assistsEvent', 11],
  // dribbling
  ['dribblesCompleted', 174], ['dribblesCarried', 97], ['dribblesSkillMoveBeat', 38],
  // defending and goalkeeping
  ['tacklesWon', 0], ['tacklesLost', 1], ['standingTacklesWon', 229], ['slidingTacklesWon', 230],
  ['cleanTackles', 164], ['dangerousTackles', 163], ['interceptions', 6], ['opponentsDispossessed', 158], ['crossesBlocked', 156],
  ['aerialDuelsWonAttacking', 265], ['aerialDuelsWonDefending', 266], ['goodDirectionSaves', 267],
  // possession
  ['possessionLostDefensiveThird', 105], ['possessionLostMiddleThird', 106], ['possessionLostAttackingThird', 107],
  ['possessionWonDefensiveThird', 108], ['possessionWonMiddleThird', 109], ['possessionWonAttackingThird', 110],
  // discipline and set pieces
  ['foulsConcededDefensiveThird', 3], ['foulsWon', 4], ['yellowCardsImmediate', 95], ['yellowCardsDelayed', 213],
  ['penaltiesConceded', 94], ['cornersConceded', 10], ['cornersTaken', 145],
  // positioning and match feedback
  ['inPosition', 111], ['outOfPosition', 219],
  ['outOfPositionSeverity1', 99], ['outOfPositionSeverity2', 100], ['outOfPositionSeverity3', 101],
  ['outOfPositionSeverity4', 102], ['outOfPositionSeverity5', 103],
  ['feedbackUseTheBall', 212], ['feedbackPickYourPass', 207], ['feedbackNoGoodOption', 175], ['feedbackGoodOptionTaken', 176],
  ['feedbackBestOptionTaken', 177], ['feedbackShouldHavePassedElsewhere', 182], ['feedbackChoseToPass', 183],
];

// Stats that are sums or remainders of the ids above (EA's direction/length events don't always cover every pass).
const max0 = (n) => Math.max(0, n);

// "0:2,109:3" → { 0: 2, 109: 3 }; duplicate ids (same id in two buckets) are summed.
export function parseAggregate(agg, into = {}) {
  if (typeof agg !== 'string' || !agg) return into;
  for (const pair of agg.split(',')) {
    const [id, n] = pair.split(':');
    const v = Number(n);
    if (id !== '' && Number.isFinite(v)) into[id] = (into[id] || 0) + v;
  }
  return into;
}

// All four buckets of one player row → one raw "id:count" string with zero entries dropped ("" if none).
export function rawEvents(p) {
  const counts = {};
  for (let i = 0; i < 4; i++) parseAggregate(p?.[`match_event_aggregate_${i}`], counts);
  return Object.entries(counts).filter(([, v]) => v).map(([id, v]) => `${id}:${v}`).join(',');
}

// Ids present in the data that the table above does not name yet ({ id: total }), so new or unnamed counters are visible
// (never dropped) and can be added to EVENT_STATS after they are validated against the stats EA already names.
const NAMED = new Set([...EVENT_STATS.map(([, id]) => String(id)), '2', '112']); // 2 and 112 feed derived totals in decodeEvents
export function unknownIds(rows) {
  const out = {};
  for (const raw of rows || []) for (const [id, v] of Object.entries(typeof raw === 'string' ? parseAggregate(raw) : raw || {})) if (!NAMED.has(String(id))) out[id] = (out[id] || 0) + v;
  return out;
}

// raw string (or parsed counts) → named stats, every confirmed stat present (0 when absent) plus derived totals.
export function decodeEvents(raw) {
  const c = typeof raw === 'string' ? parseAggregate(raw) : raw || {};
  const g = (id) => c[id] || 0;
  const out = {};
  for (const [name, id] of EVENT_STATS) out[name] = g(id);
  out.shots = out.shotsOnTarget + out.shotsOffTarget;
  out.dribblesBeat = max0(g(112) - g(38));
  out.foulsConceded = g(2) + g(3);
  out.yellowCards = out.yellowCardsImmediate + out.yellowCardsDelayed;
  out.passesCompletedDirectionUnknown = max0(out.passesCompleted - (out.passesCompletedForward + out.passesCompletedBackward + out.passesCompletedSideways));
  out.passesCompletedLengthUnknown = max0(out.passesCompleted - (out.passesCompletedShort + out.passesCompletedMedium + out.passesCompletedLong + out.passesCompletedCross));
  out.passesFailedDirectionUnknown = max0(out.passesFailed - (out.passesFailedForward + out.passesFailedBackward + out.passesFailedSideways));
  out.passesFailedLengthUnknown = max0(out.passesFailed - (out.passesFailedShort + out.passesFailedMedium + out.passesFailedLong + out.passesFailedCross));
  return out;
}

// ---- team and box-score helpers (pure; shared by the Worker panels and the card templates) ----
const pctOf = (a, b) => (b > 0 ? Math.round((a / b) * 100) : null);
const WON = ['possessionWonDefensiveThird', 'possessionWonMiddleThird', 'possessionWonAttackingThird'];
const LOST = ['possessionLostDefensiveThird', 'possessionLostMiddleThird', 'possessionLostAttackingThird'];
const sumKeys = (e, ks) => ks.reduce((t, k) => t + (e[k] || 0), 0);

// [key, header, long label, read(decoded ev)] – the same six columns Phoenix's box score uses.
export const BOX_COLS = [
  ['fwd', 'Fwd', 'Forward passes completed', (e) => e.passesCompletedForward || 0],
  ['int', 'Int', 'Interceptions', (e) => e.interceptions || 0],
  ['won', 'Won', 'Possession won', (e) => sumKeys(e, WON)],
  ['lost', 'Lost', 'Possession lost', (e) => sumKeys(e, LOST)],
  ['aer', 'Aer', 'Aerial duels won', (e) => (e.aerialDuelsWonAttacking || 0) + (e.aerialDuelsWonDefending || 0)],
  ['pos', 'Pos%', 'In position', (e) => pctOf(e.inPosition || 0, (e.inPosition || 0) + (e.outOfPosition || 0))],
];
// raw "id:n,…" → { fwd, int, won, lost, aer, pos } or null when the player has no event data.
export function boxEv(raw) {
  if (!raw) return null;
  const e = decodeEvents(raw);
  return Object.fromEntries(BOX_COLS.map(([k, , , f]) => [k, f(e)]));
}

// One side's players → summed decoded counters + rates, or null when nobody carries event data.
export function eventSide(players) {
  const evs = (players || []).filter((p) => p.ev).map((p) => decodeEvents(p.ev));
  if (!evs.length) return null;
  const t = {};
  for (const e of evs) for (const [k, v] of Object.entries(e)) if (typeof v === 'number') t[k] = (t[k] || 0) + v;
  const g = (k) => t[k] || 0;
  return { apps: evs.length, t,
    passAcc: pctOf(g('passesCompleted'), g('passesCompleted') + g('passesFailed')), tackleWin: pctOf(g('tacklesWon'), g('tacklesWon') + g('tacklesLost')),
    shotAcc: pctOf(g('shotsOnTarget'), g('shotsOnTarget') + g('shotsOffTarget')), positioning: pctOf(g('inPosition'), g('inPosition') + g('outOfPosition')),
    insideBox: g('shotsOnTargetInsideBox') + g('shotsOffTargetInsideBox'), forward: g('passesCompletedForward'), wonHigh: g('possessionWonAttackingThird'),
    lostLow: g('possessionLostDefensiveThird'), ints: g('interceptions'), aerial: g('aerialDuelsWonAttacking') + g('aerialDuelsWonDefending'),
    won: sumKeys(t, WON), lost: sumKeys(t, LOST) };
}

// "From the event data" rows for one match: us first, then them (null when their side has no counters).
export function eventRows(us, them) {
  const E = eventSide(us), O = eventSide(them);
  if (!E) return null;
  const b = (k) => (O ? O[k] : null);
  return { apps: E.apps, of: us.length, rows: [
    { k: 'Won in the attacking third', a: E.wonHigh, b: b('wonHigh') },
    { k: 'Lost in our own third', a: E.lostLow, b: b('lostLow') },
    { k: 'Forward passes completed', a: E.forward, b: b('forward') },
    { k: 'Shots inside the box', a: E.insideBox, b: b('insideBox') },
    { k: 'Interceptions', a: E.ints, b: b('ints') },
    { k: 'Aerial duels won', a: E.aerial, b: b('aerial') },
    { k: 'Players in position', a: E.positioning, b: b('positioning'), u: '%' },
  ] };
}

// Leaderboard stats that come from event counters: [label, read(decoded ev) → number, minimum games].
export const EVENT_BOARDS = {
  ints: ['Interceptions', (e) => e.interceptions || 0, 1], won: ['Possession won', (e) => sumKeys(e, WON), 1],
  aer: ['Aerial duels won', (e) => (e.aerialDuelsWonAttacking || 0) + (e.aerialDuelsWonDefending || 0), 1], fwd: ['Forward passes', (e) => e.passesCompletedForward || 0, 1],
  thru: ['Through passes', (e) => e.throughPasses || 0, 1], drib: ['Dribbles completed', (e) => e.dribblesCompleted || 0, 1], sot: ['Shots on target', (e) => e.shotsOnTarget || 0, 1],
};
