// The 29 formations a lineup can use. Each is rows from the back line to the front, left to right inside a row; the keeper is always first.
// A slot is { role, x, y } on a 105 × 68 pitch, our goal on the left, attacking right (same space as the pitch pictures).
export const FORMATIONS = [
  ['3-1-4-2', 'CB CB CB', 'CDM', 'LM CM CM RM', 'ST ST'],
  ['3-4-1-2', 'CB CB CB', 'LM CM CM RM', 'CAM', 'ST ST'],
  ['3-4-2-1', 'CB CB CB', 'LM CM CM RM', 'CAM CAM', 'ST'],
  ['3-4-3', 'CB CB CB', 'LM CM CM RM', 'LW ST RW'],
  ['3-5-2', 'CB CB CB', 'LWB CDM CDM RWB', 'CAM', 'ST ST'],
  ['4-1-2-1-2', 'LB CB CB RB', 'CDM', 'CM CM', 'CAM', 'ST ST'],
  ['4-1-2-1-2 (wide)', 'LB CB CB RB', 'CDM', 'LM RM', 'CAM', 'ST ST'],
  ['4-1-3-2', 'LB CB CB RB', 'CDM', 'LM CM RM', 'ST ST'],
  ['4-1-4-1', 'LB CB CB RB', 'CDM', 'LM CM CM RM', 'ST'],
  ['4-2-1-3', 'LB CB CB RB', 'CDM CDM', 'CAM', 'LW ST RW'],
  ['4-2-2-2', 'LB CB CB RB', 'CDM CDM', 'CAM CAM', 'ST ST'],
  ['4-2-3-1', 'LB CB CB RB', 'CDM CDM', 'CAM CAM CAM', 'ST'],
  ['4-2-3-1 (wide)', 'LB CB CB RB', 'CDM CDM', 'LM CAM RM', 'ST'],
  ['4-3-1-2', 'LB CB CB RB', 'CM CM CM', 'CAM', 'ST ST'],
  ['4-3-2-1', 'LB CB CB RB', 'CM CM CM', 'CAM CAM', 'ST'],
  ['4-3-3', 'LB CB CB RB', 'CM CM CM', 'LW ST RW'],
  ['4-3-3 (attack)', 'LB CB CB RB', 'CM CM CAM', 'LW ST RW'],
  ['4-3-3 (defend)', 'LB CB CB RB', 'CDM CM CM', 'LW ST RW'],
  ['4-3-3 (holding)', 'LB CB CB RB', 'CDM CM CM', 'LW ST RW'],
  ['4-3-3 (false 9)', 'LB CB CB RB', 'CM CM CM', 'LW CF RW'],
  ['4-4-1-1', 'LB CB CB RB', 'LM CM CM RM', 'CAM', 'ST'],
  ['4-4-2', 'LB CB CB RB', 'LM CM CM RM', 'ST ST'],
  ['4-4-2 (holding)', 'LB CB CB RB', 'LM CDM CM RM', 'ST ST'],
  ['4-5-1', 'LB CB CB RB', 'LM CM CAM CM RM', 'ST'],
  ['4-5-1 (attack)', 'LB CB CB RB', 'LM CM CAM CM RM', 'CF'],
  ['5-2-1-2', 'LWB CB CB CB RWB', 'CM CM', 'CAM', 'ST ST'],
  ['5-2-3', 'LWB CB CB CB RWB', 'CM CM', 'LW ST RW'],
  ['5-3-2', 'LWB CB CB CB RWB', 'CM CM CM', 'ST ST'],
  ['5-4-1', 'LWB CB CB CB RWB', 'LM CM CM RM', 'ST'],
].map(([name, ...rows]) => ({ name, rows }));
export const FORMATION_NAMES = FORMATIONS.map((f) => f.name);

// Which line each role belongs to (the sign-up picker, stats and the suggester all use this).
export const LINE = { GK: 'goalkeeper', RB: 'defender', CB: 'defender', LB: 'defender', RWB: 'defender', LWB: 'defender', CDM: 'midfielder', CM: 'midfielder', CAM: 'midfielder', RM: 'midfielder', LM: 'midfielder', RW: 'forward', LW: 'forward', ST: 'forward', CF: 'forward' };
export const ROLES = Object.keys(LINE);

// formation name → 11 slots [{ i, role, x, y }]; the keeper first.
export function slotsOf(name) {
  const f = FORMATIONS.find((x) => x.name === name);
  if (!f) return null;
  const rows = ['GK', ...f.rows], out = [];
  rows.forEach((row, r) => {
    const roles = row.split(' '), x = r === 0 ? 7 : 22 + (r - 1) * (66 / Math.max(1, rows.length - 2)); // back line at 22, front row at 88
    roles.forEach((role, k) => {
      const lat = roles.length === 1 ? 0.5 : 0.1 + (0.8 * k) / (roles.length - 1);
      out.push({ i: out.length, role, x: +x.toFixed(1), y: +(8 + 52 * lat).toFixed(1) });
    });
  });
  return out;
}
