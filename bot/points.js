// The shared points economy (roadmap P11.3, extended by PF-024 Item 24). ONE ledger for the bot and the site: `users.points` (earned this season),
// `users.points_spent` (credit used this season) and `points_log` (every earn and every spend). Other modules call awardPoints() / awardRule() when
// something point-worthy happens (this file only depends on roles and notify, never on them, so there is no import cycle).
//
// Owner decisions (2026-11-18): points RESET each season (the totals are archived in points_seasons), points are SPENDABLE CREDIT (a `spend` entry, the
// balance never goes below 0, every spend is in the ledger and in config_audit), a WEEKLY balance DM (notification type `points`, owner-controlled in the
// DM matrix), the RULES are editable in the Control Center (area `points`, cc_config row `points`), and there are NO daily caps.
//   GET  /api/points                       members: season, earned, spent, balance, rank, breakdown, recent ledger, the price list
//   GET  /api/points/leaderboard           members: top 20 by points earned this season
//   POST /api/points/redeem                members (flag pointsEconomy): { item } spends the price of an item from the price list
//   GET  /api/points/admin                 managers: rules, season, recent spends, closed seasons
//   POST /api/points/admin/spend           managers: { user, amount, item, note } record a spend for a member
//   POST /api/points/admin/reset-season    owner: { label, confirm: 'RESET' } archive this season and start a new one
//   POST /api/points/match                 keyed (X-Phoenix-Key): match performance rows from GitHub Actions (scripts/lib/pointspush.mjs), once per member per match
// New parts sit behind the flag `pointsEconomy` (owner first); `points` (members) keeps the old view working as before.
import { can, flagOn } from './roles.js';
import { notify, notifyManagers } from './notify.js';
import { sharedKey } from './sharedkey.js';

export const CATEGORIES = ['match', 'attendance', 'community', 'behaviour', 'badges', 'games'];
export const CATEGORY_INFO = {
  match: ['🎮', 'Match performance'], attendance: ['🗓️', 'Attendance'], community: ['💬', 'Community'], behaviour: ['🤝', 'Behaviour'], badges: ['🎖️', 'Badges'], games: ['🕹️', 'Games'],
};
// Every amount a rule can pay. A manager edits these in the Control Center; 0 switches a rule off. [default, what it pays for]. No daily caps.
export const RULE_DEFAULTS = {
  'attendance.checkin': [5, 'Checking in to a match night'],
  'community.rating': [2, 'Rating a player (first rating of the week)'],
  'community.motm_vote': [2, 'Voting for man of the match (first vote)'],
  'behaviour.clean_streak': [3, 'A clean week with no strikes'],
  'match.played': [1, 'Playing a match'],
  'match.goal': [2, 'Each goal'],
  'match.assist': [1, 'Each assist'],
  'match.motm': [5, 'Man of the match'],
  'match.win': [3, 'A win'],
  'badges.achievement': [3, 'Each achievement unlocked'],
  'games.played': [1, 'Playing an arcade game (Item 23)'],
  'games.won': [3, 'Winning an arcade game (Item 23)'],
};
export const RULE_MAX = 1000, PRICE_MAX = 20;

const DAY = 86400e3, WEEK = 7 * DAY, HOUR = 3600e3;
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
const fail = (msg, status = 400) => json({ error: msg }, status);
const all = (env, sql, ...args) => env.DB.prepare(sql).bind(...args).all().then((r) => r.results);
const one = (env, sql, ...args) => env.DB.prepare(sql).bind(...args).first();
const run = (env, sql, ...args) => env.DB.prepare(sql).bind(...args).run();
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const int = (v) => (Number.isFinite(Number(v)) && String(v ?? '').trim() !== '' ? Math.floor(Number(v)) : NaN);

