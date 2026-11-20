Model: sonnet (claude-sonnet-5-5)   Item: PF-037 Forms: 44 px fields with a leading icon, helper and error text, clear button on searches (the NEXT row of LIBRARY/roadmap.json).

Repo: /home/mrsuccess/Phoenix-Fire, branch cut from origin/main (use a worktree). Read CLAUDE.md, PLANNING/SESSION-HANDOFF.md sections 1, 3, 4, 5, 6, LIBRARY/README.md, LIBRARY/CLAIMS.md, the PF-036 row of LIBRARY/roadmap.json and PLANNING/PF-029-COMPONENTS-MOTION.md. Add your CLAIMS row before editing.

## State right now
- Done: PF-029 (tap areas), PF-030 (labels: `tests/a11y-labels.test.mjs`), PF-031 (header fit: `tests/header-fit.test.mjs`), PF-032 (effects), PF-033 (`tests/roving.test.mjs`), PF-034 (menus: `tests/menus-keys.test.mjs`), PF-035 (tooltip), PF-036 (`next/static/states.js` + `states.css`, `tests/states.test.mjs`). Keep all green. `tests/menus.test.mjs` is the older PF-019 test, do not overwrite it.
- PF-036 left: `M.skeleton(el, rows, shape)` (line, card, row, table) and `PhoenixStates.emptyHtml / skeletonHtml`; empty states get a reason and one action filled in automatically (default 'Back to Home'). Not checked in a real browser (try Playwright with the sandbox off). Per-page `empty()` helpers in `next/static/*.js` still exist; new code should use `PhoenixStates.emptyHtml`.
- PF-037 scope: 44 px form fields with a leading icon, helper and error text, clear button on searches; labels are already guarded by `tests/a11y-labels.test.mjs`, keep it green. Orange focus ring was NOT ticked by the owner: do not add it. Follow the shared-script pattern (one script plus css linked in `next/lib/ui.mjs`). Check tests/ for an existing file name before creating a test.

## Do next
1. One item only, PF-036. Design talk uses screenshots; keyboard logic is checked with tests.
2. node tools/library/sync.mjs, node tests/library.test.mjs, node phoenix/build.mjs --out site, brand and leak tests, commit, push with gh, merge to main.
3. PF-036 DONE with doneLog, next item NEXT, write the next prompt, remove your CLAIMS row. Do not start the next item.

## Gotchas
- Sandbox blocks writes to the worktree git dir: run git add/commit unsandboxed. `cp` is interactive here; use `command cp -f`.
- Tests overwrite site/; rebuild with node phoenix/build.mjs --out site.
- Headless browser checks need the sandbox off and a server started with run_in_background (a server started in a normal call dies with its shell).
