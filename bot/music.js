// DJ bridge (PF-022 step 5): the Phoenix DJ app runs on the owner's PC behind NAT, so it cannot be called. It PUSHES room snapshots to this
// Worker and POLLS a command queue, both over the shared key (X-Phoenix-Key, bot/sharedkey.js). The site reads the snapshot and queues commands.
//   keyed (the DJ app, key = secret MUSIC_SHARED_KEY):
//     POST /api/music/bridge/push      { rooms:[room] }            replace the snapshot
//     GET  /api/music/bridge/commands                              claim queued commands (at most once each) → { commands:[{ id, room, type, arg, by }] }
//     POST /api/music/bridge/ack       { done:[{ id, ok, error?, result? }] }
//   site (flag `music`, same shapes as the page's own model, next/static/musicmodel.js):
//     GET  /api/music/rooms            → [room] ([] = never pushed, 503 = the DJ went quiet for 90 s; the page keeps its SAMPLE rooms / last state)
//     POST /api/music/rooms/:id/<pause|resume|skip|volume|add|remove>  { v } | { track } | { id }  → { ok, command }
//     GET  /api/music/search?q=        → [track]                   (queued as a command, the DJ answers on its next poll)
//     GET  /api/music/status           managers: online, last push, queue depth, recent commands (Control Center)
// Commands are at-most-once (a skip must never run twice): claimed rows are never handed out again, unanswered ones expire after 60 s.
import { can, flagOn } from './roles.js';
import { sharedKey } from './sharedkey.js';

export const STALE_MS = 90_000, EXPIRE_QUEUED_MS = 120_000, EXPIRE_SENT_MS = 60_000, KEEP_MS = 3_600_000;
export const COMMANDS = ['pause', 'resume', 'skip', 'volume', 'add', 'remove'];
const MAX_BODY = 200_000, MAX_ROOMS = 12, MAX_QUEUE = 50, MAX_QUEUED_PER_ROOM = 20;

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
const fail = (msg, status = 400) => json({ error: msg }, status);
const all = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).all().then((r) => r.results);
const one = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).first();
const run = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).run();
const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const txt = (s, n) => String(s ?? '').slice(0, n);
const num = (n, max) => Math.min(max, Math.max(0, Math.floor(+n) || 0));
const url = (u) => (/^https:\/\//i.test(String(u ?? '')) ? String(u).slice(0, 400) : '');

// constant-time compare, so the key cannot be guessed byte by byte
export const keyOk = (request, env) => {
  const want = env.MUSIC_SHARED_KEY, got = sharedKey(request);
  if (!want || !got || want.length !== got.length) return false;
  let d = 0; for (let i = 0; i < want.length; i++) d |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return d === 0;
};

const cleanTrack = (q) => ({ id: txt(q?.id, 300), title: txt(q?.title, 140), artist: txt(q?.artist, 80), thumb: url(q?.thumb), duration: num(q?.duration, 36000), by: { id: txt(q?.by?.id, 25), name: txt(q?.by?.name, 40) } });
// pure: whatever the PC sends becomes the exact shape the page's model expects, so a bad row can never break the page
export const cleanRooms = (list) => (Array.isArray(list) ? list : []).filter((r) => r && r.id != null).slice(0, MAX_ROOMS).map((r) => ({
  id: txt(r.id, 40), name: txt(r.name || 'Music room', 60), paused: !!r.paused, listeners: num(r.listeners, 9999), volume: r.volume == null ? 60 : num(r.volume, 100),
  nowPlaying: r.nowPlaying?.title ? { ...cleanTrack(r.nowPlaying), startedAt: num(r.nowPlaying.startedAt, 4e9), position: num(r.nowPlaying.position, 36000) } : null,
  queue: (Array.isArray(r.queue) ? r.queue : []).filter((q) => q?.title).slice(0, MAX_QUEUE).map(cleanTrack),
}));

async function housekeeping(env, now) {
  await run(env, "UPDATE music_commands SET status = 'expired', done_at = ? WHERE status = 'queued' AND created_at < ?", now, now - EXPIRE_QUEUED_MS);
  await run(env, "UPDATE music_commands SET status = 'expired', done_at = ? WHERE status = 'sent' AND sent_at < ?", now, now - EXPIRE_SENT_MS);
  await run(env, 'DELETE FROM music_commands WHERE created_at < ?', now - KEEP_MS);
}
const snapshot = async (env) => { const r = await one(env, 'SELECT rooms, pushed_at FROM music_snapshot WHERE id = 1'); return r ? { rooms: parse(r.rooms, []), at: r.pushed_at } : { rooms: [], at: 0 }; };

// ---------- the DJ app (keyed) ----------
export async function musicBridgeRoute(request, env, now = Date.now()) {
  const p = new URL(request.url).pathname;
  if (!p.startsWith('/api/music/bridge/')) return null;
  if (!env.MUSIC_SHARED_KEY) return fail('The DJ bridge is not set up yet.', 503);
  if (!keyOk(request, env)) return fail('Forbidden', 403);
  const method = request.method;
  if (p === '/api/music/bridge/push' && method === 'POST') {
    const raw = await request.text(); if (raw.length > MAX_BODY) return fail('Too big.', 413);
    const rooms = cleanRooms(parse(raw, {}).rooms);
    await run(env, 'INSERT INTO music_snapshot (id, rooms, pushed_at) VALUES (1, ?, ?) ON CONFLICT (id) DO UPDATE SET rooms = excluded.rooms, pushed_at = excluded.pushed_at', JSON.stringify(rooms), now);
    return json({ ok: true, rooms: rooms.length });
  }
  if (p === '/api/music/bridge/commands' && method === 'GET') {
    await housekeeping(env, now);
    const rows = await all(env, "SELECT id, room_id, type, arg, by_id, by_name FROM music_commands WHERE status = 'queued' ORDER BY id LIMIT 20");
    if (rows.length) await env.DB.batch(rows.map((r) => env.DB.prepare("UPDATE music_commands SET status = 'sent', sent_at = ? WHERE id = ? AND status = 'queued'").bind(now, r.id)));
    return json({ commands: rows.map((r) => ({ id: r.id, room: r.room_id, type: r.type, arg: parse(r.arg, {}), by: { id: r.by_id, name: r.by_name } })) });
  }
  if (p === '/api/music/bridge/ack' && method === 'POST') {
    const list = (await request.json().catch(() => ({}))).done;
    const done = (Array.isArray(list) ? list : []).filter((d) => Number.isInteger(d?.id)).slice(0, 50);
    if (done.length) await env.DB.batch(done.map((d) => env.DB.prepare("UPDATE music_commands SET status = ?, result = ?, done_at = ? WHERE id = ? AND status = 'sent'")
      .bind(d.ok ? 'done' : 'failed', JSON.stringify(d.ok ? (Array.isArray(d.result) ? d.result.slice(0, 12).map(cleanTrack) : null) : { error: txt(d.error || 'The DJ could not do that.', 200) }), now, d.id)));
    return json({ ok: true, saved: done.length });
  }
  return fail('Not found', 404);
}

// ---------- the site (members) ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enqueue = async (env, room, type, arg, me, now) => {
  const r = await run(env, 'INSERT INTO music_commands (room_id, type, arg, by_id, by_name, created_at) VALUES (?, ?, ?, ?, ?, ?)', room, type, JSON.stringify(arg), txt(me.u, 25), txt(me.n, 40), now);
  return r.meta.last_row_id;
};

