Model: opus (claude-opus-5-5)   Item: PF-016 Project brain: usage intelligence, lessons and improvement plans

Repo: /home/mrsuccess/Phoenix-Fire. Cut a branch from origin/main (`git switch -c <name> origin/main`, run unsandboxed). Read CLAUDE.md,
PLANNING/SESSION-HANDOFF.md sections 1 to 5, LIBRARY/README.md and the PF-016 row of LIBRARY/roadmap.json (area `tools/brain/`,
`LIBRARY/LESSONS.md`; depends on PF-015, which is done).

## State right now
- PF-021 is DONE (match page Box score tab with decoded columns and Total / Per 90, extended team comparison, Discord box score card with
  Int/Won/Lost/Aer, `scripts/lib/boxscore.mjs`, `tests/boxscore.test.mjs`).
- PF-022 (Control Center CRM, DJ bridge push or poll) still waits on an owner decision: do not start it. PF-020 is PAUSED for the owner
  (PLANNING/PF-020-4D-DECISION.md): do not touch Card Studio provider or limits. PF-017 is OPEN and can follow PF-016.

## Do next, in order
1. Check LIBRARY/CLAIMS.md and claim `tools/brain/`, `LIBRARY/LESSONS.md`.
2. Build per-session and per-item usage intelligence, lessons and improvement plans as the PF-016 row describes.
3. Tests, `node tools/library/sync.mjs`, `node tests/library.test.mjs`, `node tests/run.mjs` (design test needs Chrome, unsandboxed).
4. Commit, push with the gh helper (unsandboxed), PR, merge. Mark PF-016 DONE, set the next free item NEXT, write the next prompt.

## Gotchas
- Tests overwrite `site/`: rebuild after any test run. The brain test "inbox: listed newest first" can flake within one second.
- A hook may rewrite a Bash call (the `rtk` prefix) and auto mode asks you to reissue it exactly. `git switch -c` needs the sandbox off.
- If /tmp is full (tmpfs 100%), set `TMPDIR=/dev/shm/<short>` for builds and tests. Keep it short: Chrome fails on a long TMPDIR
  ("Socket path too long"). `node phoenix/build.mjs` with no `--live` uses mock data without event counters; use `--live` to see real
  decoded stats on match pages.
