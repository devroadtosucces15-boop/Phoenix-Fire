Model: sonnet (claude-sonnet-5-5)   Item: PF-003 Dock browser check and hub page sweep at 390, 820, 1440

Repo: /home/mrsuccess/Phoenix-Fire. Cut a branch from origin/main (`git switch -c <name> origin/main`, run unsandboxed). Read CLAUDE.md,
PLANNING/SESSION-HANDOFF.md sections 1 to 5, LIBRARY/README.md and the PF-003 row of LIBRARY/roadmap.json (details in
`PLANNING/DOCK-HUB-DETAILS.md`).

## State right now
- PF-017 is DONE: the brain snapshot is published as a private Artifact (https://claude.ai/artifact/XyziYyVtcpdwsghV8G6Y72). Run
  `node tools/brain/publish.mjs` and republish it when you change `tools/brain/` or the library (handoff section 7 step 6); never read it back.
- PF-022 (Control Center CRM, DJ bridge push or poll) waits on an owner decision: do not start it, and PF-023 follows it. PF-020 is PAUSED for
  the owner (PLANNING/PF-020-4D-DECISION.md): do not touch Card Studio provider or limits. PF-005, PF-006, PF-007 and PF-025 are owner steps.

## Do next, in order
1. Check LIBRARY/CLAIMS.md and claim the dock and hub files you touch.
2. Browser check of the dock and hub pages at 390, 820 and 1440, screenshots before and after (design rule), as the row and DOCK-HUB-DETAILS.md describe.
3. Phoenix branding on everything the pages feed; add or extend a test for any rebrand.
4. Tests, `node tools/library/sync.mjs`, `node tests/library.test.mjs`, `node tests/run.mjs` (design test needs Chrome, unsandboxed).
5. Commit, push with the gh helper (unsandboxed), merge to main. Mark PF-003 DONE, set the next free item NEXT, write the next prompt.

## Gotchas
- Tests overwrite `site/`: rebuild after any test run. A hook may rewrite a Bash call (the `rtk` prefix) and auto mode asks you to reissue it exactly.
- If /tmp is full, set `TMPDIR=/dev/shm/<short>` (short: Chrome fails on a long TMPDIR). `node phoenix/build.mjs --live` shows real stats.
