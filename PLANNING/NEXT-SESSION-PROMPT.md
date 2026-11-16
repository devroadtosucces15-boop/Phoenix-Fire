Model: sonnet (claude-sonnet-5-5)   Item: PF-009 Optional additions R18 to R22 and staff sweep follow-ups R24 to R29 (take ONE of them per session; the roadmap row says so)

Repo: /home/mrsuccess/Phoenix-Fire. Cut a branch from origin/main (`git switch -c <name> origin/main`, run unsandboxed; if staged data files block it, use `git switch -m <name>`; if the branch name already exists, `git switch -m` to it). Read CLAUDE.md,
PLANNING/SESSION-HANDOFF.md sections 1 to 5, LIBRARY/README.md and the PF-009 row of LIBRARY/roadmap.json. The R-items are listed in `.site-context/spec/REFACTOR.md` when present
(it may be missing in a fresh checkout) and in `PLANNING/DOCK-HUB-DETAILS.md` ("Still open later"); `PLANNING/NEXT-ITEMS-PROMPT.md` has more. Several R20 to R22 pieces were
already built and are guarded by `tests/deeplink.test.mjs` (staff tab data-dl, split locker mounts): confirm what is still open before building.

## State right now
- PF-009 R22 is DONE (2026-11-16): axe-core 4.10.2 in headless Chrome at 390 wide on 12 phone pages shows 0 for aria-required-children, aria-allowed-attr, aria-allowed-role, aria-required-parent and target-size. Fixed match-night day buttons (no listitem role) and the install banner (44px close, lifted above the dock button). Guarded in `tests/forwarder.test.mjs`. Colour contrast and the classic link wording stay a written owner question.
- PF-009 still open: R23 (one brief per assigned wishlist item in `.site-context/handoffs/` with `Status: open`; the list of items is missing, ask the owner or find it) and R24 to R29 (their definitions lived in `.site-context/spec/REFACTOR.md`, not in the repo; the owner must restate them). If neither can be recovered, mark PF-009 DONE with that written down and make PF-010 NEXT.
- PF-022 waits on an owner decision (do not start; PF-023 follows). PF-005, PF-006, PF-007 and PF-025 are owner steps.
- Write a fresh usage snapshot first (`node tools/brain/usage.mjs write --five <n> --week <n>`); at 80% or more stop and report.
- At the end run `node tools/brain/roadmap-page.mjs` and republish the private Artifact "Phoenix Roadmap" (handoff section 7 step 7).

## Do next, in order
1. Check LIBRARY/CLAIMS.md and claim the files you will touch.
2. Pick ONE R item from PF-009, find what is already built, build only the gap. Phoenix branding on everything it touches; add or extend a test.
3. Tests, `node tools/library/sync.mjs`, `node tests/library.test.mjs`, `node tests/run.mjs`. Commit, push with the gh helper (unsandboxed), merge to main. If R items remain, keep PF-009 as NEXT with a shorter row; else mark it DONE and set PF-010 NEXT. Write the next prompt.

## Gotchas
- Tests overwrite `site/`: rebuild after any test run (`node phoenix/build.mjs --out site`). A hook rewrites Bash calls with an `rtk` prefix and auto mode asks you to reissue them exactly.
- The sandboxed shell has its own private /tmp/claude-1000; unsandboxed commands cannot see files written there. Put shared scratch inside the worktree and delete it.
- A headless Chrome check is easy: serve the built dir, launch `google-chrome --headless=new --remote-debugging-port`, drive it over CDP with node's global WebSocket (unsandboxed).
- The design test "score card 1200 x 500 PNG" fails only where Chrome cannot launch (sandbox).
