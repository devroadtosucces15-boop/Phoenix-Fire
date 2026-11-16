Model: sonnet (claude-sonnet-5-5)   Item: PF-008 Deep-link helper and stale anchors (R04, R05); `members.html#...` forwarder (R06)

Repo: /home/mrsuccess/Phoenix-Fire. Cut a branch from origin/main (`git switch -c <name> origin/main`, run unsandboxed; if it leaves you on the old branch because of staged
data files, use `git switch -m <name>`; if the branch then exists but HEAD is still the old one, `git symbolic-ref HEAD refs/heads/<name>`). Read CLAUDE.md,
PLANNING/SESSION-HANDOFF.md sections 1 to 5, LIBRARY/README.md and the PF-008 row of LIBRARY/roadmap.json. Details: "Still open later" in `PLANNING/DOCK-HUB-DETAILS.md`,
the R04/R05/R06 items in `.site-context/spec/REFACTOR.md`, and `PLANNING/NEXT-ITEMS-PROMPT.md` item 1 (verify `PhoenixDeeplink` in a real browser at 390 and 1440,
direct and from `burners.html`: `hub-clubhouse.html#ch-*`, `hub-handbook.html#hb-*`, `hub-matchnight.html#mn-*`, and the `members.html#...` forwarder).

## State right now
- PF-004 is DONE (most of it was already on main; the rest closed: `banner-recap.png` drawn, duplicate `auto:session-recap` registry row removed, guards added in `tests/botstudio.test.mjs`, `studio.mjs check` 0 FIX).
- PF-022 (Control Center CRM, DJ bridge push or poll) waits on an owner decision: do not start it, and PF-023 follows it. PF-005, PF-006, PF-007 and PF-025 are owner steps.
- Usage on 2026-11-16 was 73% of the 5-hour window at the start of PF-004. Write a fresh snapshot first (`node tools/brain/usage.mjs write --five <n> --week <n>`, numbers from the app usage tool); at 80% or more stop and report.

## Do next, in order
1. Check LIBRARY/CLAIMS.md and claim `next/`, `phoenix/build.mjs`.
2. Read what R04, R05 and R06 already built (they were finished and tested earlier); find which anchors are still stale or untested, and verify in a real browser (screenshots at 390 and 1440 for any visual change, text checks for logic).
3. Fix what fails: stale anchors, the deep-link helper, the `members.html#...` forwarder. Phoenix branding on everything touched; add or extend a test.
4. Tests, `node tools/library/sync.mjs`, `node tests/library.test.mjs`, `node tests/run.mjs`. Commit, push with the gh helper (unsandboxed), merge to main. Mark PF-008 DONE, set the next free item NEXT (not PF-022), write the next prompt and start that session.

## Gotchas
- Tests overwrite `site/`: rebuild after any test run (`node phoenix/build.mjs --out site`). A hook rewrites Bash calls with an `rtk` prefix and auto mode asks you to reissue them exactly.
- `studio.mjs capture` needs a built `site/`; `capture --cards` needs Chrome (run unsandboxed). Keep only new card files you need; the redraw rewrites hashed files.
- /tmp is a RAM tmpfs and filled up before: clean old /tmp/claude-1000 and /tmp/nxq-* if Bash says "Disk full".
- The design test "score card 1200 x 500 PNG" fails only where Chrome cannot launch (sandbox).
