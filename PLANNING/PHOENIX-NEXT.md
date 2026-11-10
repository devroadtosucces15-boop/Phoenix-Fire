# Phoenix Fire: what is left, in order (2026-11-10)

Part A needs nobody. Part B needs the owner. Do A top to bottom; each step ends green on `node tests/run.mjs` and is committed on its own.
Phoenix is its own project (`CLAUDE.md`): no NOREX text, crest or red in any output; brand values come from config.

## A. Claude can do these alone

| # | Step | Done when | Model |
|---|---|---|---|
| A1 | **Verify what is live.** Fetch the published Pages site and the Worker (unsandboxed curl or Playwright): crest, title, manifest, a player page with a space in the name, Rush/News/Watch empty states, Twitch on Watch, `/api/*` JSON and CORS. List anything that still shows NOREX or fails. | A short report in `PLANNING/LIVE-CHECK.md`; every failure has a fix in A2-A5 or a line in part B | Sonnet |
| A2 | ✅ **Done 2026-11-10 (A2.1–A2.4).** **Dual-read migration for identifiers** (one item per commit, old key still read, new key written): `norex_session` cookie, `X-Norex-Key` header (Worker accepts both, Actions and `scripts/lib/org.mjs` send the new one), `norex.*` and `norex_*` localStorage keys, `NOREX_KV` binding alias. New names are `phoenix_*` / `X-Phoenix-Key`. | A logged-in session survives the deploy; tests cover old-and-new for each; no new NOREX identifier added | Opus (auth, careful) |
| A3 | **Source-level de-NOREX of anything visible or tested**: `bot/RESTORE.md`, `bot/SECRETS-REGISTRY.md` wording, `bot/iconset.mjs`, `bot/icons/make_icon.py`, migration comments, `next/README.md`, `next/serve.mjs` log line, `next/build.mjs` manifest text, `sharedWithNorex` rename, test fixtures with NOREX names. Leave only the host name (B1) and the identifiers kept for A2. | `git grep -i norex` shows only A2 leftovers, the Worker host and the audit docs | Sonnet |
| A4 | **Decide and apply for `web/` (classic) and `next/`**: keep both as shared sources (they are themed at build time), add a one-line header comment to each saying so, and fail the build if the staged output still holds a NOREX name. Do not delete anything. | `phoenix/build.mjs` exits non-zero on a visible NOREX leak; documented in `CLAUDE.md` | Sonnet |
| A5 | **One club, five matches polish**: empty and thin states on every page the nav reaches, mobile no horizontal scroll, Watch with Twitch but no clips yet, no "undefined/NaN". Screenshots in the built-in browser. | Page-by-page pass with fixes committed; `tests/next-quality` extended | Sonnet |
| A6 | **MB3: layered lineup recommender** in `bot/lineuprec.js` (level, then commitment, then check-in order) with the five tests listed in `PLANNING/BOT-SPLIT.md`. It ships before the split and needs no new Discord app. | Tests pass; no-preference output equals today's | Opus |
| A7 | **MB1/MB2/MB4/MB5 as code behind unconfigured apps.** The Matchday and Rush apps lend their commands to core until they are configured, so the command moves, transition replies, `/matchday create`, `pref_pos` migration and select, Rush move and LFG can be written and tested now, then switched on by B3. | All waves merged with tests; nothing changes for members until the apps exist | Sonnet |
| A8 | **MB6 Rush queue manager code** per `PLANNING/RUSH-QUEUE.md` (crew multi-select, one always-latest board, green light, failed goes next, anonymous report), behind the unconfigured Rush app. | Spec tests pass; works on core until B3 | Opus |

## B. Needs the owner (Claude cannot do these)

| # | What | Why Claude cannot | Unblocks |
|---|---|---|---|
| B1 | **Worker host decision.** Keep `phoenix-bot.norexunited.workers.dev` or move to a Phoenix-named Cloudflare account/subdomain, then give the new name. | Needs the owner's Cloudflare account and a deploy; touches OAuth redirect in the Discord portal | Last NOREX string in `config.json`, `live.json`, `wrangler.toml`, secrets registry |
| B2 | **Founded date.** | Not stated anywhere; no invented facts | `config.json` `brand.founded`, `phoenix/live.json` |
| B3 | **Create the "Phoenix Matchday" and "Phoenix Rush" apps** in the Developer Portal, set tokens (`bash bot/set-tokens.sh MATCHDAY RUSH`), add app IDs and public keys to `wrangler.toml`. | Portal login and secrets are the owner's | Switches on A7 |
| B4 | ~~Queue manager source~~ **Resolved 2026-11-10**: the owner described it; spec is `PLANNING/RUSH-QUEUE.md`. Still needs B3 (the Rush app) to go live; confirm the queue and staff-report channel names. | – | MB6 live |
| B5 | **DJ bots host.** Pick a place to run the music bots (they cannot run on the Worker). | Hosting account and cost | DJ bots |
| B6 | **Release the club docs** (0053 seed is on hold: nothing pinned or posted). | Announcing to members is the owner's call | Docs live |
| B7 | **Uncommitted bot icon work** (`bot/icons/make_phoenix_icons_v2.py`, `bot/icons/phoenix/v2/*-sheet.png`): commit or discard. | The owner's in-progress art | Clean working tree |
| B8 | **Public launch go-ahead**: the site is `noindex` and `robots.txt` blocks all. Say when to open it. | Launch timing | Search visibility |

Order of work: A1, A3, A4, A5 (cheap, Sonnet), then A2 and A6 (Opus), then A7. B items run in parallel whenever the owner has time; B3 and B1 unlock the most.

## Added 2026-11-10: config-driven channels (cross-cutting)

- **A9 (Opus)**: audit every bot module and site page for hardcoded channel or role names/IDs (`wrangler.toml` vars, `config.json`, string literals) and move each to an Organization-config purpose; add the missing purposes to `CHANNEL_PURPOSES`; give managers one slash command (`/setup channel` and `/setup role`, purpose + the current channel or a chosen role) that writes the same `discord_channels` / `discord_roles` rows the website edits; test that each feature reads its channel from config and that site edits and the command produce identical rows. Do this before A8 so the queue uses it.
