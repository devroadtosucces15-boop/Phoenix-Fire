Model: sonnet (claude-sonnet-5-5)   Item: PF-023 Rush queue and LFG as one matchmaking system (side roadmap Item 7, plan section 5b)

Repo: /home/mrsuccess/Phoenix-Fire, branch cut from origin/main. Read CLAUDE.md, then PLANNING/SESSION-HANDOFF.md sections 1, 3, 4, 5, 6, then
LIBRARY/README.md, LIBRARY/CLAIMS.md and only the roadmap row for PF-023 plus section 5b of PLANNING/SIDE-ROADMAP-eager-yawning-lovelace.md.

## State right now
- PF-022 (Control Center) is DONE (2026-11-17), including step 9: permission matrix from the staff manifest (`level` per tool), Worker enforcement in `bot/ccpermissions.js`, signed-out and wrong-role gate, owner View as. Owner steps to take it live are in PLANNING/PF-022-GO-LIVE.md (not yours).
- PF-009 stays open but dropped from NEXT: R29 needs live Worker data or an owner login.
- Any new Worker route a staff tool uses must be added to `ROUTES` in `bot/ccpermissions.js` against a manifest tool; `tests/cc-permissions.test.mjs` fails otherwise for the listed paths.

## Do next, in order
1. Claim files in LIBRARY/CLAIMS.md. Read section 5b and the current rush files (`bot/rush*.js`, queue board) and LFG code.
2. Build the one matchmaking system the plan describes; channels and roles from Organization config, never hardcoded; Phoenix branding on every output (test that fails on a NOREX name, colour or crest).
3. `node tools/library/sync.mjs`, `node tests/library.test.mjs`, `node tests/run.mjs` (run the design test unsandboxed), rebuild `node phoenix/build.mjs --out site`, commit, push with gh, merge to main, mark PF-023 done, set the next item NEXT, write this file again.

## Gotchas
- Tests overwrite site/; rebuild with node phoenix/build.mjs --out site. Roadmap text must not contain NOREX hex colours.
- Never write a secret value; owner-only steps (deploy, migrations, Discord portal) are listed, not done.
