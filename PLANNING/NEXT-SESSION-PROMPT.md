Model: opus (claude-opus-5-5)   Item: PF-009 R29 (approved by the owner 2026-11-16, one per session)

Repo: /home/mrsuccess/Phoenix-Fire, branch cut from origin/main. Read CLAUDE.md, then PLANNING/SESSION-HANDOFF.md sections 1, 4 and 5, then
LIBRARY/README.md and only the roadmap row for PF-009.

## Goal
Do PF-009 R29: re-run the staff sweep against live Worker data for the tabs the mock cannot show (Announce, Bot, Health, Audit, feature switches).

## State right now
- PF-009 R18 to R28 are done. R28 (Tools and Content form controls and tables in the site input style) is in `next/static/hubx.css` (block "PF-009 R28", scoped `.room-staff`, tokens only) and `content.css`; test in `tests/layout-pass.test.mjs`. Before/after shots were checked at 390, 820 and 1440.
- Spec: `.site-context/spec/STAFF-SWEEP.md` (main checkout, read only), R29 line. Checklist: PLANNING/STAFF-SWEEP-APPROVAL.md.
- R29 needs real Worker data. If it needs a password, token or an owner-only portal step, STOP and report exactly what is needed. Never store or write a secret.
- Owner steps (do not start): PF-005, PF-006, PF-022, PF-025.

## Do next, in order
1. Claim files in LIBRARY/CLAIMS.md. Check what live access you have (public read endpoints only unless the owner supplied a session). Screenshot the five tabs at 390, 820 and 1440 (serve `site/` statically, headless Chrome over CDP; a mocked-auth script pattern is in the R28 session notes: inject `window.NorexAuth={role:'owner',as:'owner'}` before load).
2. Fix layout problems only (no restyling); new finds go to the roadmap Inbox. Add or extend a test in `tests/layout-pass.test.mjs` (grep `tests/` for class strings you change).
3. `node tools/library/sync.mjs`, `node tests/library.test.mjs`, `node tests/run.mjs`, rebuild `node phoenix/build.mjs --out site`, commit, merge to main, run `node tools/brain/roadmap-page.mjs` and republish the Artifact. Mark PF-009 done.

## Decisions already made (do not re-open)
- Brand colours live in config.json (brand.plate, brand.palette); css reads tokens, never hex.

## Gotchas
- Tests overwrite site/; rebuild with node phoenix/build.mjs --out site. Run the design test unsandboxed.
- Roadmap text must not contain NOREX hex colours (tests/roadmap-view.test.mjs fails on them).

## When done
Update the roadmap row and library files, run node tests/library.test.mjs, write the next prompt (or say the item is finished), republish the roadmap Artifact.
