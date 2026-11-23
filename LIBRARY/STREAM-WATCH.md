# Watch the stream in Discord (Activity)

Last verified: 2026-11-23

When the club goes live on Twitch, the go-live card in Discord gets a **Watch in Discord** button. It is an invite to a voice room the bot creates for the stream (named `🔴｜<club> Live · <game>`, voice status `🔴 LIVE NOW ON TWITCH`) that opens an Activity
(`next/stream/activity/`, published at `/activity/`) showing the club's live Twitch preview for everyone in that channel. Members and above can also run **`/watchlive`** any time: they get the button privately (visitors who are not members are told members only).

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
2. URL Mappings: Root mapping `/` to `devroadtosucces15-boop.github.io/Phoenix-Fire/activity` (the Activity folder, not the site root), and `/preview` to `static-cdn.jtvnw.net` (the old `/twitch` mapping is no longer used). `/twitch` done 2026-11-21; `/preview` still to add.
3. Give the bot Manage Channels, Create Invite and Set Voice Channel Status. Add the club's Twitch source with `/streamalerts add` (source Main club) so the go-live check runs.
4. When live, join the room, run `/watchlive` (or press the card's button).

## Why the stage is a preview image, not the player (2026-11-23)

Found with the simulator (`tools/activity-sim/`, below). Twitch's player page cannot run inside a Discord Activity, whatever the mappings:
- Proxied through `/.proxy/twitch/`, the page loads its scripts from `https://assets.twitch.tv/...`. Discord only lets an Activity reach its own proxy, so those scripts are blocked and the frame stays black (this is what the owner saw; the violation happens inside the frame, so the page itself could not report it).
- With that rule switched off in the simulator, the same scripts are refused by CORS, because the page is no longer on twitch.tv. So extra URL mappings cannot fix it.

So inside Discord the stage shows Twitch's live preview image, `https://static-cdn.jtvnw.net/previews-ttv/live_user_<channel>-1280x720.jpg`, through a new mapping `/preview` to `static-cdn.jtvnw.net`, refreshed every minute (Twitch itself renews the preview every few minutes). **Open on Twitch** starts the real video outside Discord. A plain browser keeps the real player. The line under the stage logs each step with timings, and names anything Discord blocks.

**Developer Portal: add the URL mapping `/preview` to `static-cdn.jtvnw.net`** (owner step; `/twitch` is no longer used). Without it the stage says "preview image did not load".

## Activity simulator (`tools/activity-sim/server.mjs`)

A local stand-in for Discord's Activity sandbox, so changes can be tried and fixed without a deploy and without Discord: `node tools/activity-sim/server.mjs [--port 5173] [--csp strict|off] [--strip-frame] [--map name=host]`, then open `http://1234567890123456789.discordsays.localhost:5173/` in Chromium. It serves the Activity folder as the root mapping, maps `/.proxy/<name>/` to another host (defaults: `twitch` to `player.twitch.tv`, `preview` to `static-cdn.jtvnw.net`), stubs the Embedded App SDK, sends a strict Content-Security-Policy (only the Activity's own origin; Discord's real policy text is not public, so this is the worst realistic case, compare with `--csp off`), and logs every request at `/__sim/log` (a root-path file the player asks for shows up as a 404). Tests: `tests/activitysim.test.mjs`.

## Not verified

Nobody has run the preview image inside Discord yet (the simulator shows it under the strict policy). If Discord's real proxy handles the preview redirect for an offline channel differently, the stage says "preview image did not load" and the Open on Twitch button is the fallback.
