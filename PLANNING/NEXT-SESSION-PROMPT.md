Model: opus (claude-opus-5-5)   Item: PF-021 Side roadmap Item 3 visuals: match view, match center, box score, derived stats

Repo: /home/mrsuccess/Phoenix-Fire. Cut a branch from origin/main (`git switch -c <name> origin/main`, run unsandboxed). Read CLAUDE.md, PLANNING/SESSION-HANDOFF.md sections 1 to 5, LIBRARY/README.md, the PF-021 row of LIBRARY/roadmap.json, and sections 1 and "Item 3 visuals" of PLANNING/SIDE-ROADMAP-eager-yawning-lovelace.md.

## Goal
Match pages and match posts show the decoded EA stats well: retouched match view, match center, a real box score, and the proposed derived stats (true numbers only, per match and per 90, only where `evraw` exists). Design work: screenshots before and after at 390, 820, 1440, shown to the owner; ask for or look at the owner's screenshots first, do not guess.

## State right now
- The backend is on main: `evraw` is stored for every match (98caa54), decoded named stats and schema probe exist, and PR 6 put decoded stats on match pages and made the stats board, field view and review share one 1200x1700 canvas, plus the session recap. This row is marked verify: confirm what is still missing against `next/pages/matches.mjs`, `scripts/lib/resultpost.mjs`, `matchpicture.mjs`, `matchreview.mjs`, `scripts/cards.mjs` (`boxScoreCard`) and `scripts/build.mjs`.
- PF-016 (usage intelligence) and PF-017 are OPEN and can be taken any time. PF-020 is PAUSED waiting on the owner (see PLANNING/PF-020-4D-DECISION.md); do not touch Card Studio provider or limits.

## Do next, in order
1. Check LIBRARY/CLAIMS.md; claim `next/pages/matches.mjs`, `scripts/lib/`, `scripts/cards.mjs`.
2. Audit: list what the match view, match center and box score show now vs the decoded stats available; screenshots of the current state at 390, 820, 1440.
3. Build the missing pieces (decoded table columns, team comparison rows, a box score on the site as well as the Discord card, remove the "does not publish possession" caveat only for what is truly available). Keep `next/` and `web/` outputs Phoenix-themed; no NOREX names or colours; every derived number must be computable from stored data.
4. Tests: new or extended tests for each output (brand, leak, picture size), fixtures from existing matches. Then library sync and test, `node tests/run.mjs` (design test needs Chrome: run unsandboxed), rebuild `node phoenix/build.mjs --out site`.
5. Commit, push with the gh helper (unsandboxed), PR, merge. Mark PF-021 DONE, set PF-022 NEXT (its owner decision on the DJ bridge push or poll is pending: if it still blocks, stop the chain and say so; PF-016 is the next free item), write the next prompt, start the next session only if no owner decision is needed.

## Decisions already made (do not re-open)
- Latest version wins; one landing page per feature; Phoenix branding on every output; merge to main after green checks; library holds names and places only.

## Gotchas
- Tests overwrite `site/`: rebuild after any test run. A hook may rewrite a Bash call (the `rtk` prefix) and auto mode asks you to reissue it exactly. `git switch -c` needs the sandbox off. The brain test "inbox: listed newest first" can flake within one second.

## Out of scope
- PF-022 and later; Card Studio (PF-020); new finds go in the roadmap inbox.

## When done
Update roadmap and library files, run node tests/library.test.mjs, write the next prompt, start the next session if no decision is needed.
