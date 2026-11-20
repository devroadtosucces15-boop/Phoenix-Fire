Model: sonnet (claude-sonnet-5-5)   Item: PF-043 Dock: five items, auto-hide on scroll, bobbing bring-back icon (the NEXT row of LIBRARY/roadmap.json).

Repo: /home/mrsuccess/Phoenix-Fire, branch cut from origin/main (use a worktree). Read CLAUDE.md, PLANNING/SESSION-HANDOFF.md sections 1, 3, 4, 5, 6, LIBRARY/README.md, LIBRARY/CLAIMS.md, the PF-039 row of LIBRARY/roadmap.json and PLANNING/PF-029-COMPONENTS-MOTION.md. Add your CLAIMS row before editing.

## State right now
- Done: PF-029 to PF-042. PF-042 left: the header palette in `next/static/header.js` + `header.css` (`tests/palette.test.mjs`): groups Recent, Actions, Players, Pages, Menus, Settings; Enter hint on the selected row and a move/open/close footer (fine pointer only); in-place actions (copy link, back to top, motion and effects, alerts inbox for members); recents in `phoenix.search.recent` (last 5, Clear button); 12 px panel, no glow.
- Earlier: PF-041 chips (`chips.js`), PF-040 dialogs (`PhoenixDialog`), PF-039 notices (`PhoenixNotices`), PF-035 tooltip, PF-034 menus, PF-033 roving.
- Keep green: a11y-labels, header-fit, effects, roving, menus-keys, tooltip, states, forms, tables, notices, dialogs, chips, palette.
- PF-043 scope: see its row in LIBRARY/roadmap.json and the Dock row of PLANNING/PF-029-COMPONENTS-MOTION.md: keep the dock as it is (five items Club, Matches, Hub centre, Stats, Tactics), enhance live effects; phone: dock auto-hides on scroll down and a small bottom-centre icon with an upward pointer bobs now and then to bring it back. Dock code: `next/static/dock.js`, `dock.css`, `tests/dock.test.mjs`. Check the effects budget (PF-032) before adding any endless animation.

## Do next
1. One item only, PF-042. Design talk uses screenshots; keyboard logic is checked with tests; the palette needs screenshots at phone and desktop width.
2. node tools/library/sync.mjs, node tests/library.test.mjs, node phoenix/build.mjs --out site, brand and leak tests, commit, push with gh, merge to main.
3. PF-043 DONE with doneLog, next item NEXT, write the next prompt, remove your CLAIMS row. Do not start the next item.

## Gotchas
- Sandbox blocks writes to the worktree git dir: run git add/commit unsandboxed. `cp` is interactive here; use `command cp -f`.
- Tests overwrite site/; rebuild with node phoenix/build.mjs --out site.
- Headless browser checks need the sandbox off and a server started with run_in_background (a server started in a normal call dies with its shell).
