Model: sonnet (claude-sonnet-5-5)   Item: PF-039 Notices: one queue, stacked, errors stay, Undo and progress line (the NEXT row of LIBRARY/roadmap.json).

Repo: /home/mrsuccess/Phoenix-Fire, branch cut from origin/main (use a worktree). Read CLAUDE.md, PLANNING/SESSION-HANDOFF.md sections 1, 3, 4, 5, 6, LIBRARY/README.md, LIBRARY/CLAIMS.md, the PF-037 row of LIBRARY/roadmap.json and PLANNING/PF-029-COMPONENTS-MOTION.md. Add your CLAIMS row before editing.

## State right now
- Done: PF-029 (tap areas), PF-030 (labels: `tests/a11y-labels.test.mjs`), PF-031 (header fit: `tests/header-fit.test.mjs`), PF-032 (effects), PF-033 (`tests/roving.test.mjs`), PF-034 (menus: `tests/menus-keys.test.mjs`), PF-035 (tooltip), PF-036 (`states.js`, `tests/states.test.mjs`), PF-037 (`next/static/forms.js` + `forms.css`, `tests/forms.test.mjs`), PF-038 (`next/static/tables.js` + `tables.css`, `tests/tables.test.mjs`). Keep all green. `tests/menus.test.mjs` is the older PF-019 test, do not overwrite it.
- PF-038 left: `PhoenixTables` (enhance, scan, num, sortBy, toggle) auto-runs on every table: caption and scope added, sort buttons on headers, centred columns (css), `.ph-left` / `data-no-sort` opt out, `PhoenixTables.num(v, '%')` keeps number and unit together, `.ph-rows` gives 10 px row spacing (opt-in). Compare button is a pill. Not yet checked on every page's live tables.
- PF-039 scope: see the PF-039 row of LIBRARY/roadmap.json and PLANNING/PF-029-COMPONENTS-MOTION.md (one toast queue replacing the 14 wrappers, stacked up to 3, 12 px corners, errors stay, Undo, progress line, same icons in messages). Follow the shared-script pattern. Check tests/ for an existing file name before creating a test. Keep tables.test.mjs, forms.test.mjs and the earlier guard tests green.

## Do next
1. One item only, PF-039. Design talk uses screenshots; keyboard logic is checked with tests.
2. node tools/library/sync.mjs, node tests/library.test.mjs, node phoenix/build.mjs --out site, brand and leak tests, commit, push with gh, merge to main.
3. PF-039 DONE with doneLog, next item NEXT, write the next prompt, remove your CLAIMS row. Do not start the next item.

## Gotchas
- Sandbox blocks writes to the worktree git dir: run git add/commit unsandboxed. `cp` is interactive here; use `command cp -f`.
- Tests overwrite site/; rebuild with node phoenix/build.mjs --out site.
- Headless browser checks need the sandbox off and a server started with run_in_background (a server started in a normal call dies with its shell).
