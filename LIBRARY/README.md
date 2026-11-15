# Phoenix Fire library (single index)

Last verified: 2026-11-15

Every fact a session needs lives here or is pointed to from here, so a new session reads this index and the one roadmap item it was
given, and nothing else. Rules for using and updating it: `PLANNING/SESSION-HANDOFF.md`.

| File | What it holds | Kind | Source of truth |
|---|---|---|---|
| `roadmap.json` | The roadmap data: every item with status, size, effort, importance, percent, notes and done log, plus the inbox. Edit this. | hand | this file |
| `ROADMAP.md` | The master roadmap as a readable page with phase and project percent. One item is `NEXT`. | generated | `roadmap.json` |
| `CLAIMS.md` | Which session is editing which files right now. Check before editing, update after. | hand | this file |
| `ASSETS.md` | What each asset group is for, and where to find the crest, icons, card looks and art. | hand | `phoenix/overlay/`, `bot/icons/phoenix/` |
| `ASSETS-INDEX.md` | Every file in those folders. | generated | the folders |
| `RESOURCES.md` | Saved links and references; points at `PLANNING/RESOURCES.md`. | hand | `PLANNING/RESOURCES.md` |
| `CREDENTIALS.md` | Where every secret lives and who owns it. Names and places only, never values. | hand | `bot/SECRETS-REGISTRY.md` |
| `DESIGN.md` | Brand tokens, theme layer, image rules, card and dock design choices. | hand | `config.json`, `phoenix/live.json`, `CLAUDE.md` |
| `BOT.md` | Bot apps, output rules, settings and where each message is drawn. | hand | `bot/apps.js`, `bot/README.md`, `tools/bot-studio/` |
| `BOT-COMMANDS.md` | Every slash command by app, with options. | generated | `bot/commanddefs.js` |
| `FLAGS-INDEX.md` | Every feature flag and the level that may use it. | generated | `config.json` `features` |
| `SITEMAP.md` | What each page group is for, audience rules and the rules for adding a page. | hand | `next/pages/`, `phoenix/build.mjs` |
| `SITEMAP-INDEX.md` | Every built page, its title, audience and source module. | generated | a fresh `phoenix/build.mjs` build |

The live dashboard over these files is `tools/brain/` (`node tools/brain/serve.mjs`, then open http://127.0.0.1:4577; tabs Roadmap, Maps, Inputs and outputs, Brainstorm, Libraries, References, Credentials). It reads this folder, `PLANNING/RESOURCES.md` and `bot/SECRETS-REGISTRY.md`, refreshes when they change, and never shows a secret value. Brainstorm ideas are files in `LIBRARY/inbox/` (one per idea, status open, tackled or dropped); `node tools/brain/reminders.mjs` lists the open ones at the end of a session.

Generated files are rewritten by `node tools/library/sync.mjs`. `node tests/library.test.mjs` fails when a generated file is stale, a
hand file lost its "Last verified" date, the roadmap has no single `NEXT` item, or anything in this folder looks like a secret value.

## Granularity rule

One fact, one place. Link to the source instead of copying it. Prefer tables with one row per thing (command, page, asset group, secret,
roadmap item) over prose, so a session can find a row without reading the rest. Keep each file under about 200 lines; split when longer.
