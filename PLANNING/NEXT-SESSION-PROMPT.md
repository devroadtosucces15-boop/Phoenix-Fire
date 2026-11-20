Model: sonnet (claude-sonnet-5-5)   Item: PF-040 Dialogs and slide-up panels: one dialog, one bottom sheet, focus trap, Back closes (the NEXT row of LIBRARY/roadmap.json).

Repo: /home/mrsuccess/Phoenix-Fire, branch cut from origin/main (use a worktree). Read CLAUDE.md, PLANNING/SESSION-HANDOFF.md sections 1, 3, 4, 5, 6, LIBRARY/README.md, LIBRARY/CLAIMS.md, the PF-039 row of LIBRARY/roadmap.json and PLANNING/PF-029-COMPONENTS-MOTION.md. Add your CLAIMS row before editing.

## State right now
- Done: PF-039 (`next/static/notices.js` + `notices.css`, `tests/notices.test.mjs`), PF-029 (tap areas), PF-030 (labels: `tests/a11y-labels.test.mjs`), PF-031 (header fit: `tests/header-fit.test.mjs`), PF-032 (effects), PF-033 (`tests/roving.test.mjs`), PF-034 (menus: `tests/menus-keys.test.mjs`), PF-035 (tooltip), PF-036 (`states.js`, `tests/states.test.mjs`), PF-037 (`next/static/forms.js` + `forms.css`, `tests/forms.test.mjs`), PF-038 (`next/static/tables.js` + `tables.css`, `tests/tables.test.mjs`). Keep all green. `tests/menus.test.mjs` is the older PF-019 test, do not overwrite it.
- PF-039 left: `PhoenixNotices` (show, ok, err, info, toast, clear, count) is the one notice queue: up to 3 stacked, errors stay (role=alert), `{undo: fn}` adds an Undo button, a progress line pauses on hover and focus. `NorexMotion.toast(msg, {kind, icon, ms})` delegates to it; use `PhoenixNotices` in new code. Not yet wired: real Undo callbacks on destructive actions (delete, remove) on each page; do that when you touch a page.
- PF-040 scope: see the PF-040 row of LIBRARY/roadmap.json and PLANNING/PF-029-COMPONENTS-MOTION.md (one dialog, one bottom sheet on phones with grab handle, focus trap, Back closes). Many pages have their own sheet/drawer/confirm code (e.g. `ccshell.js` sheet and confirmBox); follow the shared-script pattern (dialogs.js + dialogs.css). Check tests/ for an existing file name before creating a test. Keep notices.test.mjs, tables.test.mjs, forms.test.mjs and the earlier guard tests green.

## Do next
1. One item only, PF-040. Design talk uses screenshots; keyboard logic is checked with tests.
2. node tools/library/sync.mjs, node tests/library.test.mjs, node phoenix/build.mjs --out site, brand and leak tests, commit, push with gh, merge to main.
3. PF-040 DONE with doneLog, next item NEXT, write the next prompt, remove your CLAIMS row. Do not start the next item.

## Gotchas
- Sandbox blocks writes to the worktree git dir: run git add/commit unsandboxed. `cp` is interactive here; use `command cp -f`.
- Tests overwrite site/; rebuild with node phoenix/build.mjs --out site.
- Headless browser checks need the sandbox off and a server started with run_in_background (a server started in a normal call dies with its shell).
