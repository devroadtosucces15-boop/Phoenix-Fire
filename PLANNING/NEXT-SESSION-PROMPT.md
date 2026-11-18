Model: sonnet (claude-sonnet-5-5)   Item: PF-024 Side roadmap Items 8 to 25: bot cleanup and new bot features (Items 8 to 14 are DONE; take Item 15, mascot and roast, once the owner has answered its guardrail questions, otherwise Item 16 player bio card)

Repo: /home/mrsuccess/Phoenix-Fire, branch cut from origin/main. Read CLAUDE.md, then PLANNING/SESSION-HANDOFF.md sections 1, 3, 4, 5, 6, then
LIBRARY/README.md, LIBRARY/CLAIMS.md, the PF-024 row of LIBRARY/roadmap.json and plan sections 5c of PLANNING/SIDE-ROADMAP-eager-yawning-lovelace.md (Item 15, line ~145, and the Constraints paragraph).

## State right now
- Done: PF-022, PF-023, PF-024 Items 8 to 14. Item 14 (server intelligence and counselor): `bot/serverintel.js`, `/counselor` (managers), weekly REST sampling of public channels, numbers only, flag `serverIntel` ships `off` (kill switch), AI share 20% via `spendAi(env, { feature: 'intel' })` in `bot/aibudget.js` (`FEATURE_SHARE`). Its profile has `voice` ({ vibe, topics, busiest }) in D1 meta `sv_intel` for the mascot. Owner steps for Item 14 (Message Content intent, disclosure, flag) are in PLANNING/PF-024-GO-LIVE.md.
- Still open from Item 8 (inbox, small): one owner app per output (`events.discord_app`), CI `result:<match>` claim, board-id compare-and-set, `/matchday` read replies ephemeral. DJ work and command cleanup of Item 8 come later.
- Any new Worker route a staff tool uses goes into `ROUTES` in `bot/ccpermissions.js` (tests/cc-permissions.test.mjs). A new banner key needs `banner-<key>.png` in tools/bot-audit/out/cards (render just that job; see `studio.mjs check --strict`).
- `node tests/run.mjs` needs free space in /tmp (check `df /tmp`); a flaky cardstudio timing failure: run `node tests/cardstudio.test.mjs` alone.

## Do next
1. One item per session: Item 15 (mascot and roast), commands in an existing app. Owner decisions needed BEFORE building (ask in the brief, do not guess): (a) how the mascot "jumps in when Phoenix is mentioned": the Worker is interactions-only, so options are slash/context-menu triggers only, or a small gateway process with the Message Content intent (Item 14 chose REST sampling, no gateway); (b) roast guardrails: no slurs or protected-trait attacks, per-member opt-out (needs a small table), managers can mute it, rate limits, never names Phoenix in a roast; (c) AI budget share for the mascot (Item 14 took 20%); (d) whether the roast may use Item 14's profile and avatars/names.
2. Channels and roles from Organization config; Phoenix branding on every output with a test that fails on a NOREX name, colour or crest; registry entry for new outputs; kill switch flag default off.
3. `node tools/library/sync.mjs`, `node tests/library.test.mjs`, `node tests/run.mjs`, `node phoenix/build.mjs --out site`, commit, push with gh, merge to main, update only the PF-024 row, rewrite this file.

## Gotchas
- The worktree may live on /mnt/DEV_WORK: the Bash sandbox treats it as read-only there, so edits and tests may need an unsandboxed Bash. Set `TMPDIR` to a roomy folder when /tmp is nearly full. Run the full `node tests/run.mjs` (with its build); `--no-build` fails page checks.
- Tests need a built site/ (node phoenix/build.mjs --out site) and overwrite it. Roadmap text must not contain NOREX hex colours.
- Never write a secret value; owner-only steps (deploy, migrations, Discord portal) are listed, not done.
