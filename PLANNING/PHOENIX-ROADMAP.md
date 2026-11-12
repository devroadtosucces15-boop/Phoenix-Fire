# Phoenix Fire roadmap

Motto: **Rise. Burn. Repeat.** Phoenix is its own project; NOREX data and compatibility are not goals.

## Done

- **Branding, parts 1–7.** Phoenix name, colours, crest, copy and theme layer over the shared `next/` site (`phoenix/build.mjs`, `phoenix/overlay/`). Visible NOREX text is gone from the built pages. Internal identifiers (`norex_session`, `window.Norex*`, `norex.*` storage keys, the `X-Norex-Key` header) stay on purpose; see `PHASE1-NOREX-AUDIT.md`.
- **Bot split.** One Worker serves six Discord apps: core, stats, tools, matchday, rush, and the old fun app kept empty for the transition (`bot/apps.js`, `bot/README.md`).
- **Icons per app.** `bot/ensure-emojis.mjs` uploads the icon set to every configured app that has a token and stores the IDs per app in `bot/emojis.gen.js`. `bot/icons.js` picks the set of the app handling the request, falls back to core's, then to unicode.
- **Cron fun posts.** The daily birthday post goes out through the fun app when it is configured, so its buttons come back to fun. Core is the fallback.
- **Live-site polish (one club, five matches).** Friendly Phoenix-voice states for the Rush log, the news feed, the channels list and the trophy cabinet. Form wave hidden under two games. No horizontal scroll on mobile on the pages checked.

- **0053 docs seed.** Rewritten for Phoenix (`bot/migrations/0053_club_docs_content.sql`): welcome, philosophy, 14 rules, requirements and FAQ in Phoenix voice, no NOREX text and no invented club facts. Still on the release hold (nothing pinned, notified or posted until the owner releases the docs). Test: `tests/docsseed.test.mjs`. A database that already ran the old 0053 keeps its rows; apply the new content by re-running the file or editing the docs in the app.

- **Matchday and Rush plumbing.** `matchday` and `rush` are known apps (no commands yet), `bot.yml` and `set-tokens.sh` carry their tokens, icons exist. Design and waves: `PLANNING/BOT-SPLIT.md`. Secrets (VAPID, dispatch, analytics) set 2026-11-10; invite link and guild ID filled in.

- **Brand sweep (2026-11-10).** AutoMod rule is now "PHOENIX FIRE profanity filter" (an old rule is adopted, not duplicated). Bot comments and outbound User-Agents say Phoenix. The classic member hub (`squad.html`, built from `web/`) is recoloured to the Phoenix ember instead of the NOREX red. Player pages are written with the decoded key, so names with spaces no longer 404. New `tests/brand.test.mjs` guards the built output. Twitch is set to `kingmitch93`; there is no YouTube channel for Phoenix, so `streams.youtube` stays empty.
- **Matchday and Rush apps: live, with MB6 and A9 done.** Both apps run (2026-11-10) with MB1, MB2, MB4, MB5 and MB6 (the Rush queue manager, `PLANNING/RUSH-QUEUE.md`); every channel and role comes from the Organization config (A9, `bot/orgconfig.js`). The old apps carry a "moved" pointer until 2026-11-24.
- **Discord output redesign, sections 1 to 9.** Every message the bots send carries a drawn Phoenix picture; `node tools/bot-studio/studio.mjs check --strict` is at 0 warnings (`PLANNING/OUTPUT-REDESIGN-SECTIONS.md`).

## Open

- **DJ bots on separate hosting.** The music bots cannot run on the Worker; they need their own host.
- **Worker URL.** `phoenix-bot.norexunited.workers.dev` answers (2026-11-10: root 200, `/api/rush`, `/api/feed/public` and `/api/live` return empty-but-valid JSON, CORS allows only the Pages origin). The move off the `norexunited` account host is prepared in the repo: `phoenix/worker-host.json` holds the host and `node phoenix/worker-host.mjs flip <https://host>` switches config, live.json, wrangler and the docs in one go (`PLANNING/WORKER-HOST.md`, which also lists the few Cloudflare and Discord portal steps that are the owner's). Until a new host exists the current one stays.
- **Match alert.** Wired (2026-11-12): the result import (`scripts/lib/resultpost.mjs`) asks the Worker (`/api/org/match-alert`, `bot/matchalert.js`) after posting a result that is a defeat by 3 or more goals (`config.json` `matchAlert.loseBy`). Channel and roles come from the Organization config.
- **Nightly D1 backup.** `.github/workflows/backup.yml` exports `phoenix` to R2 `phoenix-media/backups/` every night; restore steps in `bot/RESTORE.md`.

## What the owner must provide

| Item | Where it goes |
|---|---|
| Founded date | `config.json` `brand.founded`, `phoenix/live.json` `founded` |

Phoenix has no YouTube channel (Twitch is set). The founded date is left blank on purpose. No club facts are invented.
