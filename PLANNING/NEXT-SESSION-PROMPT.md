Model: sonnet (claude-sonnet-5-5)   Item: PF-031 Header fit and badges (the NEXT row of LIBRARY/roadmap.json).

Repo: /home/mrsuccess/Phoenix-Fire, branch cut from origin/main (use a worktree). Read CLAUDE.md, PLANNING/SESSION-HANDOFF.md sections 1, 3, 4, 5, 6, LIBRARY/README.md, LIBRARY/CLAIMS.md, the PF-031 row of LIBRARY/roadmap.json and PLANNING/PF-029-COMPONENTS-MOTION.md. Add your CLAIMS row before editing.

## State right now
- Done: PF-029 (tap areas), PF-030 (labels: `tools/a11y/scan.mjs`, `tests/a11y-labels.test.mjs`; keep it green).
- PF-031 scope: header fits 375 px with the avatar fully inside, logo shortens to PHOENIX on small phones, alert badge shows 9+. Design work: screenshots before and after at 360, 375 and 390 px (header is in `next/lib/ui.mjs`, `next/static/header.css`, `header.js`).

## Do next
1. One item only, PF-031. Screenshot the header at 360/375/390 first; fix; add a test for the 9+ badge and the shortened logo class.
2. node tools/library/sync.mjs, node tests/library.test.mjs, node phoenix/build.mjs --out site, brand and leak tests, commit, push with gh, merge to main.
3. PF-031 DONE with doneLog, next item NEXT, write the next prompt, remove your CLAIMS row. Do not start the next item.

## Gotchas
- Sandbox blocks writes to the worktree git dir: run git add/commit unsandboxed. `cp` is interactive here; use `command cp -f`.
- Tests overwrite site/; rebuild with node phoenix/build.mjs --out site.
