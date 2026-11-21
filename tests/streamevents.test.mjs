// Stream overlay feed (bot/streamevents.js): the EventSub webhook, the keyed push, the keyed read, and the rules that keep them safe.
import { env, W, sqlite } from './mock.mjs';
import { t, tt, done } from './lib.mjs';
import { cleanEvent, fromEventSub, subscriptionBodies, hmacHex, safeEq } from '../bot/streamevents.js';

const SECRET = 'whsec-test', KEY = 'overlay-key-test';
const count = () => sqlite.prepare('SELECT COUNT(*) AS n FROM stream_events').get().n;

// ---------- pure ----------
t('cleanEvent: names are cut to chat-safe characters, unknown types refused', cleanEvent({ type: 'follow', name: 'Ev<i>l Name!' }).name === 'EvilName' && cleanEvent({ type: 'nuke' }) === null && cleanEvent(null) === null);
t('cleanEvent: a clip needs a real slug', cleanEvent({ type: 'clip', slug: '<x>' }) === null && cleanEvent({ type: 'clip', slug: 'GoodSlug-12' }).slug === 'GoodSlug-12');
t('cleanEvent: numbers are clamped and control characters removed from messages', cleanEvent({ type: 'bits', name: 'a', amount: -5, message: 'hi\u0000there' }).amount === 0 && cleanEvent({ type: 'bits', name: 'a', amount: 5, message: 'hi\u0000there' }).message === 'hi there');
t('EventSub: follow, sub, resub map to overlay events', fromEventSub('channel.follow', { user_name: 'Ash' }).type === 'follow' && fromEventSub('channel.subscribe', { user_name: 'Bo', tier: '2000' }).plan === '2000'
  && fromEventSub('channel.subscription.message', { user_name: 'Cy', tier: '1000', cumulative_months: 7, message: { text: 'yo' } }).months === 7);
t('EventSub: a gifted sub is not announced twice (the gift event covers it)', fromEventSub('channel.subscribe', { user_name: 'Lucky', is_gift: true }) === null);
t('EventSub: one gift is a gift sub, several are a bomb, anonymous is named so', fromEventSub('channel.subscription.gift', { user_name: 'A', total: 1 }).type === 'giftsub' && fromEventSub('channel.subscription.gift', { user_name: 'A', total: 10, is_anonymous: true }).name === 'Anonymous' && fromEventSub('channel.subscription.gift', { user_name: 'A', total: 10 }).count === 10);
t('EventSub: cheer and raid', fromEventSub('channel.cheer', { user_name: 'A', bits: 300 }).amount === 300 && fromEventSub('channel.raid', { from_broadcaster_user_name: 'Pals', viewers: 40 }).viewers === 40);
t('EventSub: unknown subscription types are ignored', fromEventSub('stream.online', {}) === null);
t('subscription bodies: six webhook subscriptions, follow v2 with the moderator id, secret in every transport', (() => { const b = subscriptionBodies('42', 'https://w.example/api/stream/twitch', 'sec'); return b.length === 6 && b[0].version === '2' && b[0].condition.moderator_user_id === '42' && b.every((x) => x.transport.secret === 'sec' && x.transport.callback.startsWith('https://')) && b[5].condition.to_broadcaster_user_id === '42'; })());
t('safeEq: equal strings pass, different or different-length fail', safeEq('abc', 'abc') && !safeEq('abc', 'abd') && !safeEq('abc', 'abcd') && !safeEq(null, 'x'));

// ---------- not configured ----------
await tt('without the keys: the push and read answer 503 and the webhook too', async () => {
  const a = await W('/api/stream/events?since=0&k=x'), b = await W('/api/stream/event', { method: 'POST', body: '{}' }), c = await W('/api/stream/twitch', { method: 'POST', body: '{}' });
  return a.status === 503 && b.status === 503 && c.status === 503 && count() === 0;
});

env.STREAM_OVERLAY_KEY = KEY; env.TWITCH_EVENTSUB_SECRET = SECRET;
const sign = async (id, ts, body) => ({ 'Twitch-Eventsub-Message-Id': id, 'Twitch-Eventsub-Message-Timestamp': ts, 'Twitch-Eventsub-Message-Signature': 'sha256=' + await hmacHex(SECRET, id + ts + body) });
const hook = async (type, body, { id = 'm' + Math.random(), ts = new Date().toISOString(), sig } = {}) => {
  const raw = JSON.stringify(body), h = await sign(id, ts, raw);
  return W('/api/stream/twitch', { method: 'POST', body: raw, headers: { ...h, ...(sig ? { 'Twitch-Eventsub-Message-Signature': sig } : {}), 'Twitch-Eventsub-Message-Type': type, 'Content-Type': 'application/json' } });
};
const feed = async (since, k = KEY) => { const r = await W(`/api/stream/events?since=${since}&k=${k}`); return { s: r.status, d: await r.json() }; };

