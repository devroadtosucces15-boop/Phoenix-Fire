Model: sonnet (claude-sonnet-5-5)   Item: PF-035 Shared tooltip replacing browser titles and the 10 web/*.js copies (amber border, key hint) (the NEXT row of LIBRARY/roadmap.json).

Repo: /home/mrsuccess/Phoenix-Fire, branch cut from origin/main (use a worktree). Read CLAUDE.md, PLANNING/SESSION-HANDOFF.md sections 1, 3, 4, 5, 6, LIBRARY/README.md, LIBRARY/CLAIMS.md, the PF-034 row of LIBRARY/roadmap.json and PLANNING/PF-029-COMPONENTS-MOTION.md. Add your CLAIMS row before editing.

## State right now
- Done: PF-029 (tap areas), PF-030 (labels: `tests/a11y-labels.test.mjs`), PF-031 (header fit: `tests/header-fit.test.mjs`), PF-032 (effects: `tests/effects.test.mjs`), PF-033 (`tests/roving.test.mjs`), PF-034 (menus: `next/static/menus.js`, `tests/menus-keys.test.mjs`). Keep all green. Note `tests/menus.test.mjs` is the older PF-019 page-list test, do not overwrite it.
- PF-034 left: `menus.js` handles Esc, outside tap, arrows and focus return for account, bell, navigator, dock and owner menus by closing through the opener's click. Not checked in a real browser. The classic `web/app.js` account menu and mega nav are not in the Phoenix build and were left alone.
- PF-035 scope: One tooltip with hover and keyboard focus. Replaced family by family; each family keeps its screenshot proof. Reuse the shared-script pattern (roving.js, menus.js): one script linked in `next/lib/ui.mjs`, no page markup rewrites. Check tests/ for an existing file name before creating a test.

## Do next
1. One item only, PF-035. Design talk uses screenshots; keyboard logic is checked with tests.
2. node tools/library/sync.mjs, node tests/library.test.mjs, node phoenix/build.mjs --out site, brand and leak tests, commit, push with gh, merge to main.
3. PF-035 DONE with doneLog, next item NEXT, write the next prompt, remove your CLAIMS row. Do not start the next item.

## Gotchas
- Sandbox blocks writes to the worktree git dir: run git add/commit unsandboxed. `cp` is interactive here; use `command cp -f`.
- Tests overwrite site/; rebuild with node phoenix/build.mjs --out site.
- Headless browser checks need the sandbox off and a server started with run_in_background (a server started in a normal call dies with its shell).
