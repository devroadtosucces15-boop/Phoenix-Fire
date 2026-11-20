Model: sonnet (claude-sonnet-5-5)   Item: PF-042 Search and command palette: groups, key hints, actions, recents (the NEXT row of LIBRARY/roadmap.json).

Repo: /home/mrsuccess/Phoenix-Fire, branch cut from origin/main (use a worktree). Read CLAUDE.md, PLANNING/SESSION-HANDOFF.md sections 1, 3, 4, 5, 6, LIBRARY/README.md, LIBRARY/CLAIMS.md, the PF-039 row of LIBRARY/roadmap.json and PLANNING/PF-029-COMPONENTS-MOTION.md. Add your CLAIMS row before editing.

## State right now
- Done: PF-029 to PF-041. PF-041 left: `next/static/chips.js` + `chips.css` (`tests/chips.test.mjs`): dark amber selected state on chips, pills, segmented buttons and tabs; a sliding highlight (pseudo-element `::before` of the group, CSS vars `--ph-x/y/w/h`) only on single-row groups with one selected item, never on wrapped or multi-select chips. Headless chromium throttles requestAnimationFrame: call `PhoenixChips.scan()` by hand in specimens.
- Earlier: PF-029 to PF-040. PF-040 left: `next/static/dialogs.js` + `dialogs.css` (`tests/dialogs.test.mjs`). `PhoenixDialog` adopts every existing pop-up (role=dialog aria-modal, .mx-sheet, .cx-drawer, .br-modal, .wtp-modal, #awardfx): Tab trap, Esc, Back closes, focus returns, grab handle on phones. New code: `PhoenixDialog.open({title, html|node, onClose})` and `PhoenixDialog.confirm(msg, {yes, no, danger})` (Promise<boolean>). Not wired: page confirm callers (e.g. `ccshell.js` confirmBox) still use their own markup; they work, they are adopted. Notices: `PhoenixNotices` (PF-039), Undo callbacks not yet wired on pages.
- Keep green: a11y-labels, header-fit, effects, roving (PF-033 keyboard for chips and tabs: do not break `roving.js`), menus-keys, tooltip, states, forms, tables, notices, dialogs.
- PF-042 scope: see its row in LIBRARY/roadmap.json and PLANNING/PF-029-COMPONENTS-MOTION.md (search and command palette: group headings and key hints, 12 px panel with no glow, actions, recents; rows keep their emoji). Follow the shared-script pattern, check tests/ for an existing name first. Keep chips, roving, menus, dialogs, forms, tables, notices tests green.

## Do next
1. One item only, PF-042. Design talk uses screenshots; keyboard logic is checked with tests; the palette needs screenshots at phone and desktop width.
2. node tools/library/sync.mjs, node tests/library.test.mjs, node phoenix/build.mjs --out site, brand and leak tests, commit, push with gh, merge to main.
3. PF-041 DONE with doneLog, next item NEXT, write the next prompt, remove your CLAIMS row. Do not start the next item.

## Gotchas
- Sandbox blocks writes to the worktree git dir: run git add/commit unsandboxed. `cp` is interactive here; use `command cp -f`.
- Tests overwrite site/; rebuild with node phoenix/build.mjs --out site.
- Headless browser checks need the sandbox off and a server started with run_in_background (a server started in a normal call dies with its shell).
