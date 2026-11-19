// PF-023: Rush queue and LFG as one matchmaking system (PLANNING/SIDE-ROADMAP-eager-yawning-lovelace.md section 5b).
//   positions   RUSH_POSITIONS: goalkeeper, striker, centre back, winger. A player may also be open to ANY.
//   matching    matchLfg(need, players): who fits a lobby's open spot (exact position, open-to-any, or a different position as "alt").
//   offers      one row per proposal in rush_need_offers; both sides must say yes (answerOffer), the lobby on the Rush app DM, the player on theirs.
//   output      every message here is a Phoenix Components V2 panel (bot/ui.js); the DMs come from the Rush app token, never the core app.
// Pure logic first (tested directly), then the D1 helpers. Nothing here names a channel or a role: needs are posted by bot/rushqueue.js
// to the Organization config channels; the DMs go to people, not channels.
import { message, header, text, facts, footer, sep, buttons } from './ui.js';
import { discord } from './servertools.js';

export const RUSH_POSITIONS = { GK: 'Goalkeeper', ST: 'Striker', CB: 'Centre back', W: 'Winger' };
export const ANY = 'ANY';
export const posLabel = (p) => (p === ANY ? 'Any position' : RUSH_POSITIONS[p] ?? String(p));
// 1 or 2 real positions, or ["ANY"]. Anything else is dropped; an empty answer means "any".
export function cleanPositions(list, max = 2) {
  const arr = (Array.isArray(list) ? list : typeof list === 'string' ? safeJson(list) : []).map((x) => String(x).toUpperCase().trim());
  if (arr.includes(ANY)) return [ANY];
  const out = [...new Set(arr.filter((x) => RUSH_POSITIONS[x]))].slice(0, max);
  return out.length ? out : [ANY];
}
function safeJson(s) { try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; } }
export const OFFER_TTL_MIN = 15;

// need = { positions: [] (empty = any) }, players = [{ user_id, positions }]. Exact fits first, then open-to-any, then alternates (kind 'alt':
// the player is asked to try a different position; they accept or decline it themselves). `already` = user ids not to propose again.
export function matchLfg(need, players, already = []) {
  const wanted = (need.positions ?? []).filter((p) => RUSH_POSITIONS[p]);
  const open = wanted.length ? wanted : Object.keys(RUSH_POSITIONS);
  const skip = new Set(already.map(String));
  const out = [];
  for (const p of players) {
    if (skip.has(String(p.user_id))) continue;
    const mine = cleanPositions(p.positions);
    const hit = mine.includes(ANY) ? null : open.find((x) => mine.includes(x));
    if (hit) out.push({ user_id: String(p.user_id), position: hit, kind: 'exact' });
    else if (mine.includes(ANY)) out.push({ user_id: String(p.user_id), position: open[0], kind: 'any' });
    else out.push({ user_id: String(p.user_id), position: open[0], kind: 'alt' });
  }
  const rank = { exact: 0, any: 1, alt: 2 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind]);
}

// Both sides must say yes. side = 'lobby' | 'player'. Returns the new offer and `done`: 'accepted' (both yes), 'declined' (either no) or null.
export function answerOffer(offer, side, yes) {
  if (offer.status !== 'open') return { offer, done: offer.status === 'accepted' ? 'accepted' : 'declined', stale: true };
  if (!yes) return { offer: { ...offer, status: 'declined' }, done: 'declined' };
  const next = { ...offer, lobby_ok: side === 'lobby' ? 1 : offer.lobby_ok, player_ok: side === 'player' ? 1 : offer.player_ok };
  return next.lobby_ok && next.player_ok ? { offer: { ...next, status: 'accepted' }, done: 'accepted' } : { offer: next, done: null };
}

// The slim "Find a player" section under the groups on the queue board. needs = [{ captain, positions, count, members (lobby size) }].
// Only lobbies that opened it show; it stays through every refresh until filled or expired. Capped at 5 with "+N more".
export function findPlayerLines(needs, { cap = 5 } = {}) {
  if (!needs.length) return [];
  const lines = ['**FIND A PLAYER**'];
  for (const n of needs.slice(0, cap)) {
    const pos = n.positions?.length ? n.positions.map(posLabel).join(' / ') : 'any position';
    lines.push(`🙋 <@${n.captain}>'s lobby needs ${n.count > 1 ? `${n.count} players` : '1 player'} · ${pos} · ${n.size} in the lobby`);
  }
  if (needs.length > cap) lines.push(`+${needs.length - cap} more`);
  return lines;
}

// ---------- the two DMs ----------
const note = (offer) => (offer.kind === 'alt' ? 'This is **not** your usual position: you can say no.' : offer.kind === 'any' ? 'You said you are open to any position.' : 'It matches the position you picked.');
export function lobbyOfferMessage(offer, { org = 'Phoenix Fire', playerName = 'A player' } = {}) {
  return message({
    accent: 'red', mentions: { parse: [] },
    blocks: [
      header({ eyebrow: `${org} · Rush`, title: '🙋 A player fits your open spot', sub: `${playerName} · ${posLabel(offer.position)}` }),
      sep(), text(`<@${offer.user_id}> is available for Rush and could play **${posLabel(offer.position)}**. ${note(offer)}`),
      footer('Accept and they are asked too. When both say yes they join your crew.'),
      buttons([{ label: 'Accept', emoji: '✅', id: `pf:rq:offer:y:${offer.id}`, style: 'ok' }, { label: 'No thanks', emoji: '✖️', id: `pf:rq:offer:n:${offer.id}` }]),
    ],
  });
}
export function playerOfferMessage(offer, { org = 'Phoenix Fire', captain = '' } = {}) {
  return message({
    accent: 'red', mentions: { parse: [] },
    blocks: [
      header({ eyebrow: `${org} · Rush`, title: '⚡ A lobby wants you', sub: posLabel(offer.position) }),
      sep(), text(`<@${captain}>'s lobby needs a **${posLabel(offer.position)}**. ${note(offer)}`),
      footer('Say yes and you are added to their crew. They can then join the queue as a group.'),
      buttons([{ label: 'I’m in', emoji: '✅', id: `pf:lfg:acc:${offer.id}`, style: 'ok' }, { label: 'No thanks', emoji: '✖️', id: `pf:lfg:dec:${offer.id}` }]),
    ],
  });
}

