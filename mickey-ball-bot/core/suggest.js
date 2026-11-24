// Suggested lineup: pick the formation and the assignment of the signed-up players that scores best.
// A player's score for a slot = how well the slot fits the position they chose (or usually play) × how well they have been rating.
import { FORMATIONS, slotsOf, LINE } from './formations.js';

const SIDE = { LB: 'L', LWB: 'L', LM: 'L', LW: 'L', RB: 'R', RWB: 'R', RM: 'R', RW: 'R' };
const NEAR = { goalkeeper: [], defender: ['midfielder'], midfielder: ['defender', 'forward'], forward: ['midfielder'] };
// 0..1: how well `slot` suits a player who chose `pos` (a role) or usually plays `hist` (a line word) – both may be missing
export function fit(c, slot) {
  const line = LINE[slot];
  if (c.pos && LINE[c.pos]) {
    if (c.pos === slot) return 1;
    const cl = LINE[c.pos];
    if (cl === 'goalkeeper' || line === 'goalkeeper') return 0.08;
    if (cl === line) return SIDE[c.pos] && SIDE[c.pos] === SIDE[slot] ? 0.94 : 0.8;
    return NEAR[cl].includes(line) ? 0.5 : 0.3;
  }
  if (c.hist) {
    if (line === 'goalkeeper' || c.hist === 'goalkeeper') return c.hist === line ? 0.9 : 0.08;
    return c.hist === line ? 0.85 : NEAR[c.hist]?.includes(line) ? 0.5 : 0.3;
  }
  return line === 'goalkeeper' ? 0.12 : 0.65;
}
const quality = (c) => (c.rating > 0 ? Math.min(10, c.rating) / 10 : 0.62);
export const score = (c, slot) => fit(c, slot) * (0.4 + 0.6 * quality(c));

// Hungarian algorithm (minimise cost); rows ≤ cols. Returns col per row.
function assign(cost) {
  const n = cost.length, m = cost[0].length, u = Array(n + 1).fill(0), v = Array(m + 1).fill(0), p = Array(m + 1).fill(0), way = Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i; let j0 = 0; const minv = Array(m + 1).fill(Infinity), used = Array(m + 1).fill(false);
    do {
      used[j0] = true; const i0 = p[j0]; let delta = Infinity, j1 = 0;
      for (let j = 1; j <= m; j++) if (!used[j]) {
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= m; j++) if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const res = Array(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j]) res[p[j] - 1] = j - 1;
  return res;
}

// players: [{ id, name, pos?, hist?, rating? }] → { formation, slots: [{ i, role, x, y, c: player|null, s }], total, exact }
export function suggest(players) {
  let best = null;
  for (const f of FORMATIONS) {
    const slots = slotsOf(f.name), cols = Math.max(players.length, 11);
    const cost = slots.map((s) => Array.from({ length: cols }, (_, j) => -(players[j] ? score(players[j], s.role) : 0)));
    const pick = assign(cost);
    const out = slots.map((s, k) => { const c = players[pick[k]] ?? null; return { ...s, c, s: c ? score(c, s.role) : 0 }; });
    const total = out.reduce((a, s) => a + s.s, 0), exact = out.filter((s) => s.c?.pos === s.role).length;
    const value = total + exact * 0.01;
    if (!best || value > best.value + 1e-9) best = { formation: f.name, slots: out, total, exact, value };
  }
  return best;
}
