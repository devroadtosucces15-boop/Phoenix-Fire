Model: sonnet (claude-sonnet-5-5)   Item: PF-032 Effects clean-up, fix only (the NEXT row of LIBRARY/roadmap.json).

Repo: /home/mrsuccess/Phoenix-Fire, branch cut from origin/main (use a worktree). Read CLAUDE.md, PLANNING/SESSION-HANDOFF.md sections 1, 3, 4, 5, 6, LIBRARY/README.md, LIBRARY/CLAIMS.md, the PF-032 row of LIBRARY/roadmap.json and PLANNING/PF-029-COMPONENTS-MOTION.md. Add your CLAIMS row before editing.

## State right now
- Done: PF-029 (tap areas), PF-030 (labels: `tools/a11y/scan.mjs`, `tests/a11y-labels.test.mjs`; keep it green), PF-031 (header fit: `tests/header-fit.test.mjs`; keep it green).
- PF-032 scope: remove the pointer shadow, pause animations when the tab is hidden, stop endless idle animations (keep only those that mean something, e.g. live status). Same look. Measure running-animation counts before and after on Club, Stats and Tactics. Detail: PLANNING/PF-029-COMPONENTS-MOTION.md.

## Do next
1. One item only, PF-032. Measure first (endless animation counts on Club, Stats, Tactics), fix, add a test that fails if the pointer shadow or hidden-tab animation returns.
2. node tools/library/sync.mjs, node tests/library.test.mjs, node phoenix/build.mjs --out site, brand and leak tests, commit, push with gh, merge to main.
3. PF-032 DONE with doneLog, next item NEXT, write the next prompt, remove your CLAIMS row. Do not start the next item.

## Gotchas
- Sandbox blocks writes to the worktree git dir: run git add/commit unsandboxed. `cp` is interactive here; use `command cp -f`.
- Tests overwrite site/; rebuild with node phoenix/build.mjs --out site.
