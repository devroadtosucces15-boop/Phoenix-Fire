Model: opus (claude-opus-5-5)   Item: PF-012 Project brain: live dashboard v1

Repo: /home/mrsuccess/Phoenix-Fire, branch from origin/main (`git switch -c <name> origin/main`, run unsandboxed: the sandbox creates the branch but leaves HEAD behind).
Read CLAUDE.md, then PLANNING/SESSION-HANDOFF.md sections 1, 4 and 5, then LIBRARY/README.md, only the PF-012 entry of `LIBRARY/roadmap.json`, and PLANNING/BRAIN-SPEC.md (dashboard, tabs, build order).

## Goal
A local dashboard (`tools/brain/`): server with live refresh, tabs, a Roadmap home (items, phase and project percent, NEXT, inbox), Libraries, References and a Credentials registry view (names and places only). Visual target: the owner's Discord gallery plus the Control Center layout; use screenshots at 390, 820 and 1440 before and after.

## State right now
- Done: PF-011 (PR 10). `LIBRARY/roadmap.json` is the roadmap source; `tools/library/sync.mjs` exports `readRoadmap`, `roadmapMetrics`, `renderRoadmap` and writes `LIBRARY/ROADMAP.md`. Never edit ROADMAP.md by hand.
- Not started: everything under `tools/brain/`.

## Do next, in order
1. Check LIBRARY/CLAIMS.md; add a claim for `tools/brain/`.
2. Build the server (plain node, no new dependencies unless needed) reading `roadmap.json` and the library files; live refresh on file change.
3. Build the tabs per the spec, with screenshots before and after.
4. Add a test; run `node tools/library/sync.mjs`, `node tests/library.test.mjs`, `node tests/run.mjs` (Chrome: unsandboxed).
5. Commit, push with the gh helper (unsandboxed), PR, merge. Mark PF-012 DONE in `roadmap.json`, set PF-013 NEXT (PF-014 and PF-015 are also unblocked), regenerate, write the next prompt, start the next session.

## Decisions already made (do not re-open)
- Merge to main after green checks. The library never holds secret values. After PF-012, the side roadmap resumes at PF-018 once the brain window works (owner order).

## Gotchas
- /tmp is a 12G tmpfs shared with other sessions and was 100% full on 2026-11-15 (test leftovers `/tmp/pf-*`, `/tmp/norex-cards-*`); tests then crash with ENOSPC. Check `df /tmp` first and delete old leftovers.
- Tests overwrite site/ with the classic build; `.build-sitemap/` is not committed.
- Auto-mode may refuse a Bash call a hook rewrote (the `rtk` prefix); reissue it exactly as quoted.

## Out of scope
Maps (PF-013), brainstorm inbox (PF-014), usage probe (PF-015).