export async function musicRoute(p, method, body, me, env, query = new URLSearchParams(), now = Date.now()) {
  if (p !== '/api/music/rooms' && !p.startsWith('/api/music/rooms/') && p !== '/api/music/search' && p !== '/api/music/status') return null;
  if (!env.DB) return fail('Not available.', 503);
  if (p === '/api/music/status') {
    if (!can(me, 'music.manage')) return fail('Managers only.', 403);
    const [snap, queued, recent] = await Promise.all([snapshot(env), one(env, "SELECT COUNT(*) AS n FROM music_commands WHERE status = 'queued'"),
      all(env, 'SELECT id, room_id, type, by_name, status, created_at FROM music_commands ORDER BY id DESC LIMIT 20')]);
    return json({ online: snap.at > 0 && now - snap.at < STALE_MS, lastPush: snap.at, rooms: snap.rooms.length, queued: queued?.n ?? 0, recent });
  }
  if (!flagOn(env, me, 'music')) return fail('Not available yet.', 404);
  if (!can(me, 'music.view')) return fail('Members only.', 403);
  if (p === '/api/music/rooms') {
    if (method !== 'GET') return fail('Not found', 404);
    const s = await snapshot(env);
    if (!s.at) return json([]);
    if (now - s.at >= STALE_MS) return fail('The music bot is offline.', 503);
    return json(s.rooms);
  }
  if (p === '/api/music/search') {
    if (method !== 'GET') return fail('Not found', 404);
    const q = txt(query.get('q') ?? '', 100).trim();
    if (q.length < 2) return json([]);
    if (!can(me, 'music.control')) return fail('Not allowed.', 403);
    const s = await snapshot(env); if (!s.at || now - s.at >= STALE_MS) return fail('The music bot is offline.', 503);
    const id = await enqueue(env, '', 'search', { q }, me, now), until = Date.now() + (Number(env.MUSIC_SEARCH_WAIT_MS) || 8000);
    while (Date.now() < until) {
      const r = await one(env, 'SELECT status, result FROM music_commands WHERE id = ?', id);
      if (r?.status === 'done') return json(parse(r.result, []) || []);
      if (r?.status === 'failed') return fail(parse(r.result, {}).error || 'Search failed.', 502);
      await sleep(Number(env.MUSIC_POLL_MS) || 400);
    }
    return fail('The music bot did not answer in time.', 504);
  }
  const m = p.match(/^\/api\/music\/rooms\/([^/]+)\/([a-z]+)$/);
  if (!m || method !== 'POST' || !COMMANDS.includes(m[2])) return fail('Not found', 404);
  if (!can(me, 'music.control')) return fail('Not allowed.', 403);
  const room = decodeURIComponent(m[1]), type = m[2];
  const s = await snapshot(env); if (!s.at || now - s.at >= STALE_MS) return fail('The music bot is offline.', 503);
  if (!s.rooms.some((r) => r.id === room)) return fail('No such room.', 404);
  let arg = {};
  if (type === 'volume') { if (!Number.isFinite(+body?.v)) return fail('Bad volume.'); arg = { v: num(body.v, 100) }; }
  else if (type === 'add') { const tr = cleanTrack(body?.track); if (!tr.id) return fail('Unknown song.'); arg = { track: tr }; }
  else if (type === 'remove') { if (!body?.id) return fail('Bad track.'); arg = { id: txt(body.id, 60) }; }
  const q = await one(env, "SELECT COUNT(*) AS n FROM music_commands WHERE room_id = ? AND status IN ('queued', 'sent')", room);
  if ((q?.n ?? 0) >= MAX_QUEUED_PER_ROOM) return fail('Too many requests for this room, try again in a moment.', 429);
  return json({ ok: true, command: await enqueue(env, room, type, arg, me, now) });
}
