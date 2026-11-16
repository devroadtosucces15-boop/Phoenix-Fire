Model: sonnet (claude-sonnet-5-5)   Item: PF-009 Optional additions R18 to R22 and staff sweep follow-ups R24 to R29 (take ONE of them per session; the roadmap row says so)

Repo: /home/mrsuccess/Phoenix-Fire. Cut a branch from origin/main (`git switch -c <name> origin/main`, run unsandboxed; if staged data files block it, use `git switch -m <name>`; if the branch name already exists, `git switch -m` to it). Read CLAUDE.md,
PLANNING/SESSION-HANDOFF.md sections 1 to 5, LIBRARY/README.md and the PF-009 row of LIBRARY/roadmap.json. The R-items are listed in `.site-context/spec/REFACTOR.md` when present
(it may be missing in a fresh checkout) and in `PLANNING/DOCK-HUB-DETAILS.md` ("Still open later"); `PLANNING/NEXT-ITEMS-PROMPT.md` has more. Several R20 to R22 pieces were
already built and are guarded by `tests/deeplink.test.mjs` (staff tab data-dl, split locker mounts): confirm what is still open before building.

## State right now
- PF-008 is DONE: the deep-link helper, link resolver and `members.html#...` forwarder were already built; nothing stale. Added `tests/forwarder.test.mjs` (every forwarder target and every static `page.html#anchor` resolves in the Phoenix build). Real-browser check at 390 and 1440 passed.
- PF-026 is DONE: visual roadmap at http://127.0.0.1:4577/roadmap (`node tools/brain/serve.mjs`) and the private Artifact "Phoenix Roadmap" (link in `LIBRARY/README.md`). At the end of your session run `node tools/brain/roadmap-page.mjs` and republish that Artifact (handoff section 7 step 7), and give your item `outcome` and `behavior` text in `roadmap.json` if it is new.
- PF-022 (Control Center CRM, DJ bridge push or poll) waits on an owner decision: do not start it, and PF-023 follows it. PF-005, PF-006, PF-007 and PF-025 are owner steps.
- Write a fresh usage snapshot first (`node tools/brain/usage.mjs write --five <n> --week <n>`, numbers from the app usage tool); at 80% or more stop and report. Usage was 89% (5-hour) on 2026-11-16 around 15:15 UTC; the window resets about 15:50 UTC.

## Do next, in order
1. Check LIBRARY/CLAIMS.md and claim the files you will touch.
2. Pick ONE R item from PF-009, find what is already built, build only the gap. Phoenix branding on everything it touches; add or extend a test.
3. Tests, `node tools/library/sync.mjs`, `node tests/library.test.mjs`, `node tests/run.mjs`. Commit, push with the gh helper (unsandboxed), merge to main. If R items remain, keep PF-009 as NEXT with a shorter row; else mark it DONE and set PF-010 NEXT. Write the next prompt.

## Gotchas
- Tests overwrite `site/`: rebuild after any test run (`node phoenix/build.mjs --out site`). A hook rewrites Bash calls with an `rtk` prefix and auto mode asks you to reissue them exactly.
- The sandboxed shell has its own private /tmp/claude-1000; unsandboxed commands cannot see files written there. Put shared scratch inside the worktree and delete it.
- A headless Chrome check is easy: serve the built dir, launch `google-chrome --headless=new --remote-debugging-port`, drive it over CDP with node's global WebSocket (unsandboxed).
- The design test "score card 1200 x 500 PNG" fails only where Chrome cannot launch (sandbox).
