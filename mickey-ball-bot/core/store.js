import { eventSide, decodeEvents, EVENT_BOARDS } from './events.js';
// One storage layer for both runtimes. `x` is an executor: { all(sql, ...p), first(sql, ...p), run(sql, ...p) → changes }.
export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS tracked (guild_id TEXT NOT NULL, club_id TEXT NOT NULL, name TEXT NOT NULL, crest TEXT, channel_id TEXT, added_by TEXT, added_at INTEGER NOT NULL, last_match_ts INTEGER NOT NULL DEFAULT 0, main INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (guild_id, club_id))`,
  `CREATE TABLE IF NOT EXISTS matches (club_id TEXT NOT NULL, match_id TEXT NOT NULL, ts INTEGER NOT NULL, res TEXT NOT NULL, gf INTEGER NOT NULL, ga INTEGER NOT NULL, opp_id TEXT, opp_name TEXT, data TEXT NOT NULL, PRIMARY KEY (club_id, match_id))`,
  `CREATE TABLE IF NOT EXISTS player_lines (club_id TEXT NOT NULL, match_id TEXT NOT NULL, player TEXT NOT NULL, pos TEXT, rating REAL, goals INTEGER, assists INTEGER, shots INTEGER, pass_made INTEGER, pass_att INTEGER, tackle_made INTEGER, tackle_att INTEGER, saves INTEGER, mom INTEGER, ev TEXT, PRIMARY KEY (club_id, match_id, player))`,
  `CREATE TABLE IF NOT EXISTS pending (ref TEXT PRIMARY KEY, token TEXT NOT NULL, guild_id TEXT, channel_id TEXT, user_id TEXT, kind TEXT NOT NULL, game INTEGER, opponents INTEGER, created_at INTEGER NOT NULL, club_id TEXT, match_id TEXT)`,
  `CREATE TABLE IF NOT EXISTS cards (club_id TEXT NOT NULL, kind TEXT NOT NULL, ref TEXT NOT NULL, key TEXT NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY (club_id, kind, ref))`,
  `CREATE TABLE IF NOT EXISTS blobs (key TEXT PRIMARY KEY, b64 TEXT NOT NULL, ts INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT, channel_id TEXT, club_id TEXT NOT NULL, match_id TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  // match days: scheduled events, who answered, and each person's saved time zone
  `CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, channel_id TEXT, message_id TEXT, club_id TEXT, kind TEXT NOT NULL, title TEXT, opponent TEXT, start INTEGER NOT NULL, duration INTEGER NOT NULL DEFAULT 120, tz TEXT, players INTEGER NOT NULL DEFAULT 11, notes TEXT, ping_role TEXT, created_by TEXT, created_at INTEGER NOT NULL, reminded INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS rsvps (event_id TEXT NOT NULL, user_id TEXT NOT NULL, name TEXT, status TEXT NOT NULL, pos TEXT, checked_in INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL, PRIMARY KEY (event_id, user_id))`,
  `CREATE TABLE IF NOT EXISTS user_tz (user_id TEXT PRIMARY KEY, tz TEXT NOT NULL)`,
];

const like = (q) => `%${String(q).replace(/[%_]/g, '')}%`;
const BOARDS = {
  rating: ['AVG(rating)', 'Avg rating', (v) => (+v).toFixed(2), 3], goals: ['SUM(goals)', 'Goals', (v) => v, 1], assists: ['SUM(assists)', 'Assists', (v) => v, 1],
  ga: ['SUM(goals)+SUM(assists)', 'Goals + assists', (v) => v, 1], motm: ['SUM(mom)', 'Man of the match', (v) => v, 1], games: ['COUNT(*)', 'Games', (v) => v, 1],
  shots: ['SUM(shots)', 'Shots', (v) => v, 1], saves: ['SUM(saves)', 'Saves', (v) => v, 1], tackles: ['SUM(tackle_made)', 'Tackles won', (v) => v, 1], passes: ['SUM(pass_made)', 'Passes completed', (v) => v, 1],
};

