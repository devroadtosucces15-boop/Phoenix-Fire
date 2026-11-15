Model: sonnet (claude-sonnet-5-5)   Item: PF-011 Project brain: roadmap data model

Repo: /home/mrsuccess/Phoenix-Fire, branch from origin/main (`git switch -c <name> origin/main`, run unsandboxed: the sandbox creates the branch but leaves HEAD behind).
Read CLAUDE.md, then PLANNING/SESSION-HANDOFF.md sections 1, 4 and 5, then LIBRARY/README.md, the PF-011 row of LIBRARY/ROADMAP.md and PLANNING/BRAIN-SPEC.md ("Roadmap data model" and "Build order").

## Goal
`LIBRARY/roadmap.json` becomes the source of the roadmap (fields in BRAIN-SPEC), with computed percent per phase and project, and `LIBRARY/ROADMAP.md` is generated from it by `tools/library/sync.mjs`. `tests/library.test.mjs` keeps them in step and still demands exactly one NEXT item.

## State right now
- Done: PF-001 and PF-002 on main. The library is complete: generated BOT-COMMANDS, ASSETS-INDEX, SITEMAP-INDEX (from a fresh build) and FLAGS-INDEX; hand files verified against the code; credential rows added to `bot/SECRETS-REGISTRY.md` (names only).
- `LIBRARY/ROADMAP.md` is still hand-written; its table is the data to convert. Keep the "How it is used" text and the Inbox.
- Not started: roadmap.json, metrics, generated markdown.

## Do next, in order
1. Check LIBRARY/CLAIMS.md; add your claim for `LIBRARY/` and `tools/library/`.
2. Convert every row of the ROADMAP.md table into `roadmap.json` (add size, effort, importance, estMinutes, percent, lowHanging, doneLog as far as known; unknown values get a sensible default and a note).
3. Add the metrics (phase and project percent weighted by size) and a `renderRoadmap()` in `tools/library/sync.mjs` that writes ROADMAP.md; add it to TARGETS and the freshness test; keep the one-NEXT check.
4. Run `node tools/library/sync.mjs`, `node tests/library.test.mjs`, `node tests/run.mjs` (Chrome design test unsandboxed), rebuild with `node phoenix/build.mjs --out site`.
5. Commit, push with the gh helper (unsandboxed), PR, merge. Mark PF-011 DONE, set PF-012 NEXT, write the next prompt, start the next session.

## Decisions already made (do not re-open)
- Merge to main automatically after green checks. The library never holds secret values. One master roadmap; PF-011 to PF-017 are specified in PLANNING/BRAIN-SPEC.md. After the local brain window works (PF-012), resume the side roadmap at PF-018.

## Gotchas
- Tests overwrite site/ with the classic build: rebuild after any test run. `.build-sitemap/` must not be committed (delete it).
- `tests/library.test.mjs` runs a full site build (about 2 s) for the sitemap check.
- Auto-mode may refuse a Bash call a hook rewrote (the `rtk` prefix); reissue it exactly as quoted.

## Out of scope
- The dashboard (PF-012) and everything after; new finds go in the roadmap Inbox.

## When done
Update the roadmap, run node tests/library.test.mjs, write the next prompt, start the next session.
