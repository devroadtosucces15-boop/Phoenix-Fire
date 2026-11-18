// Session recap: a playing session is a run of matches of one club with no gap longer than the configured idle time between them. When the
// session has ended (no new match for that long), one recap goes out: record, goals, the matches, top performers, man of the match awards,
// standout decoded stats (only where EA's event counters exist) and a short "what to work on". Pure: no I/O, no club names, no channel.
//   config.sessionRecap = { enabled, idleGapMinutes, minMatches, maxAgeHours }   (config.json; defaults below)
import { decodeEvents } from './events.mjs';
import { crestCandidates } from './ea-assets.mjs';

const n = (v) => +v || 0;
export const DEFAULTS = { enabled: true, idleGapMinutes: 45, minMatches: 2, maxAgeHours: 6 };
export const settingsOf = (config) => {
  const c = config?.sessionRecap ?? {};
  const num = (v, d, min) => (Number.isFinite(+v) && v !== '' && v !== null && +v >= min ? +v : d);
  return { enabled: c.enabled !== false, idleGapMinutes: num(c.idleGapMinutes, DEFAULTS.idleGapMinutes, 1), minMatches: Math.floor(num(c.minMatches, DEFAULTS.minMatches, 1)), maxAgeHours: num(c.maxAgeHours, DEFAULTS.maxAgeHours, 1) };
};

// Raw EA matches → sessions per source club (the first organization club found in the match). A derby is one match for the club listed first.
export function findSessions(matches, orgIds, gapMinutes = DEFAULTS.idleGapMinutes) {
  const ids = orgIds.map(String), by = new Map();
  for (const m of matches) {
    const src = ids.find((id) => m.clubs?.[id]);
    if (!src || !n(m.timestamp) || !Object.keys(m.players?.[src] ?? {}).length) continue;
    (by.get(src) ?? by.set(src, []).get(src)).push(m);
  }
  const sessions = [];
  for (const [club, list] of by) {
    list.sort((a, b) => n(a.timestamp) - n(b.timestamp));
    let cur = null;
    for (const m of list) {
      if (cur && n(m.timestamp) - n(cur.matches.at(-1).timestamp) <= gapMinutes * 60) cur.matches.push(m);
      else sessions.push((cur = { club, matches: [m] }));
    }
  }
  for (const s of sessions) { s.start = n(s.matches[0].timestamp); s.end = n(s.matches.at(-1).timestamp); s.key = `session-recap:${s.club}:${s.matches[0].matchId}`; }
  return sessions.sort((a, b) => a.end - b.end);
}

// A session is over once nothing new arrived for the whole idle gap. Too old = left alone (no recap for last week's sessions after a roll-out).
export const isEnded = (s, nowSec, gapMinutes) => nowSec - s.end >= gapMinutes * 60;
export const isFresh = (s, nowSec, maxAgeHours) => nowSec - s.end <= maxAgeHours * 3600;

const MODE = { leagueMatch: 'League', playoffMatch: 'Playoff', friendlyMatch: 'Friendly' };
const pct = (a, b) => (b > 0 ? Math.round((100 * a) / b) : null);
const top = (rows, f, min = 1) => rows.filter((r) => f(r) >= min).sort((a, b) => f(b) - f(a) || String(a.n).localeCompare(String(b.n)))[0] ?? null;

