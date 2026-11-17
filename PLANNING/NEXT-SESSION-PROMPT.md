Model: sonnet (claude-sonnet-5-5)   Item: PF-024 Side roadmap Items 8 to 25: bot cleanup and new bot features (Items 8, 9 and 10 are DONE; take Item 11, the wheel and pin tool)

Repo: /home/mrsuccess/Phoenix-Fire, branch cut from origin/main. Read CLAUDE.md, then PLANNING/SESSION-HANDOFF.md sections 1, 3, 4, 5, 6, then
LIBRARY/README.md, LIBRARY/CLAIMS.md, the PF-024 row of LIBRARY/roadmap.json and plan sections 5c of PLANNING/SIDE-ROADMAP-eager-yawning-lovelace.md.

## State right now
- PF-022, PF-023 and PF-024 Items 8 (duplicate-post fix: `bot/once.js`) and 9 (Translator: `bot/translate.js`, shared AI counter `bot/aibudget.js`, `spendAi` before any new `env.AI.run`) and 10 (Quote card: `bot/quotecard.js`, picture through Images + R2) are DONE. Owner steps: PLANNING/PF-022-GO-LIVE.md, PF-023-GO-LIVE.md, PF-024-GO-LIVE.md.
- Still open from Item 8 (inbox, small): one owner app per output (`events.discord_app`), CI `result:<match>` claim, board-id compare-and-set, `/matchday` read replies ephemeral. The DJ work and the command cleanup of Item 8 come later.
- Any new Worker route a staff tool uses goes into `ROUTES` in `bot/ccpermissions.js` (tests/cc-permissions.test.mjs).
- `node tests/run.mjs` needs free space in /tmp (tests leave dirs there; check `df /tmp`); a flaky cardstudio timing failure: run `node tests/cardstudio.test.mjs` alone.

## Do next
1. One item per session: take Item 11 (wheel and pin tool), plan Item 11 in PLANNING/SIDE-ROADMAP-eager-yawning-lovelace.md (line ~138). (a) Real spinning wheel: `/wheel` today is a static banner and an instant winner (`bot/fun.js` ~112-148). Cheapest honest option first: a fake spin by editing the message a few times (size S); a site live wheel needs a Durable Object (M); a rendered GIF has no encoder here (L). Selectable duration, entries, weights, remove winner, history. (b) Pin tool: managers make a message persistent (re-posted so it stays newest, auto-cleaning like the Rush board; there are no Discord pin calls today). Channels from Organization config (a new purpose, never a name or ID in code). List owner decisions, do not guess. Claim files in LIBRARY/CLAIMS.md.
2. Channels and roles from Organization config; Phoenix branding on every output with a test that fails on a NOREX name, colour or crest; registry entry for new outputs.
3. `node tools/library/sync.mjs`, `node tests/library.test.mjs`, `node tests/run.mjs`, `node phoenix/build.mjs --out site`, commit, push with gh, merge to main, update only the PF-024 row (Item 9 done, Item 10 next), rewrite this file.

## Gotchas
- The worktree may live on /mnt/DEV_WORK (a symlink at the old path): the Bash sandbox treats it as read-only, so edits and tests need an unsandboxed Bash. Export `TMPDIR` to a DEV_WORK folder when /tmp is nearly full (tests copy the site into the temp dir). Run the full `node tests/run.mjs` (with its build); `--no-build` fails page checks.
- Tests need a built site/ (node phoenix/build.mjs --out site) and overwrite it. Roadmap text must not contain NOREX hex colours.
- Never write a secret value; owner-only steps (deploy, migrations, Discord portal) are listed, not done.
