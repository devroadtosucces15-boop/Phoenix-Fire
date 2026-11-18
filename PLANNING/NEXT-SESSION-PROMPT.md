Model: sonnet (claude-sonnet-5-5)   Item: PF-024 Side roadmap Items 8 to 25: bot cleanup and new bot features (Items 8 to 16 are DONE; take Item 17, the absence notice command)

Repo: /home/mrsuccess/Phoenix-Fire, branch cut from origin/main. Read CLAUDE.md, then PLANNING/SESSION-HANDOFF.md sections 1, 3, 4, 5, 6, then
LIBRARY/README.md, LIBRARY/CLAIMS.md, the PF-024 row of LIBRARY/roadmap.json and plan sections 5c of PLANNING/SIDE-ROADMAP-eager-yawning-lovelace.md (Item 15, line ~145, and the Constraints paragraph).

## State right now
- Done: PF-022, PF-023, PF-024 Items 8 to 16. Item 16 (`bot/biocard.js`, one bio card per member posted then edited, migration 0072, purpose `member_bios`, flag `bioCard` owner). Item 14 (`bot/serverintel.js`, /counselor, flag `serverIntel` off) and Item 15 (`bot/mascot.js`, /mascot quote|ask|roast|mute, flag `mascot` off, AI shares via `FEATURE_SHARE` in `bot/aibudget.js`). Owner steps for both are in PLANNING/PF-024-GO-LIVE.md.
- Still open from Item 8 (inbox, small): one owner app per output (`events.discord_app`), CI `result:<match>` claim, board-id compare-and-set, `/matchday` read replies ephemeral. DJ work and command cleanup of Item 8 come later.
- Any new Worker route a staff tool uses goes into `ROUTES` in `bot/ccpermissions.js` (tests/cc-permissions.test.mjs). A new banner key needs `banner-<key>.png` in tools/bot-audit/out/cards plus its entry in cards.json (render just that job; `studio.mjs check --strict` must say 0 to fix). Regenerate `bot/registry.gen.js` with `node tools/bot-studio/studio.mjs registry`.
- `node tests/run.mjs` needs free space in /tmp (it was full): set `TMPDIR` to a folder on the home disk. A flaky cardstudio timing failure: run `node tests/cardstudio.test.mjs` alone.

## Do next
1. One item per session: Item 17 (absence notice command, tools app) in PLANNING/SIDE-ROADMAP-eager-yawning-lovelace.md (Items 16 to 18 section): members submit that they will be away or play less (optional dates, a free-text reason private to managers); posts a formatted card to a managers channel (purpose `absence_notices`) with an approve/acknowledge button, expiry and a status managers see on the Control Center and the Dugout/lineup views. Needs a migration 0073 or higher (latest used: 0072). Owner decision to ask only if unclear: who counts as a manager for the acknowledge button (default: the manager permission group).
2. Channels and roles from Organization config; Phoenix branding on every output with a test that fails on a NOREX name, colour or crest; registry entry for new outputs; the embed rule (Components V2 panel, icons, separators, footer).
3. `node tools/library/sync.mjs`, `node tests/library.test.mjs`, `node tests/run.mjs`, `node phoenix/build.mjs --out site`, commit, push with gh, merge to main, update only the PF-024 row, rewrite this file.

## Gotchas
- The worktree may live on /mnt/DEV_WORK: the Bash sandbox treats it as read-only there, so edits and tests may need an unsandboxed Bash. Set `TMPDIR` to a roomy folder when /tmp is nearly full. Run the full `node tests/run.mjs` (with its build); `--no-build` fails page checks.
- Tests need a built site/ (node phoenix/build.mjs --out site) and overwrite it. Roadmap text must not contain NOREX hex colours.
- Never write a secret value; owner-only steps (deploy, migrations, Discord portal) are listed, not done.
