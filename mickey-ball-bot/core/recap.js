// Session recap: a playing session is a run of matches of one club with no gap longer than the idle time between them. When the session has
// ended (no new match for that long) one recap goes out: record, goals, the matches, top performers, man of the match awards, standout decoded
// stats (only where EA's event counters exist) and a short "what to work on". Pure: normalized matches in, plain numbers out.
import { decodeEvents } from './events.js';

const n = (v) => +v || 0;
export const SETTINGS = { idleGapMinutes: 45, minMatches: 2, maxAgeHours: 6 };
const MODE = { playoff: 'Playoff', friendly: 'Friendly' };
const pct = (a, b) => (b > 0 ? Math.round((100 * a) / b) : null);
const top = (rows, f, min = 1) => rows.filter((r) => f(r) >= min).sort((a, b) => f(b) - f(a) || String(a.n).localeCompare(String(b.n)))[0] ?? null;

// matches: normalized, any order. → sessions [{ matches, start, end, key }] oldest first.
export function findSessions(clubId, matches, gapMinutes = SETTINGS.idleGapMinutes) {
  const list = [...matches].filter((m) => n(m.ts) && m.home.players.length).sort((a, b) => a.ts - b.ts), out = [];
  let cur = null;
  for (const m of list) {
    if (cur && m.ts - cur.matches.at(-1).ts <= gapMinutes * 60) cur.matches.push(m);
    else out.push((cur = { matches: [m] }));
  }
  for (const s of out) { s.start = s.matches[0].ts; s.end = s.matches.at(-1).ts; s.key = `recap:${clubId}:${s.matches[0].id}`; }
  return out;
}
export const isEnded = (s, nowSec, gap = SETTINGS.idleGapMinutes) => nowSec - s.end >= gap * 60;
export const isFresh = (s, nowSec, maxH = SETTINGS.maxAgeHours) => nowSec - s.end <= maxH * 3600;
export const isDue = (s, nowSec) => s.matches.length >= SETTINGS.minMatches && isEnded(s, nowSec) && isFresh(s, nowSec);