export function makeStore(x) {
  const id = String;
  return {
    // tracking
    // the first club a server tracks becomes its main club (the one the stat commands use when `club` is left empty)
    track: (g, c, channel, by) => x.run(`INSERT INTO tracked (guild_id, club_id, name, crest, channel_id, added_by, added_at, main) VALUES (?,?,?,?,?,?,?, CASE WHEN EXISTS (SELECT 1 FROM tracked WHERE guild_id=?) THEN 0 ELSE 1 END)
      ON CONFLICT (guild_id, club_id) DO UPDATE SET name=excluded.name, crest=excluded.crest, channel_id=excluded.channel_id`, g, id(c.id), c.name, c.crest ?? null, channel, by, Date.now(), g),
    async setMain(g, c) { await x.run('UPDATE tracked SET main=0 WHERE guild_id=?', g); return x.run('UPDATE tracked SET main=1 WHERE guild_id=? AND club_id=?', g, id(c)); },
    async untrack(g, c) {
      const n = await x.run('DELETE FROM tracked WHERE guild_id=? AND club_id=?', g, id(c));
      if (n && !(await x.first('SELECT 1 a FROM tracked WHERE guild_id=? AND main=1', g))) await x.run('UPDATE tracked SET main=1 WHERE rowid IN (SELECT rowid FROM tracked WHERE guild_id=? ORDER BY added_at LIMIT 1)', g);
      return n;
    },
    trackedFor: (g) => x.all('SELECT * FROM tracked WHERE guild_id=? ORDER BY main DESC, name', g),
    allTracked: () => x.all('SELECT * FROM tracked'),
    setLastTs: (g, c, ts) => x.run('UPDATE tracked SET last_match_ts=? WHERE guild_id=? AND club_id=?', ts, g, id(c)),
    // matches
    // One query for the match and one for all its player lines (json_each keeps it to a single statement, D1 caps queries per request).
    async saveMatch(clubId, m) {
      const data = JSON.stringify(m);
      const ch = await x.run('INSERT OR IGNORE INTO matches (club_id, match_id, ts, res, gf, ga, opp_id, opp_name, data) VALUES (?,?,?,?,?,?,?,?,?)',
        id(clubId), m.id, m.ts, m.res, m.home.goals, m.away.goals, m.away.id, m.away.name, data);
      // a match stored before decoded events were kept gets them added when EA still serves it (EA keeps only the last 10 per type)
      const hasEv = m.home.players.some((p) => p.ev);
      if (!ch && !(hasEv && (await x.run(`UPDATE matches SET data=? WHERE club_id=? AND match_id=? AND NOT EXISTS (SELECT 1 FROM json_each(json_extract(data,'$.home.players')) WHERE json_extract(value,'$.ev') <> '')`, data, id(clubId), m.id)))) return false;
      const lines = JSON.stringify(m.home.players.map((p) => ({ n: p.name, pos: p.pos, r: p.rating, g: p.goals, a: p.assists, sh: p.shots, pm: p.passesMade, pa: p.passAtt, tm: p.tacklesMade, ta: p.tackleAtt, sv: p.saves, mom: p.mom ? 1 : 0, ev: p.ev || null })));
      await x.run(`INSERT OR REPLACE INTO player_lines SELECT ?, ?, json_extract(value,'$.n'), json_extract(value,'$.pos'), json_extract(value,'$.r'), json_extract(value,'$.g'), json_extract(value,'$.a'), json_extract(value,'$.sh'), json_extract(value,'$.pm'), json_extract(value,'$.pa'), json_extract(value,'$.tm'), json_extract(value,'$.ta'), json_extract(value,'$.sv'), json_extract(value,'$.mom'), json_extract(value,'$.ev') FROM json_each(?)`, id(clubId), m.id, lines);
      return ch > 0;
    },
    async storedMatch(clubId, matchId) { const r = await x.first('SELECT data FROM matches WHERE club_id=? AND match_id=?', id(clubId), id(matchId)); return r ? JSON.parse(r.data) : null; },
    clubTotals: (c) => x.first(`SELECT COUNT(*) gp, SUM(res='W') w, SUM(res='D') d, SUM(res='L') l, SUM(gf) gf, SUM(ga) ga FROM matches WHERE club_id=?`, id(c)),
    recentResults: (c, n = 5) => x.all('SELECT match_id, ts, res, gf, ga, opp_name FROM matches WHERE club_id=? ORDER BY ts DESC LIMIT ?', id(c), n),
    allResults: (c) => x.all('SELECT res, gf, ga, ts FROM matches WHERE club_id=? ORDER BY ts DESC', id(c)),
    headToHead: (c, q) => x.all('SELECT ts, res, gf, ga, opp_name FROM matches WHERE club_id=? AND opp_name LIKE ? ORDER BY ts DESC', id(c), like(q)),
    playerNames: (c, q = '') => x.all('SELECT player, COUNT(*) gp FROM player_lines WHERE club_id=? AND player LIKE ? GROUP BY player ORDER BY gp DESC LIMIT 25', id(c), like(q)),
    opponentNames: (c, q = '') => x.all('SELECT opp_name, COUNT(*) n FROM matches WHERE club_id=? AND opp_name LIKE ? GROUP BY opp_name ORDER BY n DESC LIMIT 25', id(c), like(q)),
    playerTotals: (c, limit = 10) => x.all(`SELECT player, COUNT(*) gp, ROUND(AVG(rating),2) avg, SUM(goals) g, SUM(assists) a, SUM(mom) mom FROM player_lines WHERE club_id=? GROUP BY player ORDER BY avg DESC LIMIT ?`, id(c), limit),
    async playerCard(c, name) {
      const t = await x.first(`SELECT player, COUNT(*) gp, AVG(rating) avg, MAX(rating) best, SUM(goals) g, SUM(assists) a, SUM(shots) sh, SUM(mom) mom, SUM(pass_made) pm, SUM(pass_att) pa, SUM(tackle_made) tm, SUM(tackle_att) ta, SUM(saves) sv FROM player_lines WHERE club_id=? AND player=? COLLATE NOCASE`, id(c), name);
      if (!t?.gp) return null;
      const form = (await x.all(`SELECT rating FROM player_lines p JOIN matches m ON m.club_id=p.club_id AND m.match_id=p.match_id WHERE p.club_id=? AND p.player=? COLLATE NOCASE ORDER BY m.ts DESC LIMIT 10`, id(c), name)).map((r) => r.rating).reverse();
      const pos = await x.first('SELECT pos, COUNT(*) c FROM player_lines WHERE club_id=? AND player=? COLLATE NOCASE GROUP BY pos ORDER BY c DESC LIMIT 1', id(c), name);
      return { ...t, form, pos: pos?.pos ?? '' };
    },
    // decoded event counters summed over a player's tracked matches (null when none carry event data)
    async playerEvents(c, name) {
      const rows = await x.all(`SELECT ev FROM player_lines WHERE club_id=? AND player=? COLLATE NOCASE AND ev IS NOT NULL AND ev<>''`, id(c), name);
      return rows.length ? eventSide(rows.map((r) => ({ ev: r.ev }))) : null;
    },
    async leaderboard(c, stat = 'rating', limit = 10) {
      if (EVENT_BOARDS[stat]) {
        const [label, read, min] = EVENT_BOARDS[stat], by = new Map();
        for (const r of await x.all(`SELECT player, ev FROM player_lines WHERE club_id=? AND ev IS NOT NULL AND ev<>'' LIMIT 3000`, id(c))) {
          const a = by.get(r.player) ?? { player: r.player, gp: 0, v: 0 }; a.gp++; a.v += read(decodeEvents(r.ev)); by.set(r.player, a);
        }
        const rows = [...by.values()].filter((r) => r.gp >= min).sort((a, b) => b.v - a.v || b.gp - a.gp).slice(0, limit);
        return { label, rows: rows.map((r) => ({ ...r, shown: r.v })) };
      }
      const [expr, label, fmt, min] = BOARDS[stat] ?? BOARDS.rating;
      const rows = await x.all(`SELECT player, COUNT(*) gp, ${expr} v FROM player_lines WHERE club_id=? GROUP BY player HAVING COUNT(*) >= ? ORDER BY v DESC, gp DESC LIMIT ?`, id(c), min, limit);
      return { label, rows: rows.map((r) => ({ ...r, shown: fmt(r.v) })) };
    },
    // drawn pictures: the newest key per (club, kind, ref)
    putCard: (clubId, kind, ref, key) => x.run('INSERT OR REPLACE INTO cards (club_id, kind, ref, key, ts) VALUES (?,?,?,?,?)', id(clubId), kind, ref ?? '', key, Date.now()),
    async cardMap(clubId) { const m = new Map(); for (const r of await x.all('SELECT kind, ref, key FROM cards WHERE club_id=?', id(clubId))) m.set(`${r.kind}|${r.ref}`, r.key); return m; },
    // picture bytes, kept as base64 text (no decoding on upload); old unreferenced pictures are dropped
    putBlob: (key, b64) => x.run('INSERT OR REPLACE INTO blobs (key, b64, ts) VALUES (?,?,?)', key, b64, Date.now()),
    async getBlob(key) { return (await x.first('SELECT b64 FROM blobs WHERE key=?', key))?.b64 ?? null; },
    pruneBlobs: () => x.run('DELETE FROM blobs WHERE ts < ? AND key NOT IN (SELECT key FROM cards)', Date.now() - 2 * 86400_000),
    // posts waiting for their pictures (scheduled polls)
    addOutbox: (o) => x.run('INSERT INTO outbox (guild_id, channel_id, club_id, match_id, created_at) VALUES (?,?,?,?,?)', o.guild, o.channel, id(o.club), id(o.match), Date.now()),
    takeOutbox: () => x.all('SELECT * FROM outbox ORDER BY id LIMIT 20'),
    delOutbox: (rowId) => x.run('DELETE FROM outbox WHERE id=?', rowId),
    // everything the cards need about a club's tracked history
    async rosterData(clubId) {
      const agg = await x.all(`SELECT player n, COUNT(*) gp, SUM(goals) g, SUM(assists) a, AVG(rating) r, SUM(mom) m, SUM(pass_made) pm, SUM(pass_att) pa, SUM(tackle_made) tm, SUM(tackle_att) ta, SUM(shots) sh, SUM(saves) sv FROM player_lines WHERE club_id=? GROUP BY player ORDER BY gp DESC LIMIT 40`, id(clubId));
      const pos = new Map();
      for (const r of await x.all('SELECT player, pos, COUNT(*) c FROM player_lines WHERE club_id=? GROUP BY player, pos ORDER BY c', id(clubId))) pos.set(r.player, r.pos);
      const trend = new Map();
      for (const r of await x.all(`SELECT p.player n, p.rating r FROM player_lines p JOIN matches m ON m.club_id=p.club_id AND m.match_id=p.match_id WHERE p.club_id=? ORDER BY m.ts DESC LIMIT 500`, id(clubId))) {
        const a = trend.get(r.n) ?? []; if (a.length < 10) a.unshift(r.r); trend.set(r.n, a);
      }
      const evs = new Map();
      for (const r of await x.all(`SELECT player, ev FROM player_lines WHERE club_id=? AND ev IS NOT NULL AND ev<>'' ORDER BY match_id DESC LIMIT 1500`, id(clubId))) { const a = evs.get(r.player) ?? []; a.push({ ev: r.ev }); evs.set(r.player, a); }
      const evOf = (n) => { const e = evs.has(n) ? eventSide(evs.get(n)) : null; return e && { apps: e.apps, ints: e.ints, won: e.won, lost: e.lost, aer: e.aerial, fwd: e.forward, pos: e.positioning, pass: e.passAcc, thru: e.t.throughPasses || 0, drib: e.t.dribblesCompleted || 0, sot: e.t.shotsOnTarget || 0 }; };
      return agg.map((p) => ({ n: p.n, ev: evOf(p.n), x: { sh: p.sh, sv: p.sv, tm: p.tm, pm: p.pm }, pos: pos.get(p.n) ?? '', s: { gp: p.gp, g: p.g, a: p.a, r: +p.r || 0, m: p.m, p: p.pa ? Math.round((p.pm / p.pa) * 100) : 0, t: p.ta ? Math.round((p.tm / p.ta) * 100) : 0 }, tr: trend.get(p.n) ?? [] }));
    },
    async recentMatches(clubId, n = 8) { return (await x.all('SELECT data FROM matches WHERE club_id=? ORDER BY ts DESC LIMIT ?', id(clubId), n)).map((r) => JSON.parse(r.data)); },
    // match days
    addEvent: (e) => x.run('INSERT INTO events (id, guild_id, channel_id, club_id, kind, title, opponent, start, duration, tz, players, notes, ping_role, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      e.id, e.guild, e.channel, e.club ?? null, e.kind, e.title, e.opponent ?? null, e.start, e.duration, e.tz, e.players, e.notes ?? '', e.role ?? null, e.by, Date.now()),
    setEventMessage: (idv, channel, message) => x.run('UPDATE events SET channel_id=?, message_id=? WHERE id=?', channel, message, idv),
    getEvent: (idv) => x.first('SELECT * FROM events WHERE id=?', idv),
    upcoming: (g, n = 5) => x.all('SELECT * FROM events WHERE guild_id=? AND start + duration * 60000 > ? ORDER BY start LIMIT ?', g, Date.now(), n),
    dueReminders: () => x.all('SELECT * FROM events WHERE reminded=0 AND start > ? AND start <= ? LIMIT 10', Date.now(), Date.now() + 3600_000),
    markReminded: (idv) => x.run('UPDATE events SET reminded=1 WHERE id=?', idv),
    cancelEvent: async (idv) => { await x.run('DELETE FROM rsvps WHERE event_id=?', idv); return x.run('DELETE FROM events WHERE id=?', idv); },
    async countsFor(g) { const m = new Map(); for (const r of await x.all('SELECT event_id, status, COUNT(*) n FROM rsvps WHERE event_id IN (SELECT id FROM events WHERE guild_id=?) GROUP BY event_id, status', g)) m.set(`${r.event_id}|${r.status}`, r.n); return m; },
    async hasBlob(key) { return !!(await x.first('SELECT 1 a FROM blobs WHERE key=?', key)); },
    rsvps: (idv) => x.all('SELECT * FROM rsvps WHERE event_id=? ORDER BY at', idv),
    answer: (idv, user, name, status) => x.run(`INSERT INTO rsvps (event_id, user_id, name, status, at) VALUES (?,?,?,?,?)
      ON CONFLICT (event_id, user_id) DO UPDATE SET status=excluded.status, name=excluded.name, at=excluded.at`, idv, id(user), name, status, Date.now()),
    setPos: (idv, user, name, pos) => x.run(`INSERT INTO rsvps (event_id, user_id, name, status, pos, at) VALUES (?,?,?,'yes',?,?)
      ON CONFLICT (event_id, user_id) DO UPDATE SET pos=excluded.pos, name=excluded.name`, idv, id(user), name, pos, Date.now()),
    checkIn: (idv, user, name) => x.run(`INSERT INTO rsvps (event_id, user_id, name, status, checked_in, at) VALUES (?,?,?,'yes',1,?)
      ON CONFLICT (event_id, user_id) DO UPDATE SET status='yes', checked_in=1, name=excluded.name`, idv, id(user), name, Date.now()),
    getTz: async (user) => (await x.first('SELECT tz FROM user_tz WHERE user_id=?', id(user)))?.tz ?? null,
    setTz: (user, tz) => x.run('INSERT INTO user_tz (user_id, tz) VALUES (?,?) ON CONFLICT (user_id) DO UPDATE SET tz=excluded.tz', id(user), tz),
    // pending relay requests (a Discord reply waiting on a GitHub Actions job)
    addPending: (p) => x.run('INSERT INTO pending (ref, token, guild_id, channel_id, user_id, kind, game, opponents, created_at) VALUES (?,?,?,?,?,?,?,?,?)', p.ref, p.token, p.guild, p.channel, p.user, p.kind, p.game ?? 1, p.opponents ? 1 : 0, Date.now()),
    setPendingMatch: (ref, clubId, matchId, added = 0) => x.run('UPDATE pending SET club_id=?, match_id=?, game=? WHERE ref=?', id(clubId), id(matchId), added, ref),
    getPending: (ref) => x.first('SELECT * FROM pending WHERE ref=?', ref),
    delPending: (ref) => x.run('DELETE FROM pending WHERE ref=?', ref),
    prunePending: () => x.run('DELETE FROM pending WHERE created_at < ?', Date.now() - 20 * 60_000),
  };
}

export const sqliteExecutor = (db) => ({
  all: async (sql, ...p) => db.prepare(sql).all(...p),
  first: async (sql, ...p) => db.prepare(sql).get(...p) ?? null,
  run: async (sql, ...p) => db.prepare(sql).run(...p).changes,
});
export const d1Executor = (d1) => ({
  all: async (sql, ...p) => (await d1.prepare(sql).bind(...p).all()).results ?? [],
  first: async (sql, ...p) => (await d1.prepare(sql).bind(...p).first()) ?? null,
  run: async (sql, ...p) => (await d1.prepare(sql).bind(...p).run()).meta?.changes ?? 0,
});
