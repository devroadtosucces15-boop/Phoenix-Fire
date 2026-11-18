// Checks the decoded event counters (scripts/lib/events.mjs) against the named fields EA already sends on the same player row.
// A decoded stat is only trusted for a KPI when it agrees with EA's own number; this reports how often it does (and which rows differ),
// plus the ids that have no name yet. Pure: pass it match files already read. CLI: node scripts/validate-events.mjs
import { decodeEvents, unknownIds, candidateLabel } from './events.mjs';

// [EA field, label, how the decoded stats rebuild it]
export const CHECKS = [
  // EA's passesmade counts offside passes (id 153); id 215 does not (fc-clubs-api documents this), so the rebuild adds 153
  ['passesmade', 'passes completed (215 + 153 offside)', (d) => d.passesCompleted + d.offsidePasses],
  ['passattempts', 'pass attempts (215 + 153 + 216)', (d) => d.passesCompleted + d.offsidePasses + d.passesFailed],
  ['tacklesmade', 'tackles won (id 0)', (d) => d.tacklesWon],
  ['tackleattempts', 'tackle attempts (ids 0 + 1)', (d) => d.tacklesWon + d.tacklesLost],
  ['shots', 'shots (217 + 218)', (d) => d.shots],
  ['saves', 'saves (id 202)', (d) => d.shotsSaved],
  ['saves', 'saves (id 267)', (d) => d.goodDirectionSaves],
  ['goals', 'goals (id 214)', (d) => d.goalsEvent],
  ['assists', 'assists (id 11)', (d) => d.assistsEvent],
];

export function eventRows(matches) {
  const rows = [];
  for (const m of matches) for (const list of Object.values(m.players ?? {})) for (const p of Object.values(list)) if (p?.evraw) rows.push(p);
  return rows;
}

export function validateDecoder(matches) {
  const rows = eventRows(matches);
  const decoded = rows.map((p) => decodeEvents(p.evraw));
  const checks = CHECKS.map(([field, label, f]) => {
    let agree = 0, nonZero = 0, agreeNonZero = 0;
    const differs = [];
    rows.forEach((p, i) => {
      const ea = Number(p[field]) || 0, mine = f(decoded[i]);
      if (ea > 0) nonZero++;
      if (ea === mine) { agree++; if (ea > 0) agreeNonZero++; } else if (differs.length < 5) differs.push(`${p.playername ?? '?'}: EA ${ea}, decoded ${mine}`);
    });
    return { field, label, rows: rows.length, agree, nonZero, agreeNonZero, differs };
  });
  return { rows: rows.length, checks, unknown: unknownIds(rows.map((p) => p.evraw)) };
}

export function formatReport(r) {
  const lines = [`Decoder check on ${r.rows} player rows with event data`];
  for (const c of r.checks) lines.push(`  ${c.label.padEnd(30)} ${c.agree}/${c.rows} agree${c.nonZero ? ` (${c.agreeNonZero}/${c.nonZero} of the rows where EA's number is above 0)` : ''}${c.differs.length ? `  e.g. ${c.differs.slice(0, 2).join('; ')}` : ''}`);
  const ids = Object.entries(r.unknown).sort((a, b) => b[1] - a[1]);
  lines.push(`Ids with no name yet (${ids.length}): ${ids.map(([id, n]) => `${id}×${n}${candidateLabel(id) ? ` (candidate: ${candidateLabel(id)})` : ''}`).join(' ')}`);
  return lines.join('\n');
}
