// Stream overlay feed: the Worker side of the alert box, goal bars and clip reactions (next/stream/overlay/, LIBRARY/STREAM-OVERLAY.md).
//   POST /api/stream/twitch   Twitch EventSub webhook (follow, subscribe, resub, gifts, cheer, raid). Verified with HMAC; a retry is stored once.
//   POST /api/stream/event    anything else can push an event: header X-Phoenix-Key = STREAM_OVERLAY_KEY, JSON {type, name, ...}
//   GET  /api/stream/events   ?since=<n>&k=<STREAM_OVERLAY_KEY>: the events after n, plus `last` (the overlay's first poll only learns `last`)
// Chat already carries subs, gifts, raids, bits and clip links, so the only thing the overlay needs from here is follows; the rest is stored for owners who prefer it.
// No key set = the routes answer 503 and nothing is stored. Names are cut down to chat-safe characters before they are stored.
import { sharedKey } from './sharedkey.js';

const TYPES = new Set(['follow', 'sub', 'resub', 'giftsub', 'giftbomb', 'bits', 'raid', 'clip']);
const KEEP = 500, PAGE = 50, SKEW_MS = 10 * 60e3;
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
const nm = (v) => String(v ?? '').replace(/[^\w]/g, '').slice(0, 25);
const num = (v) => Math.max(0, Math.min(1e9, Math.floor(+v || 0)));
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const enc = new TextEncoder();

export function safeEq(a, b) { // constant-time for equal lengths; different lengths are simply different
  a = String(a ?? ''); b = String(b ?? ''); if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0;
}
export async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
}

/** One stored/served event from loose input; null when the type is not one we show. */
export function cleanEvent(raw) {
  if (!raw || !TYPES.has(raw.type)) return null;
  if (raw.type === 'clip' && !/^[\w-]{8,80}$/.test(raw.slug ?? '')) return null;
  const e = { type: raw.type, name: nm(raw.name) };
  if (raw.plan) e.plan = String(raw.plan).replace(/[^\w]/g, '').slice(0, 8);
  if (raw.recipient) e.recipient = nm(raw.recipient);
  for (const k of ['months', 'count', 'amount', 'viewers']) if (raw[k] != null) e[k] = num(raw[k]);
  if (raw.slug) e.slug = raw.slug;
  if (raw.message) e.message = String(raw.message).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 200);
  return e;
}

/** A Twitch EventSub notification (subscription.type + event) as one overlay event, or null. */
export function fromEventSub(type, ev) {
  const who = nm(ev?.user_name ?? ev?.user_login);
  switch (type) {
    case 'channel.follow': return cleanEvent({ type: 'follow', name: who });
    case 'channel.subscribe': return ev.is_gift ? null : cleanEvent({ type: 'sub', name: who, plan: ev.tier }); // a gifted sub is announced by the gift event
    case 'channel.subscription.message': return cleanEvent({ type: 'resub', name: who, plan: ev.tier, months: ev.cumulative_months, message: ev.message?.text });
    case 'channel.subscription.gift': { const n = num(ev.total) || 1, name = ev.is_anonymous ? 'Anonymous' : who; return n > 1 ? cleanEvent({ type: 'giftbomb', name, count: n, plan: ev.tier }) : cleanEvent({ type: 'giftsub', name, plan: ev.tier }); }
    case 'channel.cheer': return cleanEvent({ type: 'bits', name: ev.is_anonymous ? 'Anonymous' : who, amount: ev.bits, message: ev.message });
    case 'channel.raid': return cleanEvent({ type: 'raid', name: nm(ev.from_broadcaster_user_name ?? ev.from_broadcaster_user_login), viewers: ev.viewers });
    default: return null;
  }
}

/** The EventSub subscriptions the overlay listens to, as Helix request bodies (scripts/twitch-eventsub.mjs sends them). */
export function subscriptionBodies(broadcasterId, callback, secret) {
  const t = (type, version, condition) => ({ type, version, condition, transport: { method: 'webhook', callback, secret } });
  const b = { broadcaster_user_id: broadcasterId };
  return [t('channel.follow', '2', { ...b, moderator_user_id: broadcasterId }), t('channel.subscribe', '1', b), t('channel.subscription.message', '1', b),
    t('channel.subscription.gift', '1', b), t('channel.cheer', '1', b), t('channel.raid', '1', { to_broadcaster_user_id: broadcasterId })];
}

