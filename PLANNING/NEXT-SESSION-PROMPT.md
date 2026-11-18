Model: sonnet (claude-sonnet-5-5)   Item: PF-024 Item 24: the shared points economy (Items 8 to 19, 21, 22 and 25 are DONE; Item 20 is blocked on the owner's link; Item 23 arcade comes last)

Repo: /home/mrsuccess/Phoenix-Fire, branch cut from origin/main. Read CLAUDE.md, then PLANNING/SESSION-HANDOFF.md sections 1, 3, 4, 5, 6, then
LIBRARY/README.md, LIBRARY/CLAIMS.md, the PF-024 row of LIBRARY/roadmap.json and the Item 25 text (line ~172, "Test view command") of PLANNING/SIDE-ROADMAP-eager-yawning-lovelace.md plus its Constraints paragraph.

## State right now
- Done: PF-022, PF-023, PF-024 Items 8 to 19, 21, 22 and 25 (15 of 18 = 83%). Item 25 (`bot/testview.js`, `/testview` in the core app, samples generated into `bot/testview.gen.js` by `node tools/bot-studio/studio.mjs testview`; after any new output or command run `studio.mjs capture`, `registry`, `testview`, `check --strict`).
- Item 20 stays blocked on the owner's link. Do not start it.
- Item 24 (SIDE-ROADMAP line ~170): exists today `bot/points.js` (`users.points`, `points_log`, migration 0025, categories match, attendance, community, behaviour, `awardPoints()`, `GET /api/points` and `/api/points/leaderboard`, `/points`, flag `points`), `bot/badges.js`. Not wired: match performance points (data comes from `scripts/fetch.mjs` in Actions with no D1: follow the keyed-HTTP pattern in `bot/crawl.js`).
- Owner decisions recorded 2026-11-18: points RESET each season; points are SPENDABLE CREDIT (a `spend` entry type, balances never negative, audit trail like `config_audit`); a WEEKLY balance DM (owner-controlled DM kind in the DM matrix, with breakdown); the RULES are EDITABLE in the Control Center (a `setting:` area in `bot/ccsettings.js` or a tool, routes into ROUTES in `bot/ccpermissions.js`); NO daily caps. Price list is not decided: ship an empty/editable list, list it for the owner. Message and engagement counts need a source (interaction counts we already receive; message counts only by REST polling, see Items 14/15 privacy notes): build only what has a source and list the rest.
- Then Item 23 (arcade) last: large, check reuse first, list the Discord Activity hosting decision for the owner.
- Open inbox (small): Item 8 (one owner app per output, CI `result:<match>` claim, board-id compare-and-set, `/matchday` read replies ephemeral); Item 19 (season totals and medals not in D1); Item 21 (no site GIF page, no "post again", no GIF limits tool); Item 22 (importer, reason on Reject, DM to member, renaming); Item 25 (no per-test rule overrides beyond `as`, no site tool, `/bot-new` does not yet add a sample step).
- Latest migration used: 0076 (Item 25 added none). Use 0077 or higher (check bot/migrations/).
- New Worker routes a staff tool uses go into `ROUTES` in `bot/ccpermissions.js` (add paths to PATHS in tests/cc-permissions.test.mjs). A new banner key needs `banner-<key>.png` in tools/bot-audit/out/cards plus its cards.json entry (see earlier commits), or reuse an existing family in `BANNER_BY_COMMAND`. New channel purposes go in `bot/orgconsts.js` and `bot/orgconfig.js` with a test that the module reads its channel from config.
- `node tests/run.mjs` needs a roomy TMPDIR (/tmp can be nearly full: use a folder inside the worktree, e.g. `.claude/tmp25`, never commit it). Tests need a built site first (`node phoenix/build.mjs --out site`). Known environment failures: `tests/design.test.mjs` "renderer: the score card ... Chrome exited (null)" (Chrome in the sandbox) and a cardstudio timing flake (run `node tests/cardstudio.test.mjs` alone).
- The Bash hook (rtk) rewrites commands, and auto mode then asks to reissue the exact quoted input; do that. Quote-heavy `node -e` one-liners break in zsh: write a script file in the scratchpad.

## Do next
1. One item per session: Item 24 (points economy) with the decisions above. Extend `bot/points.js`, do not fork it; one ledger shared by bot and site; Phoenix branding with a test that fails on a NOREX name, colour or crest; embed rule (Components V2 panel, icons, separators, footer); registry entries; flag `points` stays as is, new parts owner first.
2. Channels and roles from Organization config; follow the Item 18/19/22 wiring list (copy from `git show` of those commits).
3. `node tools/library/sync.mjs`, `node tests/library.test.mjs`, `node tests/run.mjs`, `node phoenix/build.mjs --out site`, commit, push with gh, merge to main, update only the PF-024 row (percent = items done of 18; 16 of 18 = 89 after Item 24), rewrite this file for Item 23 (arcade) unless the owner has sent the Item 20 link.

## Gotchas
- The worktree may live on /mnt/DEV_WORK: the Bash sandbox treats it as read-only there, so edits and tests may need an unsandboxed Bash. Run the full `node tests/run.mjs` (with its build); `--no-build` fails page checks.
- Tests need a built site/ (node phoenix/build.mjs --out site) and overwrite it. Roadmap text must not contain NOREX hex colours.
- Never write a secret value; owner-only steps (deploy, migrations, Discord portal, command registration, flag flips, setting channels) are listed, not done.
