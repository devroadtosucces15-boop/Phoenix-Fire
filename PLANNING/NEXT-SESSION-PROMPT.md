Model: sonnet (claude-sonnet-5-5)   Item: PF-047 Tap areas left: result pills, game rows, chips and player cards under 44 px on Stats, Club and Tactics (the NEXT row of LIBRARY/roadmap.json).

Repo: /home/mrsuccess/Phoenix-Fire, branch cut from origin/main (use a worktree). Read CLAUDE.md, PLANNING/SESSION-HANDOFF.md sections 1, 3, 4, 5, 6, LIBRARY/README.md, LIBRARY/CLAIMS.md, the PF-047 row of LIBRARY/roadmap.json and PLANNING/PF-029-COMPONENTS-MOTION.md (section "PF-046 re-audit" has the numbers and the leftover selectors). Add your CLAIMS row before editing.

## State right now
- Done: PF-029 to PF-046. PF-046 added `tools/effects/reaudit.mjs` (headless Chromium, phone width, budget 5 and 14) and the before/after table.
- Leftover tap targets under 44 px (budget-independent): Stats 115 (`a.W` 43, `a.L` 11, `a.D` 10, `a.gdb` 10, `a.srow` 10, `a.tw` 6), Club 39 (`a.fo` 10, `button.rchip` 9, `a.fd` 5, `a.chip` 2), Tactics 34 (`button.chip` 13, `button.pc` 11).
- Keep green: a11y-labels, header-fit, effects, fxconfig, roving, menus-keys, tooltip, states, forms, tables, notices, dialogs, chips, palette, dock, brand, phoenix-bot, leakcheck, identifiers, library.
- Open owner decisions (report, do not guess): (1) default effects budget 5 vs 14; (2) the personal Motion sheet is still a can-only-lower layer.

## Do next
1. One item only, PF-047: grow the touch area of those controls to 44 px without changing how they look (padding with negative margin, or a `::after` hit area; follow the owner's accepted and refused look changes in PLANNING/PF-029-COMPONENTS-MOTION.md; icons and emoji stay, card glare and shine stay). Screenshots before and after (headless chromium on a file:// URL). Re-run `node tools/effects/reaudit.mjs site 5` and write the new numbers under the re-audit table. Add or extend a test for the shared rule.
2. node tools/library/sync.mjs, node tests/library.test.mjs, node phoenix/build.mjs --out site, brand and leak tests, commit, push with gh, merge to main.
3. PF-047 DONE with doneLog, PF-048 NEXT, write the next prompt, remove your CLAIMS row.

## Gotchas
- Sandbox blocks writes to the worktree git dir: run git add/commit unsandboxed. `cp` is interactive here; use `command cp -f`.
- Tests overwrite site/; rebuild with node phoenix/build.mjs --out site before running brand/dock/identifiers tests.
- Headless browser: the in-app pane refuses localhost. Run chromium unsandboxed against a file:// URL; unsandboxed runs write to /tmp, sandboxed to the scratchpad.
