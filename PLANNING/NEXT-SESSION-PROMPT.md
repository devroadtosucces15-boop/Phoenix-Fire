Model: sonnet (claude-sonnet-5-5)   Item: PF-034 Menus and dropdowns: arrow keys, Esc, outside tap, focus return (same look) (the NEXT row of LIBRARY/roadmap.json).

Repo: /home/mrsuccess/Phoenix-Fire, branch cut from origin/main (use a worktree). Read CLAUDE.md, PLANNING/SESSION-HANDOFF.md sections 1, 3, 4, 5, 6, LIBRARY/README.md, LIBRARY/CLAIMS.md, the PF-033 row of LIBRARY/roadmap.json and PLANNING/PF-029-COMPONENTS-MOTION.md. Add your CLAIMS row before editing.

## State right now
- Done: PF-029 (tap areas), PF-030 (labels: `tests/a11y-labels.test.mjs`), PF-031 (header fit: `tests/header-fit.test.mjs`), PF-032 (effects: `tests/effects.test.mjs`), PF-033 (`tests/roving.test.mjs`). Keep all green.
- PF-032 left: no pointer spotlight, `html.pf-hidden` pauses animations in a hidden tab, decorative idle animations are finite (Club/Stats/Tactics endless 18/11/10 to 0). Do not add endless decorative animations; live-status pulses may stay endless.
- PF-033 left: `next/static/roving.js` (chips and tabs keyboard, group roles, last tab remembered) and `tests/roving.test.mjs`; it was not checked in a real browser, so open a tabs page once with a headless check if cheap.
- PF-034 scope: account, nav and alert menus by keyboard and touch: arrow keys, Esc closes, tap outside closes, focus returns to the opener. Same menus and look. Reuse the roving.js pattern (one shared script, no page markup rewrites).

## Do next
1. One item only, PF-034. Design talk uses screenshots; keyboard logic is checked with tests.
2. node tools/library/sync.mjs, node tests/library.test.mjs, node phoenix/build.mjs --out site, brand and leak tests, commit, push with gh, merge to main.
3. PF-034 DONE with doneLog, next item NEXT, write the next prompt, remove your CLAIMS row. Do not start the next item.

## Gotchas
- Sandbox blocks writes to the worktree git dir: run git add/commit unsandboxed. `cp` is interactive here; use `command cp -f`.
- Tests overwrite site/; rebuild with node phoenix/build.mjs --out site.
- Headless browser checks need the sandbox off and a server started with run_in_background (a server started in a normal call dies with its shell).
