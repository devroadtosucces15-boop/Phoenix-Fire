Item: PF-024 (the NEXT row of LIBRARY/roadmap.json): Side roadmap Items 8 to 25, bot cleanup and new bot features. One session per item inside it; read the row notes for which sub-items are done (Items 8 and 9 are done) and take the next open one. Check first: if the sub-item needs an owner step (go-live, portal, money, password) or a design choice, stop and report.

Repo: /home/mrsuccess/Phoenix-Fire, branch cut from origin/main (use a worktree). Read CLAUDE.md, PLANNING/SESSION-HANDOFF.md sections 1, 3, 4, 5, 6, LIBRARY/README.md, LIBRARY/CLAIMS.md, the PF-024 row and PLANNING/PF-024-GO-LIVE.md. Add your CLAIMS row before editing. Use the phoenix-bot-studio skills for anything the bot sends.

## State right now
- Done: the components and motion roadmap PF-029 to PF-048 (PF-048 = reveal probe `tools/effects/reveals.mjs`, `tests/reveals.test.mjs`, print rule in `motion.css`). No NEXT row was left there, so PF-024 (OPEN, dependency PF-023 done) became NEXT.
- Keep green: a11y-labels, header-fit, effects, fxconfig, roving, menus-keys, tooltip, states, forms, tables, notices, dialogs, chips, palette, dock, tap-targets, reveals, brand, phoenix-bot, leakcheck, identifiers, library.
- Open owner decisions (report, do not guess): (1) default effects budget 5 vs 14; (2) personal Motion sheet is still a can-only-lower layer; (3) 17 mosaic tiles on Stats and 2 pitch markers on Tactics under 44 px (needs a look change); PF-025 waits for the owner; PF-005, PF-006 blocked on the owner; PF-007 needs a host choice.

## Gotchas
- Sandbox blocks writes to the worktree git dir: run git add/commit unsandboxed. `cp` is interactive here; use `command cp -f`.
- Tests overwrite site/; rebuild with node phoenix/build.mjs --out site before running brand/dock/identifiers tests.
- Headless browser: run chromium unsandboxed against a file:// URL.
