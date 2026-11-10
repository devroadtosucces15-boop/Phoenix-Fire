// Organization layer (Phase 2): Phoenix Fire is ONE organization made of several EA club instances.
// The club list comes from the Worker (GET /api/org/clubs/public, edited in Boardroom → Organization), with
// config.json → homeClubId as the last-resort fallback. Everything downstream (fetch, build, next/ data, result posts) sees:
//   - one combined "home" club record whose members are unique players (one identity across clubs, memberships kept),
//   - every match once (a derby between two of our clubs is not counted twice), each carrying its source club ID,
//   - a per-club breakdown for the optional club filter.
// No dependencies on the rest of scripts/ so next/lib/data.mjs can import it too.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v) || 0);
const lower = (s) => String(s ?? '').toLowerCase();

// ---------- where the club list comes from ----------

export const fallbackClubs = (config) => [{
  ea_club_id: String(config.homeClubId), display_name: config.siteTitle ?? String(config.homeClubId), division_id: null, sync_members: true, sync_matches: true,
}];

const cleanClub = (c) => ({
  ea_club_id: String(c.ea_club_id), display_name: String(c.display_name ?? c.ea_club_id), division_id: c.division_id ?? null,
  sync_members: c.sync_members === undefined ? true : !!c.sync_members, sync_matches: c.sync_matches === undefined ? true : !!c.sync_matches,
});

// Keyed like /api/bot/settings/public (key = sha256(DISCORD_CLIENT_SECRET:norex-bot-settings)). The job has no D1 access, so it asks the Worker.
export const orgKey = (secret) => createHash('sha256').update(`${secret}:norex-bot-settings`).digest('hex');

