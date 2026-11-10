# Phoenix Fire roadmap

Motto: **Rise. Burn. Repeat.** Phoenix is its own project; NOREX data and compatibility are not goals.

## Done

- **Branding, parts 1–7.** Phoenix name, colours, crest, copy and theme layer over the shared `next/` site (`phoenix/build.mjs`, `phoenix/overlay/`). Visible NOREX text is gone from the built pages. Internal identifiers (`norex_session`, `window.Norex*`, `norex.*` storage keys, the `X-Norex-Key` header) stay on purpose; see `PHASE1-NOREX-AUDIT.md`.
- **Bot split.** One Worker serves four Discord apps: core, stats, tools, fun (`bot/apps.js`, `bot/README.md`).
- **Icons per app.** `bot/ensure-emojis.mjs` uploads the icon set to every configured app that has a token and stores the IDs per app in `bot/emojis.gen.js`. `bot/icons.js` picks the set of the app handling the request, falls back to core's, then to unicode.
- **Cron fun posts.** The daily birthday post goes out through the fun app when it is configured, so its buttons come back to fun. Core is the fallback.
- **Live-site polish (one club, five matches).** Friendly Phoenix-voice states for the Rush log, the news feed, the channels list and the trophy cabinet. Form wave hidden under two games. No horizontal scroll on mobile on the pages checked.

- **0053 docs seed.** Rewritten for Phoenix (`bot/migrations/0053_club_docs_content.sql`): welcome, philosophy, 14 rules, requirements and FAQ in Phoenix voice, no NOREX text and no invented club facts. Still on the release hold (nothing pinned, notified or posted until the owner releases the docs). Test: `tests/docsseed.test.mjs`. A database that already ran the old 0053 keeps its rows; apply the new content by re-running the file or editing the docs in the app.

## Open

- **DJ bots on separate hosting.** The music bots cannot run on the Worker; they need their own host.
- **Worker URL.** `phoenix-bot.norexunited.workers.dev` answers (2026-11-10: root 200, `/api/rush`, `/api/feed/public` and `/api/live` return empty-but-valid JSON, CORS allows only the Pages origin). Rush, News and Watch render their Phoenix empty states against those real responses. Still decide before the public launch whether it keeps the `norexunited` account host. From any origin other than the Pages site, the browser blocks its API calls (CORS), so the Rush log, news feed and live banner stay in their fallback state when previewed on localhost.
- **Player pages with a space in the name 404 on Pages.** `player-Ana%20Montana8022.html`, `player-Bantu%20Vikng.html` and `player-KOEN%20WIE.html` are written with a literal `%20` in the file name, so the link decodes to a name that does not exist. Fix in the `next/` build (write the file with the decoded name or slug the key). The other 47 player pages load.
- **`bot.yml`.** Its *Bot icon set* step passes only `DISCORD_BOT_TOKEN`. Add `DISCORD_BOT_TOKEN_STATS`, `_TOOLS` and `_FUN` to that step's `env:` so each app gets its own emoji set.
- **Stats, tools and fun apps.** Create them in the Developer Portal (checklist in `bot/README.md`).

## What the owner must provide

| Item | Where it goes |
|---|---|
| Discord invite link | `phoenix/live.json` `invite`, `config.json` `discord.applyLink` |
| Discord server ID (guild) | `config.json` `discord.guildId` |
| Bot portal link | `config.json` `discord.botPortal` |
| YouTube and Twitch links | `config.json` `streams.youtube`, `streams.twitch` |
| Founded date | `config.json` `brand.founded`, `phoenix/live.json` `founded` |

These are left blank on purpose. No club facts are invented.
