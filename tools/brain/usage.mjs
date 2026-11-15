// Usage snapshots for the project brain. A standalone script cannot read the app's 5-hour and weekly percent (see BRAIN-SPEC "Usage reading"),
// so a session writes a snapshot with `node tools/brain/usage.mjs write --five 13 --week 2 [--five-reset ISO] [--week-reset ISO] [--source name]`.
// State lives in LIBRARY/state/usage.json (latest + capped history); thresholds in LIBRARY/state/usage-policy.json. No secrets.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DIR = path.join(ROOT, 'LIBRARY/state');
const USAGE = path.join(DIR, 'usage.json');
const POLICY = path.join(DIR, 'usage-policy.json');
export const HISTORY_MAX = 200;
const DEFAULT_POLICY = { fiveHourPercent: 80, weeklyPercent: 85, staleAfterMinutes: 90 };
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const pct = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 10) / 10 : null; };
const iso = (v) => { if (v == null || v === '') return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };

export function readPolicy() { const p = readJson(POLICY, {}); return { ...DEFAULT_POLICY, ...Object.fromEntries(Object.entries(p).filter(([k, v]) => k in DEFAULT_POLICY && Number.isFinite(Number(v)) && Number(v) > 0).map(([k, v]) => [k, Number(v)])) , saveMode: p.saveMode || '' }; }

// Pure: what the snapshot means under the policy. `now` is injectable for tests.
export function evaluate(snap, policy = readPolicy(), now = Date.now()) {
  if (!snap || (snap.fiveHour == null && snap.weekly == null)) return { has: false, saveMode: false, reasons: [], ageMinutes: null, stale: true };
  const t = new Date(snap.timestamp).getTime();
  const ageMinutes = Number.isFinite(t) ? Math.max(0, Math.round((now - t) / 60000)) : null;
  const reasons = [];
  if (snap.fiveHour != null && snap.fiveHour >= policy.fiveHourPercent) reasons.push(`5-hour usage ${snap.fiveHour}% is at or above ${policy.fiveHourPercent}%`);
  if (snap.weekly != null && snap.weekly >= policy.weeklyPercent) reasons.push(`weekly usage ${snap.weekly}% is at or above ${policy.weeklyPercent}%`);
  return { has: true, saveMode: reasons.length > 0, reasons, ageMinutes, stale: ageMinutes == null || ageMinutes > policy.staleAfterMinutes };
}

export function readUsage() { const u = readJson(USAGE, {}); return { latest: u.latest || null, history: Array.isArray(u.history) ? u.history : [] }; }

// Validates and appends a snapshot. Returns {ok, snapshot} or {ok:false, error}.
export function writeSnapshot({ fiveHour, weekly, fiveHourResetsAt, weeklyResetsAt, source, timestamp } = {}, now = new Date()) {
  const f = fiveHour == null ? null : pct(fiveHour); const w = weekly == null ? null : pct(weekly);
  if (f == null && w == null) return { ok: false, error: 'give --five and/or --week as a percent from 0 to 100' };
  if ((fiveHour != null && f == null) || (weekly != null && w == null)) return { ok: false, error: 'percent must be a number from 0 to 100' };
  const snapshot = { fiveHour: f, weekly: w, fiveHourResetsAt: iso(fiveHourResetsAt), weeklyResetsAt: iso(weeklyResetsAt), timestamp: iso(timestamp) || now.toISOString(), source: String(source || 'session').replace(/[^\w .:()/,-]/g, '').slice(0, 80) };
  const cur = readUsage();
  const history = (cur.latest ? [...cur.history, cur.latest] : cur.history).slice(-HISTORY_MAX);
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(USAGE, JSON.stringify({ latest: snapshot, history }, null, 2) + '\n');
  return { ok: true, snapshot };
}

export function usageModel(now = Date.now()) {
  const policy = readPolicy(); const { latest, history } = readUsage();
  const state = evaluate(latest, policy, now);
  const items = state.saveMode ? (JSON.parse(fs.readFileSync(path.join(ROOT, 'LIBRARY/roadmap.json'), 'utf8')).items || []).filter((i) => i.lowHanging && i.status !== 'DONE').map((i) => ({ id: i.id, title: i.title })) : [];
  return { latest, history: history.slice(-20), policy, ...state, lowHanging: items };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2); const arg = (n) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : undefined; };
  if (a[0] === 'write') {
    const r = writeSnapshot({ fiveHour: arg('--five'), weekly: arg('--week'), fiveHourResetsAt: arg('--five-reset'), weeklyResetsAt: arg('--week-reset'), source: arg('--source') });
    if (!r.ok) { console.error(r.error); process.exit(1); }
    const e = evaluate(r.snapshot); console.log(`usage saved: 5-hour ${r.snapshot.fiveHour ?? '?'}%, weekly ${r.snapshot.weekly ?? '?'}%${e.saveMode ? ' · SAVE MODE: ' + e.reasons.join('; ') : ''}`);
  } else { const m = usageModel(); console.log(JSON.stringify({ latest: m.latest, saveMode: m.saveMode, ageMinutes: m.ageMinutes, stale: m.stale }, null, 2)); }
}
