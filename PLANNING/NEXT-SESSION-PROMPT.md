Model: opus (claude-opus-5-5)   Item: PF-045 Motion pass: the accepted new motion (card spring, scroll, selection ripple, transitions, celebrations, glow spotlight, status ping, widgets, menus) (the NEXT row of LIBRARY/roadmap.json).

Repo: /home/mrsuccess/Phoenix-Fire, branch cut from origin/main (use a worktree). Read CLAUDE.md, PLANNING/SESSION-HANDOFF.md sections 1, 3, 4, 5, 6, LIBRARY/README.md, LIBRARY/CLAIMS.md, the PF-045 row of LIBRARY/roadmap.json, PLANNING/PF-029-COMPONENTS-MOTION.md and the PF-032 effects clean-up and the PF-044 config (`tests/effects.test.mjs`, `tests/fxconfig.test.mjs`, `next/static/fx.js`, `motion.js`, `fxconfig.js`). Add your CLAIMS row before editing.

## State right now
- Done: PF-029 to PF-044. PF-044 left: one owner-set effects config. `next/static/fxconfig.js` (`window.PhoenixFx`: `on(k)`, `level(k)`, `scale(k)`, `running()`, budget 5 or more, default 5, level Full/Balanced/Off per effect, priority order reveals, glow, tilt, parallax, bursts, dockbob, gyro, haptics, insights) is read by app.js, motion.js, safe.js, dock.js and the pages (ui.mjs bakes `window.PHOENIX_FX` from config.json `effects`). Owner saves it in the Control Center area `effects` (owner-only, cc_config row, `bot/fxconfig.js`); the site reads it from public GET `/api/site/effects`. Tests: `tests/fxconfig.test.mjs`.
- Keep green: a11y-labels, header-fit, effects, fxconfig, roving, menus-keys, tooltip, states, forms, tables, notices, dialogs, chips, palette, dock.
- PF-045 scope: see its row and the motion rows of PLANNING/PF-029-COMPONENTS-MOTION.md. EVERY new motion must be a counted effect: gate it with `PhoenixFx.on('<effect>')` (add a key to EFFECTS in both `bot/fxconfig.js` and `next/static/fxconfig.js`, the form in `next/static/ccsettings.js`, config.json `effects.levels`) and scale distances by `PhoenixFx.scale()`. Card glare and shine stay unchanged.
- Open owner decisions from PF-044 (report, do not guess): (1) the default budget of 5 leaves bursts, dock arrow, phone tilt, haptics and Insights off until the owner raises it; (2) the personal Motion sheet (`M.settings` in motion.js) still exists as a can-only-lower layer; the owner rule says no per-user options, removing it means rewriting the B1 tests in tests/next.test.mjs.

## Do next
1. One item only, PF-045. If a motion needs a real design choice, stop and report options.
2. node tools/library/sync.mjs, node tests/library.test.mjs, node phoenix/build.mjs --out site, brand and leak tests, commit, push with gh, merge to main.
3. PF-045 DONE with doneLog, next item NEXT, write the next prompt, remove your CLAIMS row. Do not start the next item.

## Gotchas
- Sandbox blocks writes to the worktree git dir: run git add/commit unsandboxed. `cp` is interactive here; use `command cp -f`.
- Tests overwrite site/; rebuild with node phoenix/build.mjs --out site.
- Headless browser: the in-app pane refuses localhost. Playwright's driver fails here; drive chromium over CDP from node (built-in WebSocket) with Input.dispatchMouseEvent mouseWheel for scroll (Lenis ignores scrollTo in headless). Screenshots can reset scroll.
