# Stream overlay (alerts, goal bars, clip reactions)

Last verified: 2026-11-21

On-stream graphics for OBS, built from one transparent web page. The owner designs everything in the **Overlay Studio**, copies a link
into an OBS Browser Source and is done. Brand name, motto and colours come from `config.json` at build time (`phoenix/build.mjs` writes
`overlay-brand.js`); the source files carry no club name.

## Pages (self-contained folders, kept out of the site pages)

| Page | What it is |
|---|---|
| `/overlay/studio.html` | The designer: texts, icons, sounds, looks and positions for every alert, the goal bars, clip rules, live preview with test buttons, and the OBS links. Not linked from the site menu; open it by address. |
| `/overlay/` | The OBS Browser Source. `?cfg=<studio link>` plus `widget=all` (default), `alerts`, `goals` or `clips`. Extras: `demo=1` plays sample events, `bg=1` shows a checker background, `debug=1` shows a connection light, `calm=1` removes motion. Robots: disallowed. |

OBS settings: Browser Source, Width 1920, Height 1080, untick "Shutdown source when not visible" (goals count while it runs).

## What it listens to

| Source | Gives | Needs |
|---|---|---|
| Twitch chat, read anonymously from the overlay | Subs, resubs, gift subs, gift bombs, raids, bits, and clip links posted by allowed roles | Only the channel name. No login, no token. |
| Worker feed `GET /api/stream/events` | Follows (Twitch gives follows only through EventSub) and, optionally, anything else | Owner steps below. |

A gift bomb is one alert; the gifts inside it still count for the sub goal but are not announced again. Tier 2 counts 2 and tier 3 counts 6 sub points.
Leave subs, bits and raids unticked in "Count these from the feed" while chat supplies them, or each shows twice.

## Alert types

follow, sub, resub, giftsub, giftbomb, bits (with a minimum), raid, goal (goal met). Each has its own heading, message with `{name} {tier} {months} {recipient} {count}
{amount} {viewers} {label} {target}`, icon, on-screen time, sound (synthesised, no files) and look (ember, gold, silver). Several follows waiting at once become one card.
Raids and gift bombs jump the queue.

## Goal bars ("to achieve" and "met")

Up to six goals counting follows, subs or bits. Each shows `current / target`, the percent and "N to go". Optional `steps` (for example 50, 100, 250) chain goals: each step
is celebrated (banner, sparks, a "goal met" alert) and the bar moves on. The running count is kept in the OBS browser; the Studio's "Counts now" is the starting value and
resets the count when changed.

## Clip reactions

A Twitch clip link posted in chat by an allowed role (default: you, mods, VIPs; optionally subs, anyone, or only with `!clip`) plays in a framed player for up to N seconds.
Chat words (🔥, W, GG, LUL, ... editable) float up over the clip and are tallied under it. Twitch's embed needs no key; it is given the overlay's own host as `parent`.

## Owner steps (only for follows)

1. Pick two long random values. `wrangler secret put STREAM_OVERLAY_KEY` and `wrangler secret put TWITCH_EVENTSUB_SECRET` (names in `bot/SECRETS-REGISTRY.md`).
2. Apply the migration `bot/migrations/0081_stream_events.sql` with the normal Worker deploy.
3. Register a Twitch application at dev.twitch.tv/console and authorise it once from the broadcaster account with the scopes `moderator:read:followers`,
   `channel:read:subscriptions` and `bits:read`.
4. On the PC: `TWITCH_CLIENT_ID=… TWITCH_CLIENT_SECRET=… TWITCH_EVENTSUB_SECRET=… node scripts/twitch-eventsub.mjs phoenixfirefc https://<worker host>/api/stream/twitch`
   (add `--dry` first to see what it will create).
5. In the Studio: tick "Also read the club feed", feed address `https://<worker host>/api/stream/events`, feed key = `STREAM_OVERLAY_KEY`. The OBS link now contains the key: keep it private.

Without steps 1 to 5 everything except follows already works.

## Files and tests

| File | Role |
|---|---|
| `next/stream/overlay/overlay-core.js` | Pure logic: config and link, chat parsing, queue, goals, reactions. |
| `next/stream/overlay/overlay.js`, `overlay.css`, `index.html` | The OBS page. |
| `next/stream/overlay/studio.html`, `overlay-studio.{js,css}` | The designer. |
| `next/stream/overlay/overlay-brand.js` | Neutral fallback; `phoenix/build.mjs` rewrites it from `config.json`. |
| `bot/streamevents.js`, `bot/migrations/0081_stream_events.sql` | EventSub webhook (HMAC, replay window, idempotent), keyed push, keyed read; wired in `bot/members.js`. |
| `scripts/twitch-eventsub.mjs` | One-off EventSub subscriber (owner's PC). |
| `tests/overlay.test.mjs`, `tests/streamevents.test.mjs` | Core logic, brand guard on source and built output, Worker routes. |