async function store(env, ext, e) {
  const { type, name, ...rest } = e;
  const r = await env.DB.prepare('INSERT OR IGNORE INTO stream_events (ext_id, type, name, data, at) VALUES (?, ?, ?, ?, ?)').bind(ext || null, type, name, JSON.stringify(rest), Date.now()).run();
  const added = (r.meta?.changes ?? 0) > 0;
  if (added) await env.DB.prepare('DELETE FROM stream_events WHERE n <= (SELECT MAX(n) FROM stream_events) - ?').bind(KEEP).run();
  return added;
}

async function twitch(request, env) {
  if (!env.TWITCH_EVENTSUB_SECRET) return json({ error: 'Twitch events are not set up' }, 503);
  const body = await request.text(), h = request.headers, id = h.get('Twitch-Eventsub-Message-Id') ?? '', ts = h.get('Twitch-Eventsub-Message-Timestamp') ?? '';
  const want = 'sha256=' + await hmacHex(env.TWITCH_EVENTSUB_SECRET, id + ts + body);
  if (!id || !safeEq(h.get('Twitch-Eventsub-Message-Signature'), want)) return json({ error: 'Bad signature' }, 403);
  if (!(Math.abs(Date.now() - Date.parse(ts)) < SKEW_MS)) return json({ error: 'Stale message' }, 403); // a captured delivery cannot be replayed later
  let d; try { d = JSON.parse(body); } catch { return json({ error: 'Bad JSON' }, 400); }
  const kind = h.get('Twitch-Eventsub-Message-Type');
  if (kind === 'webhook_callback_verification') return new Response(String(d.challenge ?? ''), { status: 200, headers: { 'Content-Type': 'text/plain' } });
  if (kind === 'notification') { const e = fromEventSub(d.subscription?.type, d.event ?? {}); if (e) await store(env, 'tw:' + id, e); }
  return new Response(null, { status: 204 }); // revocation and anything unknown: acknowledged, nothing stored
}

async function push(request, env) {
  if (!safeEq(sharedKey(request), env.STREAM_OVERLAY_KEY)) return json({ error: 'Forbidden' }, 403);
  let raw; try { raw = await request.json(); } catch { return json({ error: 'Bad JSON' }, 400); }
  const e = cleanEvent(raw); if (!e) return json({ error: 'Unknown event type' }, 400);
  const added = await store(env, raw.id ? 'push:' + String(raw.id).slice(0, 60) : null, e);
  return json({ ok: true, added });
}

async function read(url, env) {
  if (!safeEq(url.searchParams.get('k'), env.STREAM_OVERLAY_KEY)) return json({ error: 'Forbidden' }, 403);
  const since = num(url.searchParams.get('since')), last = (await env.DB.prepare('SELECT COALESCE(MAX(n), 0) AS m FROM stream_events').first('m')) ?? 0;
  if (!since) return json({ last, events: [] }); // the first poll only says where the feed is
  const rows = (await env.DB.prepare('SELECT n, type, name, data, at FROM stream_events WHERE n > ? ORDER BY n LIMIT ?').bind(since, PAGE).all()).results ?? [];
  return json({ last, events: rows.map((r) => ({ n: r.n, type: r.type, name: r.name, at: r.at, ...JSON.parse(r.data || '{}') })) });
}

/** Routes under /api/stream/. Returns a Response, or null when the path is not one of ours. */
export async function streamRoute(request, env, url) {
  const p = url.pathname, m = request.method;
  if (!p.startsWith('/api/stream/')) return null;
  if (p === '/api/stream/twitch' && m === 'POST') return twitch(request, env);
  if (!env.STREAM_OVERLAY_KEY) return json({ error: 'The stream overlay feed is not set up' }, 503);
  if (p === '/api/stream/event' && m === 'POST') return push(request, env);
  if (p === '/api/stream/events' && m === 'GET') return read(url, env);
  return json({ error: 'Not found' }, 404);
}
