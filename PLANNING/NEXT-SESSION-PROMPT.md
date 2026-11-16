Model: opus (claude-opus-5-5)   Item: PF-009 R24 to R29 (waits on the owner)

Repo: /home/mrsuccess/Phoenix-Fire, branch cut from origin/main. Read CLAUDE.md, then PLANNING/SESSION-HANDOFF.md sections 1, 4 and 5, then
LIBRARY/README.md and only the roadmap row for PF-009.

## Goal
Do PF-009 R24 to R29 once the owner has answered the open choices. Do not start it before that.

## State right now
- Done and tested: PF-010 (search palette, header menu and staff-hub gold plate read config.json brand.palette / brand.plate through
  --pal-* and --plate-* tokens written by phoenix/build.mjs; tests/theme-tokens.test.mjs, 13 checks; node tests/run.mjs green).
- PF-026 (visual roadmap) and PF-009 R22, R23 are merged.
- Open items that need no owner decision: none left.
- Owner steps (do not start): PF-005, PF-006, PF-022, PF-025. PF-009 R24 to R29 wait on the owner.

## Do next, in order
1. Ask the owner (or read the Inbox) whether R24 to R29 are answered. If not, stop and say so.
2. If answered: claim files in LIBRARY/CLAIMS.md, do R24 to R29, add tests, update the library.

## Decisions already made (do not re-open)
- Brand colours live in config.json (brand.plate, brand.palette); css reads tokens, never hex.

## Gotchas
- Tests overwrite site/; rebuild with node phoenix/build.mjs --out site. Run the design test unsandboxed.
- Roadmap text must not contain NOREX hex colours (tests/roadmap-view.test.mjs fails on them).

## Out of scope
- Owner steps above. New finds go in the roadmap Inbox.

## When done
Update the roadmap row and library files, run node tests/library.test.mjs, write the next prompt, republish the roadmap Artifact.
