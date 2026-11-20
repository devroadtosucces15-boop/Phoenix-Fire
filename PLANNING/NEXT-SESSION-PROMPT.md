Model: sonnet (claude-sonnet-5-5)   Item: PF-038 Tables and charts: centred columns except the first, captions, keyboard sort, Compare button, number and % on one line (the NEXT row of LIBRARY/roadmap.json).

Repo: /home/mrsuccess/Phoenix-Fire, branch cut from origin/main (use a worktree). Read CLAUDE.md, PLANNING/SESSION-HANDOFF.md sections 1, 3, 4, 5, 6, LIBRARY/README.md, LIBRARY/CLAIMS.md, the PF-037 row of LIBRARY/roadmap.json and PLANNING/PF-029-COMPONENTS-MOTION.md. Add your CLAIMS row before editing.

## State right now
- Done: PF-029 (tap areas), PF-030 (labels: `tests/a11y-labels.test.mjs`), PF-031 (header fit: `tests/header-fit.test.mjs`), PF-032 (effects), PF-033 (`tests/roving.test.mjs`), PF-034 (menus: `tests/menus-keys.test.mjs`), PF-035 (tooltip), PF-036 (`states.js`, `tests/states.test.mjs`), PF-037 (`next/static/forms.js` + `forms.css`, `tests/forms.test.mjs`). Keep all green. `tests/menus.test.mjs` is the older PF-019 test, do not overwrite it.
- PF-037 left: `PhoenixForms` (enhance, setHelp, setError, clearError, validate) auto-runs on every field; searches get an icon and clear button, `data-help` adds helper text, `data-icon` a leading icon, `.ph-compact` opts out of 44 px. Existing per-page error text can move to `PhoenixForms.setError` over time. Not yet checked on every page.
- PF-038 scope: see the PF-038 row of LIBRARY/roadmap.json and PLANNING/PF-029-COMPONENTS-MOTION.md (centred columns except the first, captions, keyboard sort, Compare button, number and % on one line). Follow the shared-script pattern (one script plus css linked in `next/lib/ui.mjs`). Check tests/ for an existing file name before creating a test. Keep forms.test.mjs and the earlier guard tests green.

## Do next
1. One item only, PF-038. Design talk uses screenshots; keyboard logic is checked with tests.
2. node tools/library/sync.mjs, node tests/library.test.mjs, node phoenix/build.mjs --out site, brand and leak tests, commit, push with gh, merge to main.
3. PF-038 DONE with doneLog, next item NEXT, write the next prompt, remove your CLAIMS row. Do not start the next item.

## Gotchas
- Sandbox blocks writes to the worktree git dir: run git add/commit unsandboxed. `cp` is interactive here; use `command cp -f`.
- Tests overwrite site/; rebuild with node phoenix/build.mjs --out site.
- Headless browser checks need the sandbox off and a server started with run_in_background (a server started in a normal call dies with its shell).
