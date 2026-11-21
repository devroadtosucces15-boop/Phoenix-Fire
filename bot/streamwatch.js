// Watch the club stream inside Discord: an Activity (next/stream/activity/) that plays the club's Twitch channel in a voice room.
// When the club goes live the bot CREATES a voice room (detailed name, status "🔴 LIVE NOW ON TWITCH"), and the go-live card carries a "Watch in Discord" button:
// an invite to that room that launches the Activity for whoever clicks it. A bot cannot open an Activity by itself; the button is the closest automatic version.
// When the stream has been off for ROOM_GRACE the room is deleted (a short drop-out never deletes it). The room id lives in the `meta` table.
// Optional: Organization config purpose `stream_watch` may point at a voice channel or a category; the new room is created in that category. Nothing else is configured and no id is in code.
// The bot needs Manage Channels (create/delete), Create Invite and Set Voice Channel Status. Discord needs Activities on for the app and the page mapped (LIBRARY/STREAM-WATCH.md).
import { channelFor, orgName } from './orgconfig.js';
import { message, header, sep, footer, buttons, reply, notice } from './ui.js';
import { can } from './roles.js';

const API = 'https://discord.com/api/v10';
const ID = /^\d{5,25}$/;
const ROOM_KEY = 'stream_watch_room', OFF_KEY = 'stream_watch_off_at';
export const INVITE_SECONDS = 12 * 3600;
export const ROOM_GRACE = 15 * 60e3; // off this long before the room is removed
export const ROOM_STATUS = '🔴 LIVE NOW ON TWITCH';
export const STREAMWATCH_COMMANDS = new Set(['watchlive']);

const dc = (env, fetcher, method, path, body, reason) => fetcher(`${API}${path}`, {
  method, headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json', ...(reason ? { 'X-Audit-Log-Reason': encodeURIComponent(reason) } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
}).catch(() => null);
const metaGet = (env, k) => env.DB.prepare('SELECT value FROM meta WHERE key = ?').bind(k).first('value');
const metaSet = (env, k, v) => (v == null
  ? env.DB.prepare('DELETE FROM meta WHERE key = ?').bind(k).run()
  : env.DB.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').bind(k, String(v)).run());

/** The room's name: the club, "Live", and the game when known. Voice names allow emoji and spaces, 100 characters at most. */
export function roomName(env, game) {
  const g = String(game ?? '').replace(/[^\p{L}\p{N} &'.:+-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40);
  return `🔴｜${orgName(env)} Live · ${g || 'Watch Party'}`.slice(0, 100);
}

/** The category new rooms go in: the configured stream_watch channel's parent (or itself when it is a category). */
async function parentOf(env, fetcher) {
  const id = await channelFor(env, 'stream_watch').catch(() => null);
  if (!ID.test(String(id ?? ''))) return null;
  const r = await dc(env, fetcher, 'GET', `/channels/${id}`);
  const c = r?.ok ? await r.json().catch(() => null) : null;
  return c ? (c.type === 4 ? c.id : c.parent_id ?? null) : null;
}

/** The live room's channel id, or null. */
export async function liveRoom(env) { const id = await metaGet(env, ROOM_KEY).catch(() => null); return ID.test(String(id ?? '')) ? String(id) : null; }

/** Keep the room in step with the stream. found = the live check result (or null when off air). Returns the room id while one should exist. */
export async function roomTick(env, found, now = Date.now(), fetcher = fetch) {
  if (!env.DB || !env.DISCORD_BOT_TOKEN || !ID.test(String(env.DISCORD_GUILD_ID ?? ''))) return null;
  let room = await liveRoom(env);
  if (room) { const r = await dc(env, fetcher, 'GET', `/channels/${room}`); if (r?.status === 404) { await metaSet(env, ROOM_KEY, null); room = null; } } // someone deleted it by hand
  if (found) {
    await metaSet(env, OFF_KEY, null);
    if (!room) {
      const parent = await parentOf(env, fetcher);
      const r = await dc(env, fetcher, 'POST', `/guilds/${env.DISCORD_GUILD_ID}/channels`, { name: roomName(env, found.game), type: 2, ...(parent ? { parent_id: parent } : {}) }, 'Club stream went live');
      const c = r?.ok ? await r.json().catch(() => null) : null;
      if (!ID.test(String(c?.id ?? ''))) return null; // no permission: the go-live card still posts, just without the button
      room = String(c.id); await metaSet(env, ROOM_KEY, room);
    }
    await dc(env, fetcher, 'PUT', `/channels/${room}/voice-status`, { status: ROOM_STATUS }); // best effort: needs Set Voice Channel Status
    return room;
  }
  if (!room) return null;
  const off = Number(await metaGet(env, OFF_KEY)) || 0;
  if (!off) { await metaSet(env, OFF_KEY, now); return room; }
  if (now - off < ROOM_GRACE) return room;
  await dc(env, fetcher, 'DELETE', `/channels/${room}`, null, 'Club stream ended');
  await metaSet(env, ROOM_KEY, null); await metaSet(env, OFF_KEY, null);
  return null;
}

/** The Activity invite for a room: { url } | { error }. */
export async function watchInvite(env, channel, fetcher = fetch) {
  if (!ID.test(String(channel ?? ''))) return { none: true };
  if (!env.DISCORD_BOT_TOKEN || !ID.test(String(env.DISCORD_APP_ID ?? ''))) return { error: 'The bot token or application id is missing.' };
  const r = await dc(env, fetcher, 'POST', `/channels/${channel}/invites`, { max_age: INVITE_SECONDS, max_uses: 0, unique: false, target_type: 2, target_application_id: env.DISCORD_APP_ID });
  const d = await r?.json?.().catch(() => null);
  if (!r?.ok || !d?.code) return { error: d?.message ? `Discord said: ${String(d.message).slice(0, 120)}` : 'Discord would not make the invite (does the bot have Create Invite on the room, and are Activities on for the app?).' };
  return { url: `https://discord.gg/${d.code}`, channel };
}

/** The launcher card /watchlive shows (only to the member who asked). */
export function watchPanel(env, url) {
  return message({ accent: 'win', ephemeral: true, mentions: { parse: [] }, blocks: [
    header({ eyebrow: `${orgName(env)} · Watch together`, title: 'Watch the stream in Discord', sub: 'Opens the live stream as an Activity in the watch room. Join, press Watch, hang out.', size: 3 }),
    sep(), footer('Works on desktop and mobile · everyone in the room sees the same stream'),
    buttons([{ label: 'Watch in Discord', url }]),
  ] });
}

/** /watchlive: members and above get the "Watch in Discord" button while the club is live. */
export async function watchCommand(i, env, me, fetcher = fetch) {
  if (!can(me, 'hub.use')) return reply(notice('Members only', 'Join the club and get your member role to watch the stream together.'));
  const room = await liveRoom(env);
  if (!room) return reply(notice('Not live right now', `${orgName(env)} is offline. The watch room opens by itself when the stream goes live.`));
  const w = await watchInvite(env, room, fetcher);
  if (w.error) return reply(notice('Watch together is not ready', 'A manager needs to finish the setup (Create Invite permission on the room, Activities on for the app).'));
  return reply(watchPanel(env, w.url));
}
