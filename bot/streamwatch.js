// Watch the club stream inside Discord: an Activity (next/stream/activity/) that plays the club's Twitch channel in a voice channel.
// A bot cannot open an Activity by itself, so when the club goes live the go-live card carries a "Watch in Discord" button: an invite to the voice channel
// that launches the Activity for whoever clicks it. The voice channel is the Organization config purpose `stream_watch` (/setup channel purpose:stream_watch,
// or the website), never an id in code. Discord needs Activities switched on for the app and the page mapped in the Developer Portal (LIBRARY/STREAM-WATCH.md).
import { channelFor } from './orgconfig.js';
import { message, header, sep, footer, buttons, reply, notice } from './ui.js';
import { orgName, channelNotice } from './orgconfig.js';
import { can } from './roles.js';

const ID = /^\d{5,25}$/;
export const INVITE_SECONDS = 12 * 3600; // a stream's length; the next go-live asks again (Discord hands back the same live invite while one exists)

/** The Activity invite for the configured voice channel: { url } | { none: true } (no channel set) | { error }. */
export async function watchInvite(env, fetcher = fetch) {
  const channel = await channelFor(env, 'stream_watch');
  if (!ID.test(String(channel ?? ''))) return { none: true };
  if (!env.DISCORD_BOT_TOKEN || !ID.test(String(env.DISCORD_APP_ID ?? ''))) return { error: 'The bot token or application id is missing.' };
  const r = await fetcher(`https://discord.com/api/v10/channels/${channel}/invites`, {
    method: 'POST', headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ max_age: INVITE_SECONDS, max_uses: 0, unique: false, target_type: 2, target_application_id: env.DISCORD_APP_ID }),
  }).catch(() => null);
  const d = await r?.json?.().catch(() => null);
  if (!r?.ok || !d?.code) return { error: d?.message ? `Discord said: ${String(d.message).slice(0, 120)}` : 'Discord would not make the invite (does the bot have Create Invite on that voice channel, and are Activities on for the app?).' };
  return { url: `https://discord.gg/${d.code}`, channel };
}

export const STREAMWATCH_COMMANDS = new Set(['watchlive']);
/** The launcher card /watchlive shows (only to the member who asked). */
export function watchPanel(env, url) {
  return message({ accent: 'win', ephemeral: true, mentions: { parse: [] }, blocks: [
    header({ eyebrow: `${orgName(env)} · Watch together`, title: 'Watch the stream in Discord', sub: 'Opens the live stream as an Activity in the voice channel. Join, press Watch, hang out.', size: 3 }),
    sep(), footer('Works on desktop and mobile · anyone in the voice channel sees the same stream'),
    buttons([{ label: 'Watch in Discord', url }]),
  ] });
}

/** /watchlive: members and above get the "Watch in Discord" button; says what is missing when the voice channel or the app is not set up. */
export async function watchCommand(i, env, me) {
  if (!can(me, 'hub.use')) return reply(notice('Members only', 'Join the club and get your member role to watch the stream together.'));
  const w = await watchInvite(env);
  if (w.none) return reply(await channelNotice(env, 'stream_watch'));
  if (w.error) return reply(notice('Watch together is not ready', 'A manager needs to finish the setup (voice channel, Create Invite permission, Activities on for the app).'));
  return reply(watchPanel(env, w.url));
}
