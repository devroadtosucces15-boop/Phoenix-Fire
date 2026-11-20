Model: sonnet (claude-sonnet-5-5)   Item: PF-036 Loading and empty states: same-shape placeholders with aria-busy, reasons and next steps (the NEXT row of LIBRARY/roadmap.json).

Repo: /home/mrsuccess/Phoenix-Fire, branch cut from origin/main (use a worktree). Read CLAUDE.md, PLANNING/SESSION-HANDOFF.md sections 1, 3, 4, 5, 6, LIBRARY/README.md, LIBRARY/CLAIMS.md, the PF-035 row of LIBRARY/roadmap.json and PLANNING/PF-029-COMPONENTS-MOTION.md. Add your CLAIMS row before editing.

## State right now
- Done: PF-029 (tap areas), PF-030 (labels: `tests/a11y-labels.test.mjs`), PF-031 (header fit: `tests/header-fit.test.mjs`), PF-032 (effects: `tests/effects.test.mjs`), PF-033 (`tests/roving.test.mjs`), PF-034 (menus: `next/static/menus.js`, `tests/menus-keys.test.mjs`), PF-035 (tooltip: `next/static/tooltip.js` + `tooltip.css`, `tests/tooltip.test.mjs`). Keep all green. Note `tests/menus.test.mjs` is the older PF-019 page-list test, do not overwrite it.
- PF-035 left: one shared tooltip for title and data-tip; titles are moved to data-tip on first hover or focus. Not checked in a real browser (browser pane refused localhost; try Playwright with the sandbox off). The classic `web/*.js` data-tip copies are not in the Phoenix build and were left alone.
- PF-036 scope: Nothing blank while loading; every empty state says why and offers one action (shimmer and bigger empty icon as the owner accepted, see `PLANNING/PF-029-COMPONENTS-MOTION.md`). Reuse the shared-script pattern (tooltip.js, menus.js): one script plus css linked in `next/lib/ui.mjs`, `aria-busy` on loading regions. Check tests/ for an existing file name before creating a test.

## Do next
1. One item only, PF-036. Design talk uses screenshots; keyboard logic is checked with tests.
2. node tools/library/sync.mjs, node tests/library.test.mjs, node phoenix/build.mjs --out site, brand and leak tests, commit, push with gh, merge to main.
3. PF-036 DONE with doneLog, next item NEXT, write the next prompt, remove your CLAIMS row. Do not start the next item.

## Gotchas
- Sandbox blocks writes to the worktree git dir: run git add/commit unsandboxed. `cp` is interactive here; use `command cp -f`.
- Tests overwrite site/; rebuild with node phoenix/build.mjs --out site.
- Headless browser checks need the sandbox off and a server started with run_in_background (a server started in a normal call dies with its shell).
