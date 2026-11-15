// Box score columns built only from EA's decoded event counters (scripts/lib/events.mjs). Pure functions, no I/O: the site match page
// (next/pages/matches.mjs) and the Discord box score card (scripts/cards.mjs) share them so both show the same true numbers.
// Every value is a sum of real counters; nothing is estimated. A player without event data (a game archived before EA's counters were
// kept) gets null, never a 0.

// Per 90 only when the player was on long enough for a rate to mean something; a match is 80 minutes (4800 s) of play, so a full
// game scales by 5400 / 4800. null below 10 minutes rather than a noisy number.
export const MIN_SECS_PER90 = 600;
export const per90 = (v, secs) => (secs >= MIN_SECS_PER90 ? Math.round((v / secs) * 5400 * 10) / 10 : null);

const sum = (ev, keys) => keys.reduce((t, k) => t + (ev[k] || 0), 0);
const WON = ['possessionWonDefensiveThird', 'possessionWonMiddleThird', 'possessionWonAttackingThird'];
const LOST = ['possessionLostDefensiveThird', 'possessionLostMiddleThird', 'possessionLostAttackingThird'];

// [key, header, long label, counts per 90?, read(decoded ev)]
export const BOX_COLS = [
  ['fwd', 'Fwd', 'Forward passes completed', true, (e) => e.passesCompletedForward || 0],
  ['int', 'Int', 'Interceptions', true, (e) => e.interceptions || 0],
  ['won', 'Won', 'Possession won', true, (e) => sum(e, WON)],
  ['lost', 'Lost', 'Possession lost', true, (e) => sum(e, LOST)],
  ['aer', 'Aer', 'Aerial duels won', true, (e) => (e.aerialDuelsWonAttacking || 0) + (e.aerialDuelsWonDefending || 0)],
  ['pos', 'Pos%', 'In position', false, (e) => { const n = (e.inPosition || 0) + (e.outOfPosition || 0); return n ? Math.round(((e.inPosition || 0) / n) * 100) : null; }],
];

// decoded ev → { fwd, int, won, lost, aer, pos } or null when the player has no event data.
export function boxEv(ev) {
  if (!ev) return null;
  return Object.fromEntries(BOX_COLS.map(([k, , , , f]) => [k, f(ev)]));
}

// One cell: the total, and the per-90 value (null for rates and short appearances).
export function boxCell(box, key, secs) {
  const col = BOX_COLS.find((c) => c[0] === key);
  if (!box || !col || box[key] == null) return { total: null, p90: null };
  return { total: box[key], p90: col[3] ? per90(box[key], secs) : null };
}

// How many of a side's players carry event data: "7 of 8".
export const evCoverage = (lines) => ({ have: lines.filter((l) => l.ev).length, all: lines.length });
