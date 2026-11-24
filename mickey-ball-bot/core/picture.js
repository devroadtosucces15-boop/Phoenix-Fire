// What goes into the big match picture (scoreboard, goals and assists, man of the match, the stats as paired rings, deeper event stats) and
// the pitch picture (rating by line, field view, every rating). Pure: normalized match in, plain numbers out.
import { eventSide } from './events.js';

const n = (v) => +v || 0;
const GROUP = { goalkeeper: 'GK', defender: 'DEF', midfielder: 'MID', forward: 'FWD' };
const sum = (a, f) => a.reduce((t, x) => t + n(x[f]), 0);
const pct = (a, b) => (b > 0 ? Math.round((100 * a) / b) : 0);
const mean = (a) => (a.length ? a.reduce((t, x) => t + x, 0) / a.length : 0);

// m: a normalized match (home = the club asked about). Rows are [label, us, them, kind, tolerance, lowerIsBetter].
export function buildPicture(m) {
  const H = m.home.players, A = m.away.players;
  const rows = [
    { k: 'Shots', a: sum(H, 'shots'), b: sum(A, 'shots'), kind: 'share' },
    { k: 'Passes completed', a: sum(H, 'passesMade'), b: sum(A, 'passesMade'), kind: 'share' },
    { k: 'Pass accuracy', a: pct(sum(H, 'passesMade'), sum(H, 'passAtt')), b: pct(sum(A, 'passesMade'), sum(A, 'passAtt')), kind: 'pct', tol: 2 },
    { k: 'Tackles won', a: sum(H, 'tacklesMade'), b: sum(A, 'tacklesMade'), kind: 'share' },
    { k: 'Tackle success', a: pct(sum(H, 'tacklesMade'), sum(H, 'tackleAtt')), b: pct(sum(A, 'tacklesMade'), sum(A, 'tackleAtt')), kind: 'pct', tol: 2 },
    { k: 'Average rating', a: +mean(H.map((p) => p.rating)).toFixed(1), b: +mean(A.map((p) => p.rating)).toFixed(1), kind: 'rate', tol: 0.1 },
  ];
  // Deeper stats: only EA's decoded event counters, only when at least one of our players carries them.
  const E = eventSide(H), O = eventSide(A);
  let deeper = null;
  if (E) {
    const d = (k, a, b, kind = 'share', extra = {}) => ({ k, a, b: O ? b : null, kind, ...extra });
    deeper = { cover: { us: E.apps, of: H.length, them: O?.apps ?? 0, ofThem: A.length }, rows: [
      d('Shots on target', E.t.shotsOnTarget || 0, O?.t.shotsOnTarget || 0),
      d('Forward passes', E.forward, O?.forward ?? 0),
      d('Aerial duels won', E.aerial, O?.aerial ?? 0),
      d('Possession won', pct(E.won, E.won + E.lost), O ? pct(O.won, O.won + O.lost) : 0, 'pct', { tol: 2 }),
      d('Fouls conceded', E.t.foulsConceded || 0, O?.t.foulsConceded ?? 0, 'share', { lower: true }),
      d('In position', E.positioning ?? 0, O?.positioning ?? 0, 'pct', { tol: 2 }),
    ] };
  }
  const lines = Object.entries(GROUP).map(([pos, t]) => { const ps = H.filter((p) => p.pos === pos); return ps.length ? { t, r: mean(ps.map((p) => p.rating)) } : null; }).filter(Boolean);
  const contrib = H.filter((p) => p.goals || p.assists).sort((a, b) => (b.goals + b.assists) - (a.goals + a.assists) || String(a.name).localeCompare(String(b.name)));
  const motm = H.find((p) => p.mom) ?? null;
  return { id: m.id, ts: m.ts, mode: { playoff: 'Playoff', friendly: 'Friendly' }[m.type] ?? 'League', res: m.res, gf: m.home.goals, ga: m.away.goals, opp: m.away.name, oppCrest: m.away.crest,
    rows, deeper, lines, avg: mean(H.map((p) => p.rating)),
    contrib: contrib.map((p) => ({ n: p.name, g: p.goals, a: p.assists })), motm: motm ? { n: motm.name, r: motm.rating } : null,
    players: H.map((p) => ({ n: p.name, pos: p.pos, r: p.rating, g: p.goals, a: p.assists, mom: p.mom })) };
}
