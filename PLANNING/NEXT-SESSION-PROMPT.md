Model: sonnet (claude-sonnet-5-5)   Item: PF-004 Match-night follow-ups in code (watchlist-video picture block, offline captures, track tools/bot-studio/)

Repo: /home/mrsuccess/Phoenix-Fire. Cut a branch from origin/main (`git switch -c <name> origin/main`, run unsandboxed; if it leaves you on the old branch because of staged
data files, use `git switch -m <name>`). Read CLAUDE.md, PLANNING/SESSION-HANDOFF.md sections 1 to 5, LIBRARY/README.md and the PF-004 row of
LIBRARY/roadmap.json (details: "Match-night follow-ups (code)" in `PLANNING/PHOENIX-ROADMAP.md`). Use the `phoenix-bot-studio` skill for any change to bot output.

## State right now
- PF-003 is DONE (verify-only: 45 page loads at 390, 820 and 1440 clean, no code change). Main is green: the two red tests (brain inbox ordering, cronfun) were fixed in PR 24.
- PF-022 (Control Center CRM, DJ bridge push or poll) waits on an owner decision: do not start it, and PF-023 follows it. PF-020 is DONE (owner said "just do it" on 4d). PF-005, PF-006, PF-007 and PF-025 are owner steps.
- Usage on 2026-11-16 was 63% of the 5-hour window at the start of PF-003. Write a fresh snapshot first (`node tools/brain/usage.mjs write --five <n> --week <n>`, numbers from the app usage tool); at 80% or more stop and report.

## Do next, in order
1. Check LIBRARY/CLAIMS.md and claim `bot/watchlist.js`, `tools/bot-audit/`, `tools/bot-studio/`.
2. Fix `auto:watchlist-video` (a picture block without a url, `bot/watchlist.js`).
3. Add offline captures in `tools/bot-audit/capture-auto.mjs` for the check-in post, line-up post (suggested and final), event post with and without the roster picture, and the Check-in button reply, so `bot-studio verify` covers them.
4. Get all of `tools/bot-studio/` tracked on main (only `lib/lint.mjs` is today) and rerun `studio.mjs check` for 0 FIX.
5. Phoenix branding on everything the outputs feed; add or extend a test for any rebrand. Screenshots only for changed visuals (before and after).
6. Tests, `node tools/library/sync.mjs`, `node tests/library.test.mjs`, `node tests/run.mjs`. Commit, push with the gh helper (unsandboxed), merge to main. Mark PF-004 DONE, set the next free item NEXT (PF-008), write the next prompt.

## Gotchas
- Tests overwrite `site/`: rebuild after any test run (`node phoenix/build.mjs --out site`). A hook rewrites Bash calls with an `rtk` prefix and auto mode asks you to reissue them exactly.
- /tmp is a 12 GB RAM-backed tmpfs and filled up on 2026-11-16 (old session scratchpads, venvs and test dirs in /tmp/claude-1000 and /tmp/nxq-*, pf-*). If Bash says "Disk full", clean those or restart; a full copy of the repo is on /mnt/DEV_WORK/Backups/Phoenix-Fire-20261116/.
- The design test "score card 1200 x 500 PNG" fails only where Chrome cannot launch (sandbox).
