// Turns stored matches into the shapes the cards draw, and decides which pictures a club needs.
import { crestUrl } from './ea.js';
const TOP_KEYS = ['goals', 'assists', 'ga', 'rating', 'motm', 'games']; // the leaderboards that get a drawn table (same keys as TOP_STATS in the card templates)

// FNV-1a: the same data always gets the same key, so a changed number gets a new picture and Discord never shows a stale one.
export function hash(o) { let h = 2166136261; const s = JSON.stringify(o); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

export const clubView = (row) => ({ id: String(row.club_id ?? row.id), name: row.name, crestId: row.crest ?? null, crest: crestUrl(row.crest) });

// A normalized match (home = the tracked club) → what the match cards draw.
export function drawMatch(m) {
  const mine = m.home.players;
  return { id: m.id, ts: m.ts, res: m.res, gf: m.home.goals, ga: m.away.goals, opp: m.away.name, oppCrest: crestUrl(m.away.crestId), type: m.type ?? 'league',
    scorers: mine.filter((p) => p.goals > 0).map((p) => ({ n: p.name, g: p.goals })), motm: mine.find((p) => p.mom)?.name ?? null,
    ps: mine.map((p) => ({ n: p.name, pos: p.pos, r: p.rating, g: p.goals, a: p.assists, sh: p.shots, pa: p.passAtt, pm: p.passesMade, ta: p.tackleAtt, tm: p.tacklesMade, mom: p.mom })) };
}

export async function clubData(st, club) {
  const t = (await st.clubTotals(club.id)) ?? {};
  const rows = await st.allResults(club.id);
  return { name: club.name, crest: club.crest, gp: t.gp ?? 0, w: t.w ?? 0, d: t.d ?? 0, l: t.l ?? 0, gf: t.gf ?? 0, ga: t.ga ?? 0, winPct: t.gp ? Math.round((t.w / t.gp) * 100) : 0,
    form: rows.slice(0, 10).map((r) => r.res), matches: (await st.recentMatches(club.id, 8)).map(drawMatch) };
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';
const key = (club, kind, ref, data) => `${club.id}/${kind}${ref ? `-${slug(ref)}` : ''}-${hash(data)}.png`;

// The pictures to (re)draw. `matches` = normalized matches whose cards are needed now; the club-wide cards are refreshed when their data changed.
// Jobs whose key is already in the manifest are skipped, so nothing is drawn twice.
export async function buildJobs(st, club, matches = [], { clubWide = true } = {}) {
  const have = await st.cardMap(club.id), jobs = [];
  const add = (kind, ref, data) => { const k = key(club, kind, ref, data); if (have.get(`${kind}|${ref ?? ''}`) !== k) jobs.push({ kind, ref: ref ?? '', key: k, club: { id: club.id }, data }); };
  const cd = { name: club.name, crest: club.crest };
  for (const m of matches) { const dm = drawMatch(m); for (const kind of ['score', 'field', 'box']) add(kind, m.id, { club: cd, m: dm }); }
  if (clubWide) {
    const c = await clubData(st, club), players = await st.rosterData(club.id);
    add('club', '', { club: c });
    add('results', '', { club: c });
    for (const stat of TOP_KEYS) add('top', stat, { club: cd, stat, players });
    for (const p of players) add('player', p.n, { club: cd, p });
  }
  return jobs;
}

export const cardUrl = (env, map, kind, ref = '') => { const k = map.get(`${kind}|${ref}`); return k ? `${String(env.PUBLIC_URL).replace(/\/$/, '')}/c/${k}` : null; };

// Current run and best runs from results newest-first.
export function streaks(rows) {
  const kind = rows[0]?.res, best = { W: 0, D: 0, L: 0 };
  let cur = 0, run = 0, prev = null;
  for (const r of [...rows].reverse()) { run = r.res === prev ? run + 1 : 1; prev = r.res; best[r.res] = Math.max(best[r.res], run); }
  for (const r of rows) { if (r.res === kind) cur++; else break; }
  return { n: cur, res: kind, best };
}
