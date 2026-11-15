Model: opus (claude-opus-5-5)   Item: PF-020 Side roadmap Item 4: Card Studio and `/avatarcard`

Repo: /home/mrsuccess/Phoenix-Fire. Cut a branch from origin/main (`git switch -c <name> origin/main`, run unsandboxed). Read CLAUDE.md, PLANNING/SESSION-HANDOFF.md sections 1, 4 and 5, LIBRARY/README.md, then only the PF-020 row of LIBRARY/roadmap.json and section 4 of PLANNING/SIDE-ROADMAP-eager-yawning-lovelace.md (the owner's side roadmap, merged into the master roadmap as PF-018 to PF-025).

## Goal
Card Studio works on the first attempt, loses the pre-approval preview, gains male and female kits, has config-driven limits, and `/avatarcard` becomes an ephemeral member panel that uses the real Card Studio pipeline. Sub-steps 4a to 4f in the plan, in order; this is design work, so show before and after screenshots to the owner (4f).

## State right now
- PF-018 (links) and PF-019 (menus: Artwork is a manager tile, Card Studio is in the quick dial and search, one Boardroom tile, `tests/menus.test.mjs`) are merged. Card notifications already land on `staff-artwork.html` (managers) and `hub-cardstudio.html#lk-cards` (members); bot link changes need a Worker deploy.
- The mock fixture now lets members see Card Studio in preview (`cardStudio` flag is `members`).
- Project brain: PF-016 and PF-017 are queued (OPEN) and can go any time the owner asks.

## Do next, in order
1. Check LIBRARY/CLAIMS.md and claim `bot/cardstudio.js`, `bot/avatarcard.js`, `web/cardstudio.js`, `web/cardcomposer.js`, `next/static/cardstudio.js`, `bot/worker.js` (the avatarcard route only).
2. 4a measure and harden, then 4b remove the pre-approval preview, 4c uniform kits and guide, 4d limits and queue, 4e `/avatarcard` panel, 4f side-by-side for the owner. Commit and test after each part.
3. Player image rule (CLAUDE.md): every generated image is chest up with a clear margin and a big number; add or extend tests (`tests/cardstudio.test.mjs`). No NOREX words, colours or crest in any output.
4. `node tools/library/sync.mjs`, `node tests/library.test.mjs`, `node tests/run.mjs` (design test needs Chrome: run it unsandboxed), rebuild `node phoenix/build.mjs --out site`.
5. Commit, push with the gh helper (unsandboxed), PR, merge. Mark PF-020 DONE, set the next side-roadmap item NEXT, write the next prompt, start the next session. Note what needs a Worker deploy and a new migration.

## Decisions already made (do not re-open)
- Latest version of a feature wins; no feature gets a second landing page; Phoenix branding on every output; merge to main after green checks. New design choices go in LIBRARY/DESIGN.md. Open owner decisions in plan section 4d (Workers Paid, composite cinematic, fallback provider) are owner choices: list them, do not decide.

## Gotchas
- Tests overwrite `site/` with the classic build: rebuild after any test run. `tests/brain.test.mjs` "inbox: listed newest first" is occasionally flaky under the parallel run; rerun it alone before treating it as a failure. Auto-mode may refuse a Bash call a hook rewrote (the `rtk` prefix): reissue it exactly as quoted. `git switch -c` and `git push` need the sandbox off.

## Out of scope
- Everything outside PF-020; new finds go in the roadmap inbox (`LIBRARY/roadmap.json`).

## When done
Update the roadmap and library files, run node tests/library.test.mjs, write the next prompt, start the next session.