export async function loadOrgClubs(config, { fetchFn = fetch, secret = process.env.DISCORD_CLIENT_SECRET } = {}) {
  const api = config.members?.api;
  if (!api || !secret) return { ok: false, error: 'members API or DISCORD_CLIENT_SECRET not set', clubs: [] };
  try {
    const res = await fetchFn(`${api}/api/org/clubs/public`, { signal: AbortSignal.timeout(10000), headers: { 'X-Phoenix-Key': orgKey(secret) } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    if (!Array.isArray(body?.clubs)) throw new Error('unexpected response');
    return { ok: true, clubs: body.clubs.map(cleanClub) };
  } catch (e) {
    return { ok: false, error: e.message, clubs: [] };
  }
}

export const snapshotFile = (dataDir) => path.join(dataDir, 'org.json');
export function readSnapshot(dataDir) {
  try { const s = JSON.parse(fs.readFileSync(snapshotFile(dataDir), 'utf8')); return Array.isArray(s?.clubs) && s.clubs.length ? s : null; } catch { return null; }
}

// primary = the club whose ID keeps the stable site URLs (config.homeClubId when it is part of the organization, else the first club).
function describe(clubs, config, source, extra = {}) {
  const list = clubs.map(cleanClub);
  const ids = list.map((c) => c.ea_club_id);
  const home = String(config.homeClubId);
  return { source, clubs: list, ids, primary: ids.includes(home) ? home : ids[0], ...extra };
}

// live: ask the Worker (fetch jobs, post-results). Without live – or when the Worker is unreachable – the snapshot the last
// successful run wrote to data/org.json is used, and only then config.homeClubId. An empty list from the Worker is treated as
// "not usable" (nothing would sync) and says so.
export async function resolveOrgClubs(config, { dataDir, live = false, write = false, log = console.warn, ...opts } = {}) {
  if (live) {
    const r = await loadOrgClubs(config, opts);
    if (r.ok && r.clubs.length) {
      const org = describe(r.clubs, config, 'api', { fetchedAt: new Date().toISOString() });
      if (write && dataDir) { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(snapshotFile(dataDir), JSON.stringify({ fetchedAt: org.fetchedAt, clubs: org.clubs }, null, 2)); }
      return org;
    }
    log(r.ok ? 'Organization config lists no active EA clubs – using the last snapshot / config.json homeClubId.' : `Organization clubs not loaded (${r.error}) – using the last snapshot / config.json homeClubId.`);
  }
  const snap = dataDir ? readSnapshot(dataDir) : null;
  if (snap) return describe(snap.clubs, config, 'snapshot', { fetchedAt: snap.fetchedAt });
  return describe(fallbackClubs(config), config, 'config');
}

// Sync (no network) variant for modules that load at import time.
export const orgClubsFromDisk = (config, dataDir) => {
  const snap = dataDir ? readSnapshot(dataDir) : null;
  return snap ? describe(snap.clubs, config, 'snapshot', { fetchedAt: snap.fetchedAt }) : describe(fallbackClubs(config), config, 'config');
};

// ---------- identity: one player across clubs ----------

// Member rows are per club and carry only a gamer tag, so identity = tag (EA tags are unique per platform). Stats add up across clubs;
// averages are weighted by games played.
const ADD = ['gamesPlayed', 'goals', 'assists', 'manOfTheMatch', 'redCards', 'tacklesMade', 'cleanSheetsDef', 'cleanSheetsGK', 'shotsOnTarget', 'shots', 'passesMade', 'passAttempts', 'tackleAttempts', 'saves', 'secondassists', 'dribbles'];
const AVG = ['ratingAve', 'winRate', 'passSuccessRate', 'tackleSuccessRate', 'shotSuccessRate'];

function mergeRows(rows, clubOf) {
  const sorted = [...rows].sort((a, b) => num(b.gamesPlayed) - num(a.gamesPlayed));
  const base = { ...sorted[0] };
  if (sorted.length > 1) {
    const total = sorted.reduce((s, r) => s + num(r.gamesPlayed), 0);
    for (const k of ADD) if (sorted.some((r) => r[k] !== undefined)) base[k] = String(sorted.reduce((s, r) => s + num(r[k]), 0));
    for (const k of AVG) if (sorted.some((r) => r[k] !== undefined)) base[k] = total ? String(+(sorted.reduce((s, r) => s + num(r[k]) * num(r.gamesPlayed), 0) / total).toFixed(2)) : base[k];
    base.proOverall = String(Math.max(...sorted.map((r) => num(r.proOverall))));
  }
  base.clubs = sorted.map((r) => ({ clubId: clubOf.get(r), gamesPlayed: num(r.gamesPlayed), goals: num(r.goals), assists: num(r.assists) })); // memberships
  return base;
}

function mergeByName(records, field) {
  const groups = new Map(), clubOf = new Map();
  for (const rec of records) for (const row of rec[field] ?? []) {
    if (!row?.name) continue;
    clubOf.set(row, String(rec.id));
    (groups.get(lower(row.name)) ?? groups.set(lower(row.name), []).get(lower(row.name))).push(row);
  }
  return [...groups.values()].map((rows) => mergeRows(rows, clubOf));
}

// ---------- matches: once each, with provenance ----------

export const matchKey = (m) => (m.matchId ? `id:${m.matchId}` : `c:${m.timestamp}|${Object.keys(m.clubs ?? {}).sort().join(',')}|${Object.values(m.clubs ?? {}).map((c) => c.goals).join('-')}`);
const compositeKey = (m) => `c:${m.timestamp}|${Object.keys(m.clubs ?? {}).sort().join(',')}|${Object.keys(m.clubs ?? {}).sort().map((k) => m.clubs[k].goals).join('-')}`;

// Turns every match one of our clubs played into "the organization's" match: our side sits under the primary club ID (so the
// existing pages read it the same way), the real club it came from is kept in `src`, all our clubs in the match in `sources`.
// A match two of our clubs played against each other (`internal`) keeps the other side as an ordinary opponent and counts once.
export function combineMatches(matches, { ids, primary }) {
  const idSet = new Set(ids), seen = new Set(), out = [];
  let dropped = 0;
  for (const m of matches) {
    const present = ids.filter((id) => m.clubs?.[id]);
    if (!present.length) { out.push(m); continue; }
    const key = matchKey(m), comp = compositeKey(m);
    if (seen.has(key) || seen.has(comp)) { dropped++; continue; }
    seen.add(key); seen.add(comp);
    const src = present.includes(primary) ? primary : present[0];
    const base = { ...m, src, sources: present, internal: present.length > 1, mode: m.matchType ?? 'leagueMatch' };
    if (src !== primary) {
      const { [src]: us, ...clubs } = m.clubs, { [src]: ours, ...players } = m.players ?? {};
      base.clubs = { [primary]: us, ...clubs };
      base.players = { [primary]: ours ?? {}, ...players };
    }
    out.push(base);
  }
  return { matches: out, dropped };
}

// ---------- the combined club ----------

const OVERALL_ADD = ['gamesPlayed', 'wins', 'ties', 'losses', 'goals', 'goalsAgainst', 'promotions', 'relegations', 'cleanSheets', 'titlesWon', 'leaguesWon'];

// records: Map(id → data/clubs/<id>.json). Returns { club, matches, perClub, stats }. With one club it is the identity function
// (the record and matches come back as they were, plus provenance on the matches).
export function combineOrg({ org, records, matches }) {
  const ids = org.ids.filter((id) => records.has(id) || matches.some((m) => m.clubs?.[id]));
  const primary = ids.includes(org.primary) ? org.primary : ids[0] ?? org.primary;
  const { matches: all, dropped } = combineMatches(matches, { ids: ids.length ? ids : [primary], primary });
  const ours = all.filter((m) => m.src);
  const present = ids.map((id) => records.get(id)).filter(Boolean);
  let club = records.get(primary) ?? present[0] ?? {};
  if (present.length > 1) {
    const overall = { ...(club.overall ?? {}) };
    for (const k of OVERALL_ADD) if (present.some((r) => r.overall?.[k] !== undefined)) overall[k] = String(present.reduce((s, r) => s + num(r.overall?.[k]), 0));
    // EA counts a derby in both clubs' records – take the second side back out so the match counts once.
    for (const m of ours.filter((x) => x.internal)) for (const other of m.sources.filter((id) => id !== m.src)) {
      const side = m.clubs[other] ?? m.clubs[primary]; if (!side) continue;
      overall.gamesPlayed = String(num(overall.gamesPlayed) - 1);
      overall.wins = String(num(overall.wins) - (side.wins === '1' ? 1 : 0)); overall.losses = String(num(overall.losses) - (side.losses === '1' ? 1 : 0));
      overall.ties = String(num(overall.ties) - (side.wins !== '1' && side.losses !== '1' ? 1 : 0));
      overall.goals = String(num(overall.goals) - num(side.goals)); overall.goalsAgainst = String(num(overall.goalsAgainst) - num(m.clubs[m.src === other ? primary : m.src]?.goals));
    }
    club = { ...club, overall, members: mergeByName(present, 'members'), career: mergeByName(present, 'career'), org: { ids, clubs: present.map((r) => r.id) } };
  }
  const byMode = {};
  for (const m of ours) byMode[m.mode] = (byMode[m.mode] ?? 0) + 1;
  const perClub = ids.map((id) => {
    const cfg = org.clubs.find((c) => c.ea_club_id === id), rec = records.get(id);
    const mine = ours.filter((m) => m.sources.includes(id));
    return { id, name: cfg?.display_name ?? rec?.info?.name ?? id, divisionId: cfg?.division_id ?? null, members: (rec?.members ?? []).length, matches: mine.length,
      lastMatch: mine.reduce((t, m) => Math.max(t, num(m.timestamp)), 0) || null, fetchedAt: rec?.fetchedAt ?? null, syncMembers: cfg?.sync_members ?? true, syncMatches: cfg?.sync_matches ?? true };
  });
  const memberships = present.reduce((s, r) => s + (r.members ?? []).length, 0);
  const stats = { clubs: ids.length, matches: ours.length, byMode, duplicatesDropped: dropped, internal: ours.filter((m) => m.internal).length, players: (club.members ?? []).length, memberships };
  return { club, matches: all, perClub, stats, primary, ids };
}

// What api/org.json shows: coverage and freshness stated honestly (EA only returns recent matches, so history starts when we first synced).
export function orgOverview(combined, org) {
  const first = combined.matches.filter((m) => m.src).reduce((t, m) => Math.min(t, num(m.timestamp) || t), Infinity);
  return {
    source: org.source, primary: combined.primary, fetchedAt: org.fetchedAt ?? null, ...combined.stats, clubsConfigured: org.ids.length,
    perClub: combined.perClub, coverage: { firstMatch: Number.isFinite(first) ? first : null, note: 'EA only returns recent matches; history starts when each club was first synced.' },
  };
}

// ---------- Discord destinations ----------

// Asks the Worker which channel a purpose resolves to for one club (club → division → org scope, bot/orgconfig.js resolveChannel).
// Never invents a destination: { ok: true, channelId: null } means "configured as missing" and the caller must report it.
export async function resolveRoute(config, purpose, clubId, { fetchFn = fetch, secret = process.env.DISCORD_CLIENT_SECRET } = {}) {
  const api = config.members?.api;
  if (!api || !secret) return { ok: false, channelId: null, error: 'members API or DISCORD_CLIENT_SECRET not set' };
  try {
    const qs = new URLSearchParams({ purpose, ...(clubId ? { club: String(clubId) } : {}) });
    const res = await fetchFn(`${api}/api/org/route/public?${qs}`, { signal: AbortSignal.timeout(10000), headers: { 'X-Phoenix-Key': orgKey(secret) } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    return { ok: true, channelId: body.channelId ?? null, guildId: body.guildId ?? null, scope: body.scope ?? null };
  } catch (e) {
    return { ok: false, channelId: null, error: e.message };
  }
}
