Model: opus (claude-opus-5-5)   Item: PF-044 Owner-only effects control: budget (5 or more, default 5) and a level per effect (Full, Balanced, Off), one config read by app.js, motion.js, safe.js and ui.mjs (the NEXT row of LIBRARY/roadmap.json).

Repo: /home/mrsuccess/Phoenix-Fire, branch cut from origin/main (use a worktree). Read CLAUDE.md, PLANNING/SESSION-HANDOFF.md sections 1, 3, 4, 5, 6, LIBRARY/README.md, LIBRARY/CLAIMS.md, the PF-044 row of LIBRARY/roadmap.json, PLANNING/PF-029-COMPONENTS-MOTION.md and the PF-032 effects clean-up (`tests/effects.test.mjs`, `next/static/fx.js`, `motion.js`). Add your CLAIMS row before editing.

## State right now
- Done: PF-029 to PF-043. PF-043 left: the phone tab bar auto-hides on scroll down (`tabHide()` in `next/static/dock.js`, rules at the end of `dock.css`, tests in `tests/dock.test.mjs`); a 44 px gold arrow (`.tb-back`) bobs twice every 7 s to bring it back; no bob for calm, off or reduced motion; the bar is inert while hidden.
- Keep green: a11y-labels, header-fit, effects, roving, menus-keys, tooltip, states, forms, tables, notices, dialogs, chips, palette, dock.
- PF-044 scope: see its row and the effects rows of PLANNING/PF-029-COMPONENTS-MOTION.md. Owner-only control (nobody else can change it): effect budget (5 or more, default 5) and a level per effect (Full, Balanced, Off), stored as one config and read by app.js, motion.js, safe.js and ui.mjs. A test asserts no more than the budget runs at once. The dock bob (PF-043) is a finite effect to count in the list.

## Do next
1. One item only, PF-044. If the owner-only part needs an owner decision (where the control lives, role gating), stop and report options instead of guessing.
2. node tools/library/sync.mjs, node tests/library.test.mjs, node phoenix/build.mjs --out site, brand and leak tests, commit, push with gh, merge to main.
3. PF-044 DONE with doneLog, next item NEXT, write the next prompt, remove your CLAIMS row. Do not start the next item.

## Gotchas
- Sandbox blocks writes to the worktree git dir: run git add/commit unsandboxed. `cp` is interactive here; use `command cp -f`.
- Tests overwrite site/; rebuild with node phoenix/build.mjs --out site.
- Headless browser: the in-app pane refuses localhost. Playwright's driver fails here; drive chromium over CDP from node (built-in WebSocket) with Input.dispatchMouseEvent mouseWheel for scroll (Lenis ignores scrollTo in headless). Screenshots can reset scroll.
