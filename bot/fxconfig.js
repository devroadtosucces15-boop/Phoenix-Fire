// PF-044: the owner-set effects config (budget of 5 or more, a level per effect). Pure, no env. The browser copy is next/static/fxconfig.js
// (same EFFECTS, LEVELS and MIN_BUDGET; tests/fxconfig.test.mjs keeps them equal).
export const EFFECTS = ['reveals', 'glow', 'tilt', 'parallax', 'bursts', 'dockbob', 'gyro', 'haptics', 'insights', 'spring', 'ripple', 'spotlight', 'ping', 'popin'];
export const LEVELS = ['full', 'balanced', 'off'];
export const MIN_BUDGET = 5;
export const DEFAULT_EFFECTS = { budget: MIN_BUDGET, levels: Object.fromEntries(EFFECTS.map((k) => [k, 'full'])) };
// b: the owner's input (any field may be missing and keeps the current value). Returns the clean config or { error }.
export function cleanEffects(b, cur = DEFAULT_EFFECTS) {
  const budget = b?.budget === undefined || b?.budget === '' ? cur.budget : Number(b.budget);
  if (!Number.isInteger(budget) || budget < MIN_BUDGET) return { error: `The budget is a whole number, ${MIN_BUDGET} or more.` };
  const levels = {};
  for (const k of EFFECTS) {
    const v = b?.levels?.[k] ?? cur.levels?.[k] ?? 'full';
    if (!LEVELS.includes(v)) return { error: `The level of ${k} is Full, Balanced or Off.` };
    levels[k] = v;
  }
  return { budget, levels };
}
