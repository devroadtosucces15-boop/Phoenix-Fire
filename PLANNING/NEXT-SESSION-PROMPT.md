Model: opus (claude-opus-5-5)   Item: PF-016 Project brain: usage intelligence, lessons and improvement plans

Repo: /home/mrsuccess/Phoenix-Fire, branch from origin/main (`git switch -c <name> origin/main`, run unsandboxed: the sandbox creates the branch but leaves HEAD behind).
Read CLAUDE.md, then PLANNING/SESSION-HANDOFF.md sections 1, 4 and 5, then LIBRARY/README.md, only the PF-016 entry of `LIBRARY/roadmap.json`, and PLANNING/BRAIN-SPEC.md (the "Usage intelligence" decision).

## Goal
Per session and per roadmap item: turns, tokens, duration, share of context, tool mix, percent of the window consumed (from usage snapshots). Rules (no model) flag likely causes (very long session, large screenshots, repeated failing commands, big file reads) and write short lessons to `LIBRARY/LESSONS.md`; the brain page lists them as improvement plans.

## State right now
- Done: PF-012 to PF-015. Brain tabs Roadmap, Maps, Inputs and outputs, Brainstorm, Usage, Libraries, References, Credentials; `tests/brain.test.mjs` (49 checks).
- Usage: `tools/brain/usage.mjs` (snapshot write/read, `evaluate`, `usageModel`), `LIBRARY/state/usage.json` (latest + 200 history), `usage-policy.json` (80% five-hour, 85% weekly, 90 min stale). Probe result in BRAIN-SPEC: usage percent is not readable by a standalone script, so sessions write snapshots. Page: header strip, Usage tab, save-mode banner, browser notification.
- Local session data for the analysis: `~/.claude/metrics/costs.jsonl` (tokens and cost per session, transcript_path) and the transcript jsonl files. Read counts and tool names only; never copy message text or any secret into the repo.
- Not started: analysis script, `LIBRARY/LESSONS.md`, improvement-plans section on the page.

## Do next, in order
1. Check LIBRARY/CLAIMS.md; claim `tools/brain/`, `LIBRARY/LESSONS.md`.
2. Write `tools/brain/intel.mjs` (no dependencies, no model): per session turns, tokens, duration, tool mix, image count, repeated failing commands, big reads; map sessions to roadmap items by branch or id in the title where possible; usage percent per item from snapshot deltas.
3. Rules to lessons: short, dated lines in `LIBRARY/LESSONS.md`, no duplicates. Page: a section on the Usage tab listing improvement plans. Screenshots at 390, 820 and 1440 before and after (built-in browser; headless chrome screenshots hang on the live page).
4. Extend `tests/brain.test.mjs` (fixtures, not real transcripts); run `node tools/library/sync.mjs`, `node tests/library.test.mjs`, `node tests/run.mjs`.
5. Commit, push with the gh helper (unsandboxed), PR, merge. Mark PF-016 DONE in `roadmap.json`, set the next open item NEXT (PF-017), run sync.mjs, write the next prompt, start the next session.

## Decisions already made (do not re-open)
- Merge to main after green checks. No secret values anywhere. The analysis runs without a model; a session adds the "why" only when asked.

## Gotchas
- /tmp is a small shared tmpfs (97% full); check `df /tmp`, use the scratchpad.
- Do not leave test snapshots in `LIBRARY/state/usage.json`; tests restore it, manual checks must too.
- Do not use `pkill -f` or `pgrep -f` with a pattern in your own command line; stop the dashboard with `kill <pid>` from `ss -ltnp`.

## Out of scope
Hosted mirror (PF-017).

## When done
Update the roadmap row and library files, run node tests/library.test.mjs, write the next prompt, start the next session.