// ---------- D1 ----------
const rows = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).all().then((r) => r.results);
const one = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).first();
const MIN = 60e3;

export async function saveNeed(env, { captain, positions = [], count = 1, now, expires, channel = null }) {
  await env.DB.prepare("UPDATE rush_needs SET status = 'cancelled' WHERE captain_id = ? AND status = 'open'").bind(String(captain)).run();
  const r = await env.DB.prepare('INSERT INTO rush_needs (captain_id, positions, count, status, created_at, expires, channel) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(String(captain), JSON.stringify(positions), count, 'open', now, expires, channel).run();
  return { id: r.meta?.last_row_id ?? r.lastRowId, captain: String(captain), positions, count, expires };
}
export const openNeeds = (env, now) => rows(env, "SELECT * FROM rush_needs WHERE status = 'open' AND expires > ? ORDER BY created_at", now)
  .then((l) => l.map((n) => ({ ...n, positions: safeJson(n.positions) })));
export async function closeNeeds(env, captain, status = 'cancelled') { await env.DB.prepare("UPDATE rush_needs SET status = ? WHERE captain_id = ? AND status = 'open'").bind(status, String(captain)).run(); }
export async function expireNeeds(env, now) {
  const r = await env.DB.prepare("UPDATE rush_needs SET status = 'expired' WHERE status = 'open' AND expires <= ?").bind(now).run();
  await env.DB.prepare("UPDATE rush_need_offers SET status = 'expired' WHERE status = 'open' AND created_at <= ?").bind(now - OFFER_TTL_MIN * MIN).run();
  return r.meta?.changes ?? r.changes ?? 0;
}

// Available LFG players who are not in a queue group (the caller passes the user ids that are) and not already offered this need.
export async function availablePlayers(env, now, busy = []) {
  const posted = await rows(env, "SELECT user_id, name, positions FROM rush_lfg WHERE status = 'open' AND expires > ? ORDER BY at", now);
  // "Alert me" subscribers count as available too (a DM offer they can accept or decline), unless they already have a call up.
  const alerts = await rows(env, 'SELECT a.user_id, u.name, a.positions FROM rush_lfg_alerts a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.at').catch(() => []);
  const list = [...posted, ...alerts.filter((a) => !posted.some((p) => String(p.user_id) === String(a.user_id)))];
  const skip = new Set(busy.map(String));
  return list.filter((p) => !skip.has(String(p.user_id))).map((p) => ({ ...p, positions: cleanPositions(p.positions) }));
}

// Match one need against the people available, write one offer per proposal (at most `limit`), return the new offers with the player name.
export async function createOffers(env, need, now, { busy = [], limit = 3 } = {}) {
  const have = await rows(env, 'SELECT user_id FROM rush_need_offers WHERE need_id = ?', need.id);
  const players = await availablePlayers(env, now, [...busy, need.captain]);
  const picks = matchLfg(need, players, have.map((h) => h.user_id)).slice(0, limit);
  const out = [];
  for (const p of picks) {
    const r = await env.DB.prepare('INSERT INTO rush_need_offers (need_id, user_id, position, kind, created_at) VALUES (?, ?, ?, ?, ?)').bind(need.id, p.user_id, p.position, p.kind, now).run();
    out.push({ id: r.meta?.last_row_id ?? r.lastRowId, need_id: need.id, user_id: p.user_id, position: p.position, kind: p.kind, lobby_ok: 0, player_ok: 0, status: 'open', name: players.find((x) => String(x.user_id) === p.user_id)?.name ?? 'A player' });
  }
  return out;
}
export const getOffer = (env, id) => one(env, 'SELECT * FROM rush_need_offers WHERE id = ?', Number(id));
export async function saveOffer(env, o) {
  await env.DB.prepare('UPDATE rush_need_offers SET lobby_ok = ?, player_ok = ?, status = ? WHERE id = ?').bind(o.lobby_ok, o.player_ok, o.status, o.id).run();
}

// DM one side from the Rush app token (interactive buttons only work on messages that app posted). A closed DM (50007) returns false.
export async function dm(env, userId, msg) {
  try {
    const ch = await discord(env, 'POST', '/users/@me/channels', { recipient_id: String(userId) });
    if (!ch?.id) return false;
    const m = await discord(env, 'POST', `/channels/${ch.id}/messages`, msg);
    return !!m?.id;
  } catch { return false; }
}
// Send both DMs for new offers. Returns the ids whose lobby DM or player DM could not be delivered.
export async function sendOffers(rushEnvObj, offers, need, { org = 'Phoenix Fire' } = {}) {
  const failed = [];
  for (const o of offers) {
    const a = await dm(rushEnvObj, need.captain, lobbyOfferMessage(o, { org, playerName: o.name }));
    const b = await dm(rushEnvObj, o.user_id, playerOfferMessage(o, { org, captain: need.captain }));
    if (!a || !b) failed.push(o.id);
  }
  return failed;
}
