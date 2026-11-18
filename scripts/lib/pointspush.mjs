// PF-024 Item 24: match performance points. The result step in GitHub Actions has no D1 access, so it sends one keyed POST per new home match to the Worker
// (POST /api/points/match, X-Phoenix-Key derived from DISCORD_CLIENT_SECRET like /api/crawl). The Worker owns the rules (editable in the Control Center)
// and pays each claimed member once per match, so a re-sent batch never pays twice. Only gamertags, goals, assists and man of the match leave this script.
import { createHash } from 'node:crypto';

const n = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v) || 0);

/** one match archive entry → { matchId, win, players: [{ name, goals, assists, mom }] } for the clubs in orgIds, or null when none of our clubs played */
export function matchPointRows(match, orgIds) {
  const ids = (orgIds ?? []).map(String), clubId = Object.keys(match?.players ?? {}).find((c) => ids.includes(c));
  if (!clubId || !match.matchId) return null;
  const club = match.clubs?.[clubId] ?? {};
  const players = Object.values(match.players[clubId] ?? {}).filter((p) => p?.playername).map((p) => ({ name: String(p.playername), goals: n(p.goals), assists: n(p.assists), mom: n(p.mom) > 0 }));
  return { matchId: String(match.matchId), win: n(club.goals) > n(club.goalsAgainst), players };
}

/** → { sent, awarded } ; never throws (a points failure must not stop the result posts) */
export async function pushMatchPoints(matches, { api, secret, orgIds }) {
  const out = { sent: 0, awarded: 0 };
  if (!api || !secret) return out;
  const key = createHash('sha256').update(`${secret}:phoenix-points`).digest('hex');
  for (const m of matches ?? []) {
    const body = matchPointRows(m, orgIds);
    if (!body?.players.length) continue;
    try {
      const res = await fetch(`${api}/api/points/match`, { method: 'POST', signal: AbortSignal.timeout(10000), headers: { 'X-Phoenix-Key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      out.sent++; out.awarded += d.awarded ?? 0;
    } catch (e) { console.warn(`Match points not sent for ${m.matchId}: ${e.message}`); }
  }
  return out;
}