// session → the model the Worker draws (bot/sessionrecap.js). hide: lower-cased names/ids left out of every list.
export function buildRecap(session, { hide = new Set(), clubName = null } = {}) {
  const src = session.club, per = new Map(); // player → totals over the session
  let w = 0, d = 0, l = 0, gf = 0, ga = 0, cs = 0, shots = 0, evMatches = 0, pm = 0, pa = 0, opm = 0, opa = 0, tm = 0, ta = 0;
  const motm = new Map(), ev = new Map(), matches = [];
  const tm2 = { sot: 0, shots: 0, sotThem: 0, foulsUs: 0, foulsThem: 0, intUs: 0, intThem: 0, fwdUs: 0, fwdThem: 0, games: 0 }; // team event totals, only from matches where both sides carry counters
  for (const m of session.matches) {
    const us = m.clubs[src], oppId = Object.keys(m.clubs).find((k) => k !== src), them = m.clubs[oppId] ?? {};
    const f = n(us.goals), a = n(us.goalsAgainst ?? them.goals), res = f > a ? 'W' : f < a ? 'L' : 'D';
    f > a ? w++ : f < a ? l++ : d++; gf += f; ga += a; if (a === 0) cs++;
    const own = Object.entries(m.players[src]).filter(([k, p]) => !hide.has(k.toLowerCase()) && !hide.has(String(p.playername).toLowerCase())).map(([, p]) => p);
    matches.push({ id: String(m.matchId), ts: n(m.timestamp), opp: them.name ?? them.details?.name ?? 'Opponent', gf: f, ga: a, res, mode: MODE[m.matchType] ?? 'Match',
      // for the session picture (scripts/cards.mjs sessionPicture): the opponent crest, who scored, who was man of the match. Not sent on to Discord as data.
      oppCrest: crestCandidates({ team: them.TEAM, crestAssetId: them.kit?.crestAssetId, selectedKitType: them.kit?.selectedKitType })[0],
      scorers: own.filter((p) => n(p.goals)).map((p) => ({ n: p.playername, g: n(p.goals) })), motm: own.find((p) => p.mom === '1')?.playername ?? null });
    const ours = Object.entries(m.players[src]).filter(([k, p]) => !hide.has(k.toLowerCase()) && !hide.has(String(p.playername).toLowerCase()));
    const theirs = Object.values(m.players?.[oppId] ?? {});
    let hasEv = false;
    for (const [k, p] of Object.entries(m.players[src])) { shots += n(p.shots); pm += n(p.passesmade); pa += n(p.passattempts); tm += n(p.tacklesmade); ta += n(p.tackleattempts); }
    for (const p of theirs) { opm += n(p.passesmade); opa += n(p.passattempts); }
    for (const [k, p] of ours) {
      const r = per.get(p.playername) ?? { n: p.playername, apps: 0, g: 0, a: 0, rt: 0, mom: 0 };
      r.apps++; r.g += n(p.goals); r.a += n(p.assists); r.rt += n(p.rating); r.mom += p.mom === '1' ? 1 : 0; per.set(p.playername, r);
      if (p.mom === '1') motm.set(p.playername, (motm.get(p.playername) ?? 0) + 1);
      if (p.evraw) {
        hasEv = true;
        const e = decodeEvents(p.evraw), t = ev.get(p.playername) ?? { n: p.playername, apps: 0, ints: 0, won: 0, fwd: 0, inP: 0, outP: 0, box: 0, aerial: 0 };
        t.apps++; t.ints += e.interceptions; t.won += e.possessionWonDefensiveThird + e.possessionWonMiddleThird + e.possessionWonAttackingThird; t.fwd += e.passesCompletedForward;
        t.inP += e.inPosition; t.outP += e.outOfPosition; t.box += e.shotsOnTargetInsideBox + e.shotsOffTargetInsideBox; t.aerial += e.aerialDuelsWonAttacking + e.aerialDuelsWonDefending; ev.set(p.playername, t);
      }
    }
    if (hasEv) evMatches++;
    const evUs = Object.values(m.players[src]).filter((p) => p.evraw).map((p) => decodeEvents(p.evraw)), evThem = theirs.filter((p) => p.evraw).map((p) => decodeEvents(p.evraw));
    if (evUs.length && evThem.length) {
      const sm = (a, k) => a.reduce((t, e) => t + (e[k] || 0), 0);
      tm2.games++; tm2.sot += sm(evUs, 'shotsOnTarget'); tm2.shots += Object.values(m.players[src]).reduce((t, p) => t + n(p.shots), 0); tm2.sotThem += sm(evThem, 'shotsOnTarget');
      tm2.foulsUs += sm(evUs, 'foulsConceded'); tm2.foulsThem += sm(evThem, 'foulsConceded'); tm2.intUs += sm(evUs, 'interceptions'); tm2.intThem += sm(evThem, 'interceptions');
      tm2.fwdUs += sm(evUs, 'passesCompletedForward'); tm2.fwdThem += sm(evThem, 'passesCompletedForward');
    }
  }
  const players = [...per.values()].map((p) => ({ ...p, avg: p.apps ? p.rt / p.apps : 0 }));
  const n_ = session.matches.length;
  const scorers = players.filter((p) => p.g || p.a).sort((a, b) => (b.g + b.a) - (a.g + a.a) || b.g - a.g || a.n.localeCompare(b.n)).slice(0, 5).map((p) => ({ n: p.n, g: p.g, a: p.a }));
  const best = players.filter((p) => p.apps >= Math.min(2, n_)).sort((a, b) => b.avg - a.avg || a.n.localeCompare(b.n)).slice(0, 3).map((p) => ({ n: p.n, avg: +p.avg.toFixed(1), apps: p.apps }));
  const motms = [...motm.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, c]) => ({ n: name, c }));
  // standout decoded stats: one line each, only counters EA sent, only from the matches that carry them
  let standout = null;
  if (ev.size) {
    const list = [...ev.values()], lines = [];
    const add = (label, row, f, unit) => { if (row) lines.push({ k: label, n: row.n, v: f(row), u: unit }); };
    add('Interceptions', top(list, (r) => r.ints, 3), (r) => r.ints, '');
    add('Possession won', top(list, (r) => r.won, 5), (r) => r.won, '');
    add('Forward passes completed', top(list, (r) => r.fwd, 10), (r) => r.fwd, '');
    add('Shots inside the box', top(list, (r) => r.box, 2), (r) => r.box, '');
    const pos = list.filter((r) => r.inP + r.outP >= 20 && r.apps >= Math.min(2, evMatches)).map((r) => ({ ...r, pr: Math.round((100 * r.inP) / (r.inP + r.outP)) })).sort((a, b) => b.pr - a.pr)[0];
    add('Best positioning', pos, (r) => r.pr, '%');
    const all = list.reduce((t, r) => ({ inP: t.inP + r.inP, outP: t.outP + r.outP }), { inP: 0, outP: 0 });
    standout = { matches: evMatches, of: n_, lines: lines.slice(0, 4), positioning: all.inP + all.outP >= 20 ? pct(all.inP, all.inP + all.outP) : null, team: tm2.games ? { sot: tm2.sot, shots: tm2.shots, sotThem: tm2.sotThem, foulsUs: tm2.foulsUs, foulsThem: tm2.foulsThem } : null };
  }
  // what to work on: a line or the team, never a person
  const work = [], conv = pct(gf, shots), passAcc = pct(pm, pa), oppAcc = pct(opm, opa), tk = pct(tm, ta);
  if (ga / n_ >= 2) work.push(`Defending: ${ga} conceded in ${n_} match${n_ === 1 ? '' : 'es'}, ${(ga / n_).toFixed(1)} a game.`);
  if (shots >= 8 && conv != null && conv < 25) work.push(`Finishing: ${gf} goal${gf === 1 ? '' : 's'} from ${shots} shots (${conv}%).`);
  if (tk != null && ta >= 12 && tk < 45) work.push(`Tackling: won ${tm} of ${ta} (${tk}%).`);
  if (passAcc != null && oppAcc != null && oppAcc - passAcc >= 4) work.push(`Passing: ${passAcc}% against their ${oppAcc}%.`);
  if (standout?.positioning != null && standout.positioning < 70) work.push(`Positioning: in position ${standout.positioning}% of the time.`);
  // from the event counters (league and playoff games; friendlies carry none): finishing on target, discipline, who read whose passes, forward play
  if (tm2.games) {
    if (tm2.shots >= 8 && tm2.sot / tm2.shots < 0.5) work.push(`Finish on target: ${tm2.sot} of ${tm2.shots} shots on target (${pct(tm2.sot, tm2.shots)}%).`);
    if (tm2.foulsUs - tm2.foulsThem >= 3) work.push(`Discipline: ${tm2.foulsUs} fouls conceded to their ${tm2.foulsThem}.`);
    if (tm2.intThem - tm2.intUs >= 6) work.push(`Midfield: step in earlier, they intercepted ${tm2.intThem} to our ${tm2.intUs}.`);
    if (tm2.fwdThem - tm2.fwdUs >= 15) work.push(`Play forward more: ${tm2.fwdUs} forward passes to their ${tm2.fwdThem}.`);
  }
  if (l >= 2 && l > w) work.push(`Results: ${l} defeats in ${n_}. Look at the line-up before the next session.`);
  if (!work.length) work.push(w === n_ ? 'Nothing to fix: keep the standard.' : 'No clear weak spot in the numbers: keep the standard and look at the matches below.');
  return {
    key: session.key, club: src, clubName, start: session.start, end: session.end, count: n_, w, d, l, gf, ga, cs,
    modes: [...new Set(matches.map((m) => m.mode))], matches, scorers, best, motms, standout, work: work.slice(0, 4),
  };
}
