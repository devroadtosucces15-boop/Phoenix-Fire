Model: sonnet (claude-sonnet-5-5)   Item: PF-001 Land integrate-control-center and the operating system on main

Repo: /home/mrsuccess/Phoenix-Fire, branch `integrate-control-center`. Read CLAUDE.md, then PLANNING/SESSION-HANDOFF.md sections 1, 4 and 5, then
LIBRARY/README.md and only the roadmap row for PF-001.

## Goal
`main` holds the branch's Control Center work plus the new operating system (LIBRARY/, PLANNING/SESSION-HANDOFF.md, PLANNING/BRAIN-SPEC.md,
tools/library/, tests/library.test.mjs, the CLAUDE.md section), after the pre-commit NOREX check and green tests, with the site rebuilt.

## State right now
- Done and tested: library files and test (node tests/library.test.mjs: 26 passed), docs-fresh test passes.
- Written but not committed: everything above, plus the memory notes (outside the repo).
- Not started: the pre-commit check, the full test run, the commit, the merge.

## Do next, in order
1. `git status` and `git log main..HEAD --oneline` to see what the branch carries. Check LIBRARY/CLAIMS.md is empty of live claims.
2. Follow PLANNING/PRE-COMMIT-CHECK.md (full NOREX-leak check). Then `node tests/run.mjs`, then rebuild with `node phoenix/build.mjs --out site` (tests overwrite site/).
3. Commit in sensible groups (end each message with the Co-Authored-By line from the attribution reminder). Leave junk untracked files out: .claude/, .playwright-mcp/, .site-context/, .twitch-assets/.
4. Push with the gh credential helper (memory note git-push-gh-credential), open the PR, merge with `gh pr merge <n> --merge`. Never force-push main.
5. Mark PF-001 DONE in LIBRARY/ROADMAP.md with the date and commit, set PF-002 NEXT, run `node tools/library/sync.mjs` and `node tests/library.test.mjs`, write the next prompt.

## Decisions already made (do not re-open)
- Merge to main automatically after green checks (always-merge-to-main). Library holds names and places of secrets, never values.
- The project brain (PF-011 to PF-017) is specified in PLANNING/BRAIN-SPEC.md; do not start it in this session.

## Gotchas
- Tests overwrite site/ with the classic build: rebuild after any test run before browsing.
- Sandbox blocks pushing and sudo; run the push unsandboxed with the one-off gh credential helper.

## Out of scope
- Everything else; new finds go in the roadmap Inbox.

## When done
Update the roadmap row and library files, run node tests/library.test.mjs, write the next prompt, start the next session.
