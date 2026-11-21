# Watch the stream in Discord (Activity)

Last verified: 2026-11-21

When the club goes live on Twitch, the go-live card in Discord gets a **Watch in Discord** button. It is an invite to a voice room the bot creates for the stream (named `🔴｜<club> Live · <game>`, voice status `🔴 LIVE NOW ON TWITCH`) that opens an Activity
(`next/stream/activity/`, published at `/activity/`) playing the club's Twitch stream for everyone in that channel. Members and above can also run **`/watchlive`** any time: they get the button privately (visitors who are not members are told members only).

A bot cannot open an Activity by itself: Discord only launches one from a person clicking an invite or a command. The button is the closest automatic version.

## How it works

| Piece | Where |
|---|---|
| Voice room | Created by the bot when the club goes live (`roomTick` in `bot/streamwatch.js`), status set via PUT /channels/{id}/voice-status, deleted 15 minutes after the stream ends (a short drop-out keeps it). The id lives in `meta` key `stream_watch_room`. Optional: purpose `stream_watch` (`/setup channel`, a voice channel or category) says which category the room is made in; nothing needs configuring. |
| Invite | `bot/streamwatch.js` `watchInvite`: POST /channels/{id}/invites with target_type 2 and the core app id; the bot needs Create Invite on the room. |
| Go-live card | `bot/streamalerts.js` `checkLive`: only the club's own (main) Twitch source gets the button; contributors do not. An invite failure never blocks the post. |
| Command | `/watchlive` (members and above; replies only to the person who ran it), `bot/streamwatch.js` `watchCommand`, defined in `bot/commanddefs.js`, routed in `bot/worker.js`. |
| Activity page | `next/stream/activity/` (index.html, activity.js, activity.css), the bundled SDK `vendor-discord-sdk.min.js` (@discord/embedded-app-sdk 2.5.0, MIT), channel from `config.json` `streams.twitch` via `phoenix/build.mjs`. |
| Tests | `tests/streamwatch.test.mjs` |

## Developer Portal (core app)

1. Activities enabled (Web, iOS, Android). Done 2026-11-21.
2. URL Mappings: Root mapping `/` to `devroadtosucces15-boop.github.io/Phoenix-Fire/activity` (the Activity folder, not the site root), and `/twitch` to `player.twitch.tv`. Done 2026-11-21.
3. Give the bot Manage Channels, Create Invite and Set Voice Channel Status. Add the club's Twitch source with `/streamalerts add` (source Main club) so the go-live check runs.
4. When live, join the room, run `/watchlive` (or press the card's button).

## Not verified

The Twitch player was checked in a normal browser only. Inside Discord the player page loads further scripts from other Twitch hosts, and Discord's sandbox blocks any
host that is not mapped in step 2, so the video may stay blank until more mappings are added (static-cdn.jtvnw.net, usher.ttvnw.net, gql.twitch.tv and similar; the
browser console in Discord's Activity debug mode names the blocked ones). The page's "Open on Twitch" and "Open chat" buttons are the fallback. Nobody has run this inside Discord yet.