// ---------- rules (cc_config row `points`: { amounts, prices }) ----------
export const defaultRules = () => ({ amounts: Object.fromEntries(Object.entries(RULE_DEFAULTS).map(([k, [n]]) => [k, n])), prices: [] });
/** validate a rules object from the Control Center → { rules } or { error }. Unknown keys are dropped; the price list may be empty (the owner has not set prices yet). */
export function cleanRules(b, cur = defaultRules()) {
  const amounts = { ...cur.amounts };
  for (const [k, v] of Object.entries(b?.amounts ?? {})) {
    if (!(k in RULE_DEFAULTS)) continue;
    const n = int(v);
    if (!Number.isInteger(n) || n < 0 || n > RULE_MAX) return { error: `“${RULE_DEFAULTS[k][1]}” must be a whole number from 0 (off) to ${RULE_MAX}.` };
    amounts[k] = n;
  }
  let prices = cur.prices;
  if (b?.prices !== undefined) {
    if (!Array.isArray(b.prices) || b.prices.length > PRICE_MAX) return { error: `The price list holds up to ${PRICE_MAX} items.` };
    prices = []; const seen = new Set();
    for (const p of b.prices) {
      const name = clean(p?.name, 40), cost = int(p?.cost);
      if (!name) return { error: 'Every price needs a name.' };
      if (!Number.isInteger(cost) || cost < 1 || cost > 100000) return { error: `“${name}” needs a price from 1 to 100000 points.` };
      const id = clean(p?.id || name, 30).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `item-${prices.length + 1}`;
      if (seen.has(id)) return { error: `“${name}” is listed twice.` };
      seen.add(id); prices.push({ id, name, cost, note: clean(p?.note, 120) });
    }
  }
  return { rules: { amounts, prices } };
}
export async function loadRules(env) {
  const row = env?.DB ? await one(env, "SELECT value FROM cc_config WHERE key = 'points'").catch(() => null) : null;
  let stored = null; try { stored = row ? JSON.parse(row.value) : null; } catch { /* defaults */ }
  return cleanRules(stored ?? {}).rules ?? defaultRules();
}
export async function saveRules(env, rules, me) {
  await run(env, `INSERT INTO cc_config (key, value, updated_at, updated_by) VALUES ('points', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    JSON.stringify(rules), Date.now(), String(me?.u ?? ''));
}

// ---------- season ----------
export const seasonOf = async (env) => (await one(env, "SELECT value FROM meta WHERE key = 'points_season'").catch(() => null))?.value || 'S1';
const nextLabel = (s) => { const m = /^(.*?)(\d+)$/.exec(s); return m ? `${m[1]}${Number(m[2]) + 1}` : `${s} 2`; };

// ---------- earning ----------
// Never lets a points failure break the action that earned them – callers fire-and-forget or await, either is fine. `ref` (optional) makes the award once-only
// per member (a match, an achievement): a second call with the same ref pays nothing. Falls back to the old columns until the owner applies migration 0077.
export async function awardPoints(env, userId, category, delta, reason, ref = null) {
  if (!env.DB || !userId || !delta) return 0;
  if (!CATEGORIES.includes(category)) throw new Error(`Unknown point category: ${category}`);
  try {
    const season = await seasonOf(env), at = Date.now();
    if (ref) {
      const r = await run(env, 'INSERT OR IGNORE INTO points_log (user_id, category, delta, reason, at, season, ref) VALUES (?, ?, ?, ?, ?, ?, ?)', userId, category, delta, reason, at, season, ref);
      if (!r.meta?.changes) return 0;
      await run(env, 'UPDATE users SET points = points + ? WHERE id = ?', delta, userId);
      return delta;
    }
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET points = points + ? WHERE id = ?').bind(delta, userId),
      env.DB.prepare('INSERT INTO points_log (user_id, category, delta, reason, at, season) VALUES (?, ?, ?, ?, ?, ?)').bind(userId, category, delta, reason, at, season),
    ]);
    return delta;
  } catch (e) {
    if (/no such column|no column named/i.test(e.message) && !ref) { // migration 0077 not applied yet: the P11.3 ledger still works
      try {
        await env.DB.batch([env.DB.prepare('UPDATE users SET points = points + ? WHERE id = ?').bind(delta, userId),
          env.DB.prepare('INSERT INTO points_log (user_id, category, delta, reason, at) VALUES (?, ?, ?, ?, ?)').bind(userId, category, delta, reason, Date.now())]);
        return delta;
      } catch (e2) { console.log('awardPoints failed', e2.message); return 0; }
    }
    console.log('awardPoints failed', e.message);
    return 0;
  }
}
/** pay a rule ("match.goal") times `times`, with the amount the managers set; 0 = the rule is switched off. The category is the part before the dot. */
export async function awardRule(env, userId, key, reason, { times = 1, ref = null } = {}) {
  if (!RULE_DEFAULTS[key] || !times) return 0;
  const amount = (await loadRules(env)).amounts[key] ?? RULE_DEFAULTS[key][0];
  return amount ? awardPoints(env, userId, key.split('.')[0], amount * times, reason, ref) : 0;
}

/** the points a member earns for one match from the rules: one ledger row per member per match. row = { played, goals, assists, mom, win } */
export function matchAward(rules, row) {
  const a = rules.amounts, parts = [];
  const add = (n, text) => { if (n) parts.push([n, text]); };
  if (row.played !== false) add(a['match.played'], 'played');
  if (row.goals > 0) add(a['match.goal'] * row.goals, `${row.goals} goal${row.goals === 1 ? '' : 's'}`);
  if (row.assists > 0) add(a['match.assist'] * row.assists, `${row.assists} assist${row.assists === 1 ? '' : 's'}`);
  if (row.mom) add(a['match.motm'], 'man of the match');
  if (row.win) add(a['match.win'], 'win');
  return { delta: parts.reduce((s, [n]) => s + n, 0), parts: parts.map(([, t]) => t) };
}

// ---------- spending ----------
// The balance never goes below 0: the UPDATE only applies while points - points_spent >= amount, and the ledger row is only written when it did (one batch).
export async function spendPoints(env, userId, amount, item, { by = null, note = '' } = {}) {
  const n = int(amount);
  if (!Number.isInteger(n) || n < 1 || n > 1e6) return { error: 'Spend a whole number of points, 1 or more.', status: 400 };
  if (!env.DB) return { error: 'The database is not connected.', status: 503 };
  const u = await one(env, 'SELECT id, name, points, points_spent FROM users WHERE id = ?', userId).catch(() => null);
  if (!u) return { error: 'Member not found.', status: 404 };
  const label = clean(item, 60) || 'Spend', reason = note ? `${label} · ${clean(note, 100)}` : label, season = await seasonOf(env), at = Date.now();
  const [upd] = await env.DB.batch([
    env.DB.prepare('UPDATE users SET points_spent = points_spent + ? WHERE id = ? AND points - points_spent >= ?').bind(n, userId, n),
    env.DB.prepare("INSERT INTO points_log (user_id, category, delta, reason, at, season) SELECT ?, 'spend', ?, ?, ?, ? WHERE changes() > 0").bind(userId, -n, reason, at, season),
  ]);
  if (!upd.meta?.changes) return { error: `Not enough points: the balance is ${Math.max(0, u.points - u.points_spent)}.`, status: 409, balance: Math.max(0, u.points - u.points_spent) };
  const balance = u.points - u.points_spent - n;
  await run(env, 'INSERT INTO config_audit (at, user_id, name, entity, entity_id, action, before, after) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    at, String(by?.u ?? userId), by?.n ?? u.name ?? '', 'points:spend', String(userId), 'spend', JSON.stringify({ balance: balance + n }), JSON.stringify({ balance, amount: n, item: label, season })).catch(() => {});
  return { ok: true, balance, spent: n };
}

// ---------- reading ----------
async function breakdown(env, uid, season) {
  const rows = await all(env, "SELECT category, SUM(delta) AS pts FROM points_log WHERE user_id = ? AND category != 'spend' AND (season = ? OR season IS NULL) GROUP BY category", uid, season)
    .catch(() => all(env, "SELECT category, SUM(delta) AS pts FROM points_log WHERE user_id = ? AND category != 'spend' GROUP BY category", uid));
  const by = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  for (const r of rows) by[r.category] = r.pts;
  return by;
}
export async function standing(env, uid) {
  const u = await one(env, 'SELECT points, points_spent FROM users WHERE id = ?', uid).catch(() => one(env, 'SELECT points, 0 AS points_spent FROM users WHERE id = ?', uid));
  const earned = u?.points ?? 0, spent = u?.points_spent ?? 0;
  const rank = 1 + ((await one(env, 'SELECT COUNT(*) AS n FROM users WHERE points > ?', earned))?.n ?? 0);
  const season = await seasonOf(env);
  return { season, earned, spent, balance: Math.max(0, earned - spent), rank, by: await breakdown(env, uid, season) };
}
async function leaderboard(env) {
  const rows = await all(env, 'SELECT id, name, avatar, points FROM users WHERE points > 0 ORDER BY points DESC LIMIT 20');
  return rows.map((r) => ({ id: r.id, n: r.name, a: r.avatar ?? undefined, pts: r.points }));
}

// ---------- season reset (owner) ----------
export async function resetSeason(env, me, label) {
  const cur = await seasonOf(env), next = clean(label, 20) || nextLabel(cur);
  if (next === cur) return { error: `The new season must have a different name from “${cur}”.`, status: 400 };
  const at = Date.now(), rows = await all(env, 'SELECT id, name, points, points_spent FROM users WHERE points > 0 OR points_spent > 0 ORDER BY points DESC, id');
  const stmts = rows.map((r, i) => env.DB.prepare('INSERT OR REPLACE INTO points_seasons (season, user_id, name, earned, spent, rank, closed_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(cur, r.id, r.name ?? '', r.points, r.points_spent, i + 1, at));
  stmts.push(env.DB.prepare('UPDATE points_log SET season = ? WHERE season IS NULL').bind(cur),
    env.DB.prepare('UPDATE users SET points = 0, points_spent = 0 WHERE points != 0 OR points_spent != 0'),
    env.DB.prepare("INSERT INTO meta (key, value) VALUES ('points_season', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").bind(next),
    env.DB.prepare('INSERT INTO config_audit (at, user_id, name, entity, entity_id, action, before, after) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(at, String(me?.u ?? ''), me?.n ?? '', 'points:season', null, 'reset', JSON.stringify({ season: cur, members: rows.length }), JSON.stringify({ season: next })));
  for (let i = 0; i < stmts.length; i += 80) await env.DB.batch(stmts.slice(i, i + 80)); // the three closing statements land in the last batch
  return { ok: true, closed: cur, season: next, members: rows.length };
}

// ---------- weekly balance DM ----------
// Once per week (Monday 09:00 UTC or the first run after), one DM per member with points: balance, what came in this week by category, rank. The DM kind is the
// notification type `points`: the owner switches it, narrows who gets it and sets the methods in the DM matrix (Control Center). Nothing is sent while pointsEconomy is off.
const MON0 = Date.UTC(1970, 0, 5); // a Monday
export const weekKey = (now) => Math.floor((now - MON0) / WEEK);
export const weeklyDue = (now, last) => (now - MON0) % WEEK >= 9 * HOUR && weekKey(now) > (Number(last) || 0);
export function digestText(s, week) {
  const lines = [`**Balance: ${s.balance} points** · earned ${s.earned} this season · spent ${s.spent} · #${s.rank} on the leaderboard`];
  const got = CATEGORIES.filter((c) => week[c] > 0).map((c) => `${CATEGORY_INFO[c][0]} ${CATEGORY_INFO[c][1]} +${week[c]}`);
  lines.push(got.length ? `This week: ${got.join(' · ')}` : 'This week: nothing new yet. A check-in, a rating or a match night puts points on the board.');
  return lines.join('\n');
}
export async function weeklyDigest(env, now = Date.now()) {
  if (!env.DB || !flagOn(env, { role: 'member' }, 'pointsEconomy')) return { sent: 0 }; // owner-only testing never DMs members
  const last = (await one(env, "SELECT value FROM meta WHERE key = 'points_weekly'").catch(() => null))?.value;
  if (!weeklyDue(now, last)) return { sent: 0 };
  await run(env, "INSERT INTO meta (key, value) VALUES ('points_weekly', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", String(weekKey(now))); // first, so a slow run is never sent twice
  const season = await seasonOf(env);
  const users = await all(env, 'SELECT id, points, points_spent FROM users WHERE points > 0 OR points_spent > 0 ORDER BY points DESC, id LIMIT 400');
  const rows = await all(env, "SELECT user_id, category, SUM(delta) AS pts FROM points_log WHERE at > ? AND delta > 0 AND category != 'spend' GROUP BY user_id, category", now - WEEK);
  const weekOf = new Map();
  for (const r of rows) { if (!weekOf.has(r.user_id)) weekOf.set(r.user_id, {}); weekOf.get(r.user_id)[r.category] = r.pts; }
  let sent = 0;
  for (let i = 0; i < users.length; i++) {
    const u = users[i], balance = Math.max(0, u.points - u.points_spent), week = weekOf.get(u.id) ?? {};
    const gained = Object.values(week).reduce((s, n) => s + n, 0);
    if (!balance && !gained) continue;
    const s = { season, earned: u.points, spent: u.points_spent, balance, rank: 1 + users.filter((x) => x.points > u.points).length };
    sent += await notify(env, [u.id], { type: 'points', title: `Your points: ${balance} to spend${gained ? `, +${gained} this week` : ''}`, body: digestText(s, week), link: 'members.html#points' }).catch(() => 0);
  }
  return { sent };
}

// ---------- routes ----------
const keyOf = async (secret) => {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${secret}:phoenix-points`));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
};
export { keyOf as pointsKey };

/** POST /api/points/match, keyed: { matchId, win, players: [{ name, goals, assists, mom }] } for our players of one match. The key is derived from DISCORD_CLIENT_SECRET like /api/crawl. */
export async function pointsMatchRoute(request, env) {
  if (!env.DISCORD_CLIENT_SECRET || sharedKey(request) !== await keyOf(env.DISCORD_CLIENT_SECRET)) return fail('Forbidden', 403);
  if (request.method !== 'POST') return fail('Not found', 404);
  if (!flagOn(env, { role: 'member' }, 'pointsEconomy')) return json({ ok: true, skipped: 'pointsEconomy is not on for members yet', awarded: 0 });
  const b = await request.json().catch(() => ({}));
  const matchId = String(b.matchId ?? '');
  if (!/^\d{4,24}$/.test(matchId)) return fail('Bad matchId');
  const players = (Array.isArray(b.players) ? b.players : []).slice(0, 40).filter((p) => p && typeof p.name === 'string' && p.name);
  const claims = await all(env, "SELECT user_id, player, player_name FROM claims WHERE status = 'approved'");
  const byName = new Map();
  for (const c of claims) for (const k of [c.player, c.player_name]) if (k) byName.set(String(k).toLowerCase(), c.user_id);
  const rules = await loadRules(env);
  let awarded = 0, unmatched = 0, members = 0;
  for (const p of players) {
    const uid = byName.get(p.name.toLowerCase());
    if (!uid) { unmatched++; continue; }
    const a = matchAward(rules, { played: p.played !== false, goals: Math.max(0, Math.min(30, int(p.goals) || 0)), assists: Math.max(0, Math.min(30, int(p.assists) || 0)), mom: !!p.mom, win: !!b.win });
    if (!a.delta) continue;
    const n = await awardPoints(env, uid, 'match', a.delta, `Match ${matchId}: ${a.parts.join(', ')}`, `m:${matchId}`);
    if (n) { awarded += n; members++; }
  }
  return json({ ok: true, awarded, members, unmatched });
}

export async function pointsRoute(p, method, body, me, env) {
  if (!p.startsWith('/api/points')) return null;
  if (!flagOn(env, me, 'points')) return fail('Not available yet.', 404);
  const econ = flagOn(env, me, 'pointsEconomy');
  if (p.startsWith('/api/points/admin')) {
    if (!econ) return fail('Not available yet.', 404);
    if (!can(me, 'points.manage')) return fail('Managers only.', 403);
    if (p === '/api/points/admin' && method === 'GET') {
      const [spends, seasons] = await Promise.all([
        all(env, "SELECT l.user_id, u.name, l.delta, l.reason, l.at, l.season FROM points_log l LEFT JOIN users u ON u.id = l.user_id WHERE l.category = 'spend' ORDER BY l.id DESC LIMIT 50"),
        all(env, 'SELECT season, COUNT(*) AS members, SUM(earned) AS earned, SUM(spent) AS spent, MAX(closed_at) AS closed_at FROM points_seasons GROUP BY season ORDER BY closed_at DESC LIMIT 12'),
      ]);
      return json({ season: await seasonOf(env), rules: await loadRules(env), defaults: Object.fromEntries(Object.entries(RULE_DEFAULTS).map(([k, [n, t]]) => [k, { amount: n, label: t }])), spends, seasons });
    }
    if (p === '/api/points/admin/spend' && method === 'POST') {
      const r = await spendPoints(env, String(body?.user ?? ''), body?.amount, body?.item, { by: me, note: body?.note });
      if (r.error) return fail(r.error, r.status);
      await notify(env, [String(body.user)], { type: 'points', title: `${r.spent} points spent: ${clean(body?.item, 60) || 'Spend'}`, body: `Your balance is now ${r.balance} points.`, link: 'members.html#points' }).catch(() => {});
      return json(r);
    }
    if (p === '/api/points/admin/reset-season' && method === 'POST') {
      if (me.role !== 'owner') return fail('Owner only.', 403);
      if (body?.confirm !== 'RESET') return fail('Type RESET to confirm: every member starts the new season at 0.');
      const r = await resetSeason(env, me, body?.label);
      return r.error ? fail(r.error, r.status) : json(r);
    }
    return fail('Not found', 404);
  }
  if (!can(me, 'points.view')) return fail('Members only.', 403);
  if (p === '/api/points/redeem' && method === 'POST') {
    if (!econ) return fail('Not available yet.', 404);
    const price = (await loadRules(env)).prices.find((x) => x.id === String(body?.item ?? ''));
    if (!price) return fail('That item is not on the price list.', 404);
    const r = await spendPoints(env, me.u, price.cost, price.name, { by: me });
    if (r.error) return fail(r.error, r.status);
    await notifyManagers(env, { type: 'queue', title: `${me.n ?? 'A member'} spent ${price.cost} points on ${price.name}`, body: 'Recorded in the points ledger. Hand it over, then it is done.', link: 'staff-insights.html' }).catch(() => {});
    return json({ ...r, item: price.name });
  }
  if (method !== 'GET') return fail('Not found', 404);
  if (p === '/api/points/leaderboard') return json({ rows: await leaderboard(env) });
  if (p !== '/api/points') return null;
  const s = await standing(env, me.u);
  const recent = await all(env, 'SELECT category, delta, reason, at FROM points_log WHERE user_id = ? ORDER BY id DESC LIMIT 20', me.u);
  return json({ total: s.earned, season: s.season, spent: s.spent, balance: s.balance, rank: s.rank, by: s.by, recent, ...(econ ? { prices: (await loadRules(env)).prices } : {}) });
}
