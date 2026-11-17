Model: sonnet (claude-sonnet-5-5)   Item: PF-024 Side roadmap Items 8 to 25: bot cleanup and new bot features (start with the duplicate-post fix, Item 8)

Repo: /home/mrsuccess/Phoenix-Fire, branch cut from origin/main. Read CLAUDE.md, then PLANNING/SESSION-HANDOFF.md sections 1, 3, 4, 5, 6, then
LIBRARY/README.md, LIBRARY/CLAIMS.md, the PF-024 row of LIBRARY/roadmap.json and plan sections 5c of PLANNING/SIDE-ROADMAP-eager-yawning-lovelace.md.

## State right now
- PF-022 (Control Center) and PF-023 (Rush matchmaking core, `bot/rushmatch.js`) are DONE. Owner steps: PLANNING/PF-022-GO-LIVE.md, PLANNING/PF-023-GO-LIVE.md.
- PF-023 leftovers (inbox, small): board-id compare-and-set in D1, offer DM registry entries (`auto:rush-offer`), the optional extras.
- Any new Worker route a staff tool uses goes into `ROUTES` in `bot/ccpermissions.js` (tests/cc-permissions.test.mjs).
- `node tests/run.mjs` can show a flaky cardstudio timing failure; run `node tests/cardstudio.test.mjs` alone to confirm.

## Do next
1. One item per session: PF-024 is split by item; take Item 8's duplicate-post fix first (`once(env, key)` helper, one owner app per output). Claim files in LIBRARY/CLAIMS.md.
2. Channels and roles from Organization config; Phoenix branding on every output with a test that fails on a NOREX name, colour or crest.
3. `node tools/library/sync.mjs`, `node tests/library.test.mjs`, `node tests/run.mjs` (design test unsandboxed), `node phoenix/build.mjs --out site`, commit, push with gh, merge to main, mark done, set the next item NEXT, rewrite this file.

## Gotchas
- Tests need a built site/ (node phoenix/build.mjs --out site) and overwrite it. Roadmap text must not contain NOREX hex colours.
- Never write a secret value; owner-only steps (deploy, migrations, Discord portal) are listed, not done.