// ---------- webhook ----------
await tt('webhook: the verification challenge is echoed back as plain text', async () => {
  const r = await hook('webhook_callback_verification', { challenge: 'abc123', subscription: { type: 'channel.follow' } });
  return r.status === 200 && (await r.text()) === 'abc123';
});
await tt('webhook: a wrong signature is refused and stores nothing', async () => {
  const before = count(), r = await hook('notification', { subscription: { type: 'channel.follow' }, event: { user_name: 'Evil' } }, { sig: 'sha256=00' });
  return r.status === 403 && count() === before;
});
await tt('webhook: a validly signed but old message is refused (no replay)', async () => {
  const before = count(), r = await hook('notification', { subscription: { type: 'channel.follow' }, event: { user_name: 'Old' } }, { ts: new Date(Date.now() - 3600e3).toISOString() });
  return r.status === 403 && count() === before;
});
await tt('webhook: a follow is stored, and Twitch retrying the same message id stores it once', async () => {
  const body = { subscription: { type: 'channel.follow' }, event: { user_name: 'NewFan' } }, before = count();
  const a = await hook('notification', body, { id: 'same-id' }), b = await hook('notification', body, { id: 'same-id' });
  return a.status === 204 && b.status === 204 && count() === before + 1;
});
await tt('webhook: a revocation is acknowledged and stores nothing', async () => {
  const before = count(), r = await hook('revocation', { subscription: { type: 'channel.follow', status: 'authorization_revoked' } });
  return r.status === 204 && count() === before;
});

// ---------- read ----------
await tt('read: wrong or missing key is refused', async () => (await feed(0, 'nope')).s === 403 && (await W('/api/stream/events?since=0')).status === 403);
await tt('read: the first poll (since=0) returns no events, only where the feed is', async () => { const { s, d } = await feed(0); return s === 200 && d.events.length === 0 && d.last >= 1; });
await tt('read: later polls return what is new, in order, with the fields the overlay needs', async () => {
  const { d: base } = await feed(0);
  await hook('notification', { subscription: { type: 'channel.follow' }, event: { user_name: 'Fan2' } });
  await hook('notification', { subscription: { type: 'channel.subscription.gift' }, event: { user_name: 'Whale', total: 5, tier: '1000' } });
  const { d } = await feed(base.last);
  return d.events.length === 2 && d.events[0].type === 'follow' && d.events[0].name === 'Fan2' && d.events[1].type === 'giftbomb' && d.events[1].count === 5 && d.events[1].n > d.events[0].n && d.last === d.events[1].n;
});
await tt('read: asking from the newest number returns nothing new', async () => { const { d } = await feed(0); return (await feed(d.last)).d.events.length === 0; });

// ---------- push ----------
const push = (body, key = KEY) => W('/api/stream/event', { method: 'POST', body: JSON.stringify(body), headers: { 'X-Phoenix-Key': key, 'Content-Type': 'application/json' } });
await tt('push: needs the key', async () => (await push({ type: 'follow', name: 'x' }, 'bad')).status === 403);
await tt('push: a clean event is stored, a bad type is refused', async () => { const before = count(); const a = await push({ type: 'follow', name: 'Pushed' }), b = await push({ type: 'explode', name: 'x' }); return a.status === 200 && b.status === 400 && count() === before + 1; });
await tt('push: the same sender id is stored once', async () => { const before = count(); await push({ type: 'follow', name: 'Dup', id: 'abc' }); const r = await (await push({ type: 'follow', name: 'Dup', id: 'abc' })).json(); return r.added === false && count() === before + 1; });
await tt('only the newest rows are kept', async () => { for (let i = 0; i < 520; i++) sqlite.prepare("INSERT INTO stream_events (ext_id, type, name, data, at) VALUES (?, 'follow', 'x', '{}', 0)").run('bulk' + i); await push({ type: 'follow', name: 'Trim' }); return count() <= 501; });

done();
