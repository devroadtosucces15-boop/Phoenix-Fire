# Phoenix Fire roadmap

Motto: **Rise. Burn. Repeat.** Phoenix is its own project; NOREX data and compatibility are not goals.

## Done

- **Branding, parts 1–7.** Phoenix name, colours, crest, copy and theme layer over the shared `next/` site (`phoenix/build.mjs`, `phoenix/overlay/`). Visible NOREX text is gone from the built pages. Internal identifiers (`norex_session`, `window.Norex*`, `norex.*` storage keys, the `X-Norex-Key` header) stay on purpose; see `PHASE1-NOREX-AUDIT.md`.
- **Bot split.** One Worker serves four Discord apps: core, stats, tools, fun (`bot/apps.js`, `bot/README.md`).
- **Icons per app.** `bot/ensure-emojis.mjs` uploads the icon set to every configured app that has a token and stores the IDs per app in `bot/emojis.gen.js`. `bot/icons.js` picks the set of the app handling the request, falls back to core's, then to unicode.
- **Cron fun posts.** The daily birthday post goes out through the fun app when it is configured, so its buttons come back to fun. Core is the fallback.
- **Live-site polish (one club, five matches).** Friendly Phoenix-voice states for the Rush log, the news feed, the channels list and the trophy cabinet. Form wave hidden under two games. No horizontal scroll on mobile on the pages checked.

- **0053 docs seed.** Rewritten for Phoenix (`bot/migrations/0053_club_docs_content.sql`): welcome, philosophy, 14 rules, requirements and FAQ in Phoenix voice, no NOREX text and no invented club facts. Still on the release hold (nothing pinned, notified or posted until the owner releases the docs). Test: `tests/docsseed.test.mjs`. A database that already ran the old 0053 keeps its rows; apply the new content by re-running the file or editing the docs in the app.

- **Matchday and Rush plumbing.** `matchday` and `rush` are known apps (no commands yet), `bot.yml` and `set-tokens.sh` carry their tokens, icons exist. Design and waves: `PLANNING/BOT-SPLIT.md`. Secrets (VAPID, dispatch, analytics) set 2026-11-10; invite link and guild ID filled in.

- **Brand sweep (2026-11-10).** AutoMod rule is now "PHOENIX FIRE profanity filter" (an old rule is adopted, not duplicated). Bot comments and outbound User-Agents say Phoenix. The classic member hub (`squad.html`, built from `web/`) is recoloured to the Phoenix ember instead of the NOREX red. Player pages are written with the decoded key, so names with spaces no longer 404. New `tests/brand.test.mjs` guards the built output. Twitch is set to `kingmitch93`; there is no YouTube channel for Phoenix, so `streams.youtube` stays empty.

## Open

- **DJ bots on separate hosting.** The music bots cannot run on the Worker; they need their own host.
- **Worker URL.** `phoenix-bot.norexunited.workers.dev` answers (2026-11-10: root 200, `/api/rush`, `/api/feed/public` and `/api/live` return empty-but-valid JSON, CORS allows only the Pages origin). Rush, News and Watch render their Phoenix empty states against those real responses. Still decide before the public launch whether it keeps the `norexunited` account host. From any origin other than the Pages site, the browser blocks its API calls (CORS), so the Rush log, news feed and live banner stay in their fallback state when previewed on localhost.
- **Matchday and Rush apps: live.** Both are configured and switched on (commit `3134c06`, 2026-11-10); MB1, MB2, MB4 and MB5 are live with them, and the old apps carry a "moved" pointer until 2026-11-24. Still to build: MB6 (queue manager, `PLANNING/RUSH-QUEUE.md`) and config-driven channels (A9) first.

## What the owner must provide

| Item | Where it goes |
|---|---|
| Founded date | `config.json` `brand.founded`, `phoenix/live.json` `founded` |

Phoenix has no YouTube channel (Twitch is set). The founded date is left blank on purpose. No club facts are invented.
