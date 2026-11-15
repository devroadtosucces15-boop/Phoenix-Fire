# Phoenix Fire library (single index)

Last verified: 2026-11-15

Every fact a session needs lives here or is pointed to from here, so a new session reads this index and the one roadmap item it was
given, and nothing else. Rules for using and updating it: `PLANNING/SESSION-HANDOFF.md`.

| File | What it holds | Kind | Source of truth |
|---|---|---|---|
| `ROADMAP.md` | The master roadmap: every item, its order, status, model and file lane. One item is `NEXT`. | hand | this file |
| `CLAIMS.md` | Which session is editing which files right now. Check before editing, update after. | hand | this file |
| `ASSETS.md` | What each asset group is for, and where to find the crest, icons, card looks and art. | hand | `phoenix/overlay/`, `bot/icons/phoenix/` |
| `ASSETS-INDEX.md` | Every file in those folders. | generated | the folders |
| `RESOURCES.md` | Saved links and references; points at `PLANNING/RESOURCES.md`. | hand | `PLANNING/RESOURCES.md` |
| `CREDENTIALS.md` | Where every secret lives and who owns it. Names and places only, never values. | hand | `bot/SECRETS-REGISTRY.md` |
| `DESIGN.md` | Brand tokens, theme layer, image rules, card and dock design choices. | hand | `config.json`, `phoenix/live.json`, `CLAUDE.md` |
| `BOT.md` | Bot apps, output rules, settings and where each message is drawn. | hand | `bot/apps.js`, `bot/README.md`, `tools/bot-studio/` |
| `BOT-COMMANDS.md` | Every slash command by app, with options. | generated | `bot/commanddefs.js` |
| `SITEMAP.md` | Every site page, who may see it, and the source that builds it. | hand | `next/pages/`, `phoenix/build.mjs` |

Generated files are rewritten by `node tools/library/sync.mjs`. `node tests/library.test.mjs` fails when a generated file is stale, a
hand file lost its "Last verified" date, the roadmap has no single `NEXT` item, or anything in this folder looks like a secret value.

## Granularity rule

One fact, one place. Link to the source instead of copying it. Prefer tables with one row per thing (command, page, asset group, secret,
roadmap item) over prose, so a session can find a row without reading the rest. Keep each file under about 200 lines; split when longer.
