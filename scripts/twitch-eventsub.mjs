// Subscribes the Worker to Twitch EventSub so follows (and, if wanted, subs, gifts, bits, raids) reach the stream overlay feed (bot/streamevents.js).
//   node scripts/twitch-eventsub.mjs <broadcaster-login> <callback-url> [--dry]
//   callback-url = the Worker's  https://<worker host>/api/stream/twitch   (https only)
// Environment (never written to a file, never printed): TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET (a Twitch developer application) and
// TWITCH_EVENTSUB_SECRET (the same value the Worker holds as its TWITCH_EVENTSUB_SECRET secret; 10 to 100 characters).
// The broadcaster account must have authorised that application once with the scopes moderator:read:followers, channel:read:subscriptions and bits:read (see LIBRARY/STREAM-OVERLAY.md).
// --dry prints what would be created, with the secret hidden, and sends nothing.
import { subscriptionBodies } from '../bot/streamevents.js';

const [login, callback, ...flags] = process.argv.slice(2), dry = flags.includes('--dry');
const { TWITCH_CLIENT_ID: id, TWITCH_CLIENT_SECRET: secret, TWITCH_EVENTSUB_SECRET: hook } = process.env;
const die = (m) => { console.error(m); process.exit(1); };
if (!login || !/^[A-Za-z0-9_]{3,25}$/.test(login)) die('usage: node scripts/twitch-eventsub.mjs <broadcaster-login> <https callback url> [--dry]');
if (!/^https:\/\//.test(callback ?? '') || !/\/api\/stream\/twitch$/.test(callback)) die('callback must be https and end in /api/stream/twitch');
if (!hook || hook.length < 10 || hook.length > 100) die('set TWITCH_EVENTSUB_SECRET (10 to 100 characters, the same value as the Worker secret)');
if (dry) {
  for (const b of subscriptionBodies('<broadcaster id>', callback, '<hidden>')) console.log(b.type, 'v' + b.version, JSON.stringify(b.condition));
  process.exit(0);
}
if (!id || !secret) die('set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET');

const tok = await (await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: 'client_credentials' }) })).json();
if (!tok.access_token) die('Twitch did not give an app token: ' + (tok.message ?? 'check the client id and secret'));
const H = { 'Client-Id': id, Authorization: 'Bearer ' + tok.access_token, 'Content-Type': 'application/json' };
const user = (await (await fetch('https://api.twitch.tv/helix/users?login=' + encodeURIComponent(login), { headers: H })).json()).data?.[0];
if (!user) die('No Twitch channel called ' + login);
let bad = 0;
for (const b of subscriptionBodies(user.id, callback, hook)) {
  const r = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', { method: 'POST', headers: H, body: JSON.stringify(b) }), d = await r.json().catch(() => ({}));
  const ok = r.status === 202 || r.status === 409; if (!ok) bad++;
  console.log(`${ok ? 'ok ' : 'FAIL'} ${b.type} ${r.status === 409 ? '(already subscribed)' : r.status === 202 ? '(created, Twitch is verifying)' : '- ' + (d.message ?? r.status)}`);
}
process.exit(bad ? 2 : 0);
