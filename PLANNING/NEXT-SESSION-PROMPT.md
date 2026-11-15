Model: sonnet (claude-sonnet-5-5)   Item: PF-002 Fill the library to full granularity

Repo: /home/mrsuccess/Phoenix-Fire, branch from origin/main (`git switch -c <name> origin/main`, run unsandboxed: the sandbox creates the branch but leaves HEAD behind).
Read CLAUDE.md, then PLANNING/SESSION-HANDOFF.md sections 1, 4 and 5, then LIBRARY/README.md and only the roadmap row for PF-002.

## Goal
`LIBRARY/ASSETS.md`, `DESIGN.md`, `BOT.md`, `SITEMAP.md` (and the credentials rows) are complete, one row per thing, verified against the code, and the site map is generated from a build by `tools/library/sync.mjs` instead of hand-seeded. `node tests/library.test.mjs` passes.

## State right now
- Done: PF-001 landed on main (PR 7, 9b33f23). The library exists with seeded hand files, generated BOT-COMMANDS.md and ASSETS-INDEX.md, and the test (26 checks).
- Seeded but incomplete: SITEMAP.md lists page groups, not every page; DESIGN.md, BOT.md and ASSETS.md name areas but not every row; CREDENTIALS.md has two "verify" rows.
- Not started: generated sitemap.

## Do next, in order
1. Check LIBRARY/CLAIMS.md; add your claim for `LIBRARY/` and `tools/library/`.
2. Extend `tools/library/sync.mjs` to generate `LIBRARY/SITEMAP-INDEX.md` from a fresh build (`node phoenix/build.mjs --out .build-sitemap`, list html pages, group by prefix, mark audience from the source). Keep it deterministic. Add its freshness check to `tests/library.test.mjs`.
3. Fill the hand files row by row from the code: every asset group, every design decision with its guard test, every bot app output rule and flag, the credential rows verified against `bot/SECRETS-REGISTRY.md` (names and places only, no values).
4. Run `node tools/library/sync.mjs`, `node tests/library.test.mjs`, `node tests/run.mjs` (design test needs Chrome: run it unsandboxed), rebuild with `node phoenix/build.mjs --out site`.
5. Commit, push with the gh helper (unsandboxed), PR, merge. Mark PF-002 DONE, set PF-011 NEXT, write the next prompt, start the next session.

## Decisions already made (do not re-open)
- Merge to main automatically after green checks. The library never holds secret values. One master roadmap; PF-011 to PF-017 are specified in PLANNING/BRAIN-SPEC.md.
- After the local brain window works (PF-012), resume the side roadmap at PF-018 (PLANNING/SIDE-ROADMAP-eager-yawning-lovelace.md).

## Gotchas
- Tests overwrite site/ with the classic build: rebuild after any test run. `.build-sitemap/` must not be committed.
- Auto-mode may refuse a Bash call a hook rewrote (the `rtk` prefix); reissue it exactly as quoted.

## Out of scope
- The roadmap data model (PF-011) and the dashboard (PF-012); new finds go in the roadmap Inbox.

## When done
Update the roadmap row and library files, run node tests/library.test.mjs, write the next prompt, start the next session.
