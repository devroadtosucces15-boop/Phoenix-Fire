Model: opus (claude-opus-5-5)   Item: PF-009 R26 to R29 (approved by the owner 2026-11-16, one per session)

Repo: /home/mrsuccess/Phoenix-Fire, branch cut from origin/main. Read CLAUDE.md, then PLANNING/SESSION-HANDOFF.md sections 1, 4 and 5, then
LIBRARY/README.md and only the roadmap row for PF-009.

## Goal
Do PF-009 R24 to R29 once the owner has answered the open choices. Do not start it before that.

## State right now
- PF-009 R18 to R25 are done (R24 staff home 4-column grid; R25 Boardroom equal tiles and 2-column Switches accordion, `tests/layout-pass.test.mjs`). PF-010 (config-driven palette and plate), PF-026 and PF-009 R22, R23 are merged.
- Owner approved R25 to R29 on 2026-11-16, R28 look exception included. Build ONE per session in order: R26 Dugout (3 columns roster / pitch / ready-check, equal heights), R27 Insights (Health and Month-by-month stacked left, To do right), R28 Tools and Content form controls and table in the site input style (Phoenix tokens, contrast kept), R29 sweep against live Worker data (if it needs a password, token or owner-only portal step, stop and report exactly what; never store secrets).
- Spec: `.site-context/spec/STAFF-SWEEP.md` lines 20 to 25 (the Dugout row) (main checkout, outside the sandbox, read only). Also write the approved status with the date into STAFF-SWEEP.md and REFACTOR.md if you can write there.
- Owner steps (do not start): PF-005, PF-006, PF-022, PF-025.

## Do next, in order
1. Claim files in LIBRARY/CLAIMS.md. Take R26. Screenshots at 390, 820 and 1440 before and after (serve `site/` statically, headless Chrome over CDP with `window.NorexAuth={role:'owner',as:'owner'}` injected before load).
2. Add a test (`tests/layout-pass.test.mjs`); grep `tests/` first for class-name strings you change (R24 broke three).
3. Tests, `node tools/library/sync.mjs`, `node tests/library.test.mjs`, `node tests/run.mjs`, commit, merge to main, run `node tools/brain/roadmap-page.mjs` and republish the Artifact.

## Decisions already made (do not re-open)
- Brand colours live in config.json (brand.plate, brand.palette); css reads tokens, never hex.

## Gotchas
- Tests overwrite site/; rebuild with node phoenix/build.mjs --out site. Run the design test unsandboxed.
- Roadmap text must not contain NOREX hex colours (tests/roadmap-view.test.mjs fails on them).

## Out of scope
- Owner steps above. New finds go in the roadmap Inbox.

## When done
Update the roadmap row and library files, run node tests/library.test.mjs, write the next prompt, republish the roadmap Artifact.
