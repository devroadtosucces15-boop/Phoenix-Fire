Model: sonnet (claude-sonnet-5-5)   Item: PF-046 Re-audit and report: repeat today's measurements and compare (the NEXT row of LIBRARY/roadmap.json).

Repo: /home/mrsuccess/Phoenix-Fire, branch cut from origin/main (use a worktree). Read CLAUDE.md, PLANNING/SESSION-HANDOFF.md sections 1, 3, 4, 5, 6, LIBRARY/README.md, LIBRARY/CLAIMS.md, the PF-046 row of LIBRARY/roadmap.json and PLANNING/PF-029-COMPONENTS-MOTION.md (the Phase 0 evidence numbers are the "before"). Add your CLAIMS row before editing.

## State right now
- Done: PF-029 to PF-045. PF-045 added five counted effects (spring, ripple, spotlight, ping, popin) in `next/static/fxmotion.js` and `fxmotion.css`, listed in both `fxconfig.js` copies, the owner form (`ccsettings.js`) and config.json `effects`. EFFECTS now has 14 entries; tests/fxconfig.test.mjs covers them.
- Keep green: a11y-labels, header-fit, effects, fxconfig, roving, menus-keys, tooltip, states, forms, tables, notices, dialogs, chips, palette, dock, brand, phoenix-brand, leakcheck, identifiers, library.
- Open owner decisions (report, do not guess): (1) the default budget of 5 runs only reveals, glow, tilt, parallax, bursts; dock arrow, phone tilt, haptics, Insights and the five PF-045 effects stay off until the owner raises the budget (14 runs all); (2) the personal Motion sheet (`M.settings` in motion.js) is still a can-only-lower layer; the owner rule says no per-user options.

## Do next
1. One item only, PF-046: repeat the Phase 0 measurements (tap targets under 44 px on Club, Stats, Tactics at phone width; unlabelled controls; form fields; native selects; endless animations; blocks at opacity 0 on Stats; frame rate) on the built site, with the effects budget at 5 and at 14. Write the before/after table into PLANNING/PF-029-COMPONENTS-MOTION.md. Fix nothing big; list leftovers as new roadmap rows.
2. node tools/library/sync.mjs, node tests/library.test.mjs, node phoenix/build.mjs --out site, brand and leak tests, commit, push with gh, merge to main.
3. PF-046 DONE with doneLog; if no OPEN row is left, say the roadmap is finished and stop. Write the next prompt, remove your CLAIMS row.

## Gotchas
- Sandbox blocks writes to the worktree git dir: run git add/commit unsandboxed. `cp` is interactive here; use `command cp -f`.
- Tests overwrite site/; rebuild with node phoenix/build.mjs --out site before running brand/dock/identifiers tests.
- Headless browser: the in-app pane refuses localhost. Drive chromium over CDP from node (built-in WebSocket) against a file:// URL.
