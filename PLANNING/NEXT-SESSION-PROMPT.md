Model: opus (claude-opus-5-5)   Item: PF-013 Project brain: maps with drill-in, and the inputs and outputs folders

Repo: /home/mrsuccess/Phoenix-Fire, branch from origin/main (`git switch -c <name> origin/main`, run unsandboxed: the sandbox creates the branch but leaves HEAD behind).
Read CLAUDE.md, then PLANNING/SESSION-HANDOFF.md sections 1, 4 and 5, then LIBRARY/README.md, only the PF-013 entry of `LIBRARY/roadmap.json`, and PLANNING/BRAIN-SPEC.md (tabs Maps and Inputs and outputs).

## Goal
Two new tabs in the brain dashboard (`tools/brain/`): Maps (site map and bot map you can drill into: page, what builds it, what it reads, what it posts) and Inputs and outputs (one folder per feature: what goes in, what comes out). Built from `LIBRARY/SITEMAP-INDEX.md`, `LIBRARY/BOT-COMMANDS.md` and `tools/bot-studio/lib/deps.mjs`. Screenshots at 390, 820 and 1440 before and after.

## State right now
- Done: PF-012 (PR 11). `node tools/brain/serve.mjs` serves 127.0.0.1:4577 with live refresh; tabs Roadmap, Libraries, References, Credentials. Data in `tools/brain/lib.mjs` (`model()`), page in `tools/brain/index.html`, tests in `tests/brain.test.mjs` (14 checks).
- Not started: Maps, Inputs and outputs.

## Do next, in order
1. Check LIBRARY/CLAIMS.md; add a claim for `tools/brain/`.
2. Extend `model()` with `maps` (pages from SITEMAP-INDEX.md, commands from BOT-COMMANDS.md, dependencies from deps.mjs) and `io` (per-feature inputs and outputs); add the two tabs to `index.html` with drill-in rows.
3. Extend `tests/brain.test.mjs`; run `node tools/library/sync.mjs`, `node tests/library.test.mjs`, `node tests/run.mjs` (Chrome: unsandboxed).
4. Commit, push with the gh helper (unsandboxed), PR, merge. Mark PF-013 DONE in `roadmap.json`, set the next open item NEXT (PF-014 and PF-015 are unblocked), regenerate with sync.mjs, write the next prompt, start the next session.

## Decisions already made (do not re-open)
- Merge to main after green checks. No secret values anywhere; the credentials view stays names and places only. Page is plain HTML and node, no dependencies.

## Gotchas
- /tmp is a small tmpfs shared with other sessions and was near full on 2026-11-15; check `df /tmp` and delete old `/tmp/pf-*` leftovers before tests.
- Tests overwrite site/ with the classic build; rebuild with `node phoenix/build.mjs --out site` after. Auto-mode may refuse a Bash call a hook rewrote (the `rtk` prefix); reissue it exactly as quoted.
- Do not use `pkill -f` or `pgrep -f` with a pattern that appears in your own command line: it kills the shell.

## Out of scope
Brainstorm inbox (PF-014), usage probe (PF-015).

## When done
Update the roadmap row and library files, run node tests/library.test.mjs, write the next prompt, start the next session.