export function buildRecap(session) {
  const per = new Map(), ev = new Map(), matches = [], motm = new Map();
  let w = 0, d = 0, l = 0, gf = 0, ga = 0, cs = 0, shots = 0, evMatches = 0, pm = 0, pa = 0, opm = 0, opa = 0, tm = 0, ta = 0;
  for (const m of session.matches) {
    const f = m.home.goals, a = m.away.goals, res = f > a ? 'W' : f < a ? 'L' : 'D';
    f > a ? w++ : f < a ? l++ : d++; gf += f; ga += a; if (a === 0) cs++;
    const mine = m.home.players;
    matches.push({ id: m.id, ts: m.ts, opp: m.away.name, oppCrest: m.away.crest, gf: f, ga: a, res, mode: MODE[m.type] ?? 'League',
      scorers: mine.filter((p) => p.goals > 0).map((p) => ({ n: p.name, g: p.goals })), motm: mine.find((p) => p.mom)?.name ?? null });
    let hasEv = false;
    for (const p of mine) { shots += n(p.shots); pm += n(p.passesMade); pa += n(p.passAtt); tm += n(p.tacklesMade); ta += n(p.tackleAtt); }
    for (const p of m.away.players) { opm += n(p.passesMade); opa += n(p.passAtt); }
    for (const p of mine) {
      const r = per.get(p.name) ?? { n: p.name, apps: 0, g: 0, a: 0, rt: 0 };
      r.apps++; r.g += n(p.goals); r.a += n(p.assists); r.rt += n(p.rating); per.set(p.name, r);
      if (p.mom) motm.set(p.name, (motm.get(p.name) ?? 0) + 1);
      if (p.ev) {
        hasEv = true;
        const e = decodeEvents(p.ev), t = ev.get(p.name) ?? { n: p.name, apps: 0, ints: 0, won: 0, fwd: 0, inP: 0, outP: 0, box: 0 };
        t.apps++; t.ints += e.interceptions; t.won += e.possessionWonDefensiveThird + e.possessionWonMiddleThird + e.possessionWonAttackingThird; t.fwd += e.passesCompletedForward;
        t.inP += e.inPosition; t.outP += e.outOfPosition; t.box += e.shotsOnTargetInsideBox + e.shotsOffTargetInsideBox; ev.set(p.name, t);
      }
    }
    if (hasEv) evMatches++;
  }
  const players = [...per.values()].map((p) => ({ ...p, avg: p.apps ? p.rt / p.apps : 0 })), cnt = session.matches.length;
  const scorers = players.filter((p) => p.g || p.a).sort((a, b) => (b.g + b.a) - (a.g + a.a) || b.g - a.g || a.n.localeCompare(b.n)).slice(0, 5).map((p) => ({ n: p.n, g: p.g, a: p.a }));
  const best = players.filter((p) => p.apps >= Math.min(2, cnt)).sort((a, b) => b.avg - a.avg || a.n.localeCompare(b.n)).slice(0, 3).map((p) => ({ n: p.n, avg: +p.avg.toFixed(1), apps: p.apps }));
  const motms = [...motm.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, c]) => ({ n: name, c }));
  let standout = null;
  if (ev.size) {
    const list = [...ev.values()], lines = [];
    const add = (k, row, f, u) => { if (row) lines.push({ k, n: row.n, v: f(row), u }); };
    add('Interceptions', top(list, (r) => r.ints, 3), (r) => r.ints, '');
    add('Possession won', top(list, (r) => r.won, 5), (r) => r.won, '');
    add('Forward passes completed', top(list, (r) => r.fwd, 10), (r) => r.fwd, '');
    add('Shots inside the box', top(list, (r) => r.box, 2), (r) => r.box, '');
    const pos = list.filter((r) => r.inP + r.outP >= 20 && r.apps >= Math.min(2, evMatches)).map((r) => ({ ...r, pr: Math.round((100 * r.inP) / (r.inP + r.outP)) })).sort((a, b) => b.pr - a.pr)[0];
    add('Best positioning', pos, (r) => r.pr, '%');
    const all = list.reduce((t, r) => ({ inP: t.inP + r.inP, outP: t.outP + r.outP }), { inP: 0, outP: 0 });
    standout = { matches: evMatches, of: cnt, lines: lines.slice(0, 4), positioning: all.inP + all.outP >= 20 ? pct(all.inP, all.inP + all.outP) : null };
  }
  const work = [], conv = pct(gf, shots), passAcc = pct(pm, pa), oppAcc = pct(opm, opa), tk = pct(tm, ta);
  if (ga / cnt >= 2) work.push(`Defending: ${ga} conceded in ${cnt} match${cnt === 1 ? '' : 'es'}, ${(ga / cnt).toFixed(1)} a game.`);
  if (shots >= 8 && conv != null && conv < 25) work.push(`Finishing: ${gf} goal${gf === 1 ? '' : 's'} from ${shots} shots (${conv}%).`);
  if (tk != null && ta >= 12 && tk < 45) work.push(`Tackling: won ${tm} of ${ta} (${tk}%).`);
  if (passAcc != null && oppAcc != null && oppAcc - passAcc >= 4) work.push(`Passing: ${passAcc}% against their ${oppAcc}%.`);
  if (standout?.positioning != null && standout.positioning < 70) work.push(`Positioning: in position ${standout.positioning}% of the time.`);
  if (l >= 2 && l > w) work.push(`Results: ${l} defeats in ${cnt}. Look at the line-up before the next session.`);
  if (!work.length) work.push(w === cnt ? 'Nothing to fix: keep the standard.' : 'No clear weak spot in the numbers: keep the standard and look at the matches below.');
  return { key: session.key, start: session.start, end: session.end, count: cnt, w, d, l, gf, ga, cs, modes: [...new Set(matches.map((m) => m.mode))], matches, scorers, best, motms, standout, work: work.slice(0, 3) };
}
