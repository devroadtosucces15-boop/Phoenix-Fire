Model: sonnet (claude-sonnet-5-5)   Item: PF-048 Check that every block hidden for a scroll reveal does show (Stats has 108 at opacity 0 at load) (the NEXT row of LIBRARY/roadmap.json).

Repo: /home/mrsuccess/Phoenix-Fire, branch cut from origin/main (use a worktree). Read CLAUDE.md, PLANNING/SESSION-HANDOFF.md sections 1, 3, 4, 5, 6, LIBRARY/README.md, LIBRARY/CLAIMS.md, the PF-048 row of LIBRARY/roadmap.json and PLANNING/PF-029-COMPONENTS-MOTION.md (section "PF-046 re-audit" has the numbers and the leftover selectors). Add your CLAIMS row before editing.

## State right now
- Done: PF-029 to PF-047. PF-047 made `tools/effects/reaudit.mjs` measure the real hit area (`tap`), the box (`box`) and `covered` controls, waits for entrance animations, and fixed tap.css (z-index 1, no `:not(.cs)`, mosaic tiles inset -2px). Tap under 44 px at budget 5: Club 0, Stats 17, Tactics 2.
- Op0 numbers from the reaudit (blocks at opacity 0 after animations end): Club 81, Stats 116, Tactics 22. PF-048 must tell reveals that wait for scroll from blocks that are stuck.
- Keep green: a11y-labels, header-fit, effects, fxconfig, roving, menus-keys, tooltip, states, forms, tables, notices, dialogs, chips, palette, dock, tap-targets, brand, phoenix-bot, leakcheck, identifiers, library.
- Open owner decisions (report, do not guess): (1) default effects budget 5 vs 14; (2) the personal Motion sheet is still a can-only-lower layer; (3) 17 mosaic tiles on Stats and 2 pitch markers on Tactics still under 44 px (a 7 px mosaic gap or bigger tiles would change the look).

## Do next
1. One item only, PF-048: Leftover of the PF-046 re-audit. Numbers: `PLANNING/PF-029-COMPONENTS-MOTION.md`, section "PF-046 re-audit". Outcome: A test or probe scrolls each main page and fails if a block stays at opacity 0, in print and with ?still. Probe idea: scroll each main page in headless Chromium (print media and `?still` too) and fail when a block stays at opacity 0 after it was scrolled into view; reaudit.mjs `op0` is the starting count. Do not change how reveals look. Add a test for the rule.
2. node tools/library/sync.mjs, node tests/library.test.mjs, node phoenix/build.mjs --out site, brand and leak tests, commit, push with gh, merge to main.
3. PF-048 DONE with doneLog, the next row NEXT (PF-049 if present, else say the roadmap is finished), write the next prompt, remove your CLAIMS row.

## Gotchas
- Sandbox blocks writes to the worktree git dir: run git add/commit unsandboxed. `cp` is interactive here; use `command cp -f`.
- Tests overwrite site/; rebuild with node phoenix/build.mjs --out site before running brand/dock/identifiers tests.
- Headless browser: the in-app pane refuses localhost. Run chromium unsandboxed against a file:// URL; unsandboxed runs write to /tmp, sandboxed to the scratchpad.
