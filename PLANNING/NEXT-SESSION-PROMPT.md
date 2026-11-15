Model: sonnet (claude-sonnet-5-5)   Item: PF-014 Project brain: brainstorm inbox (typed and dictated) with end-of-session reminders

Repo: /home/mrsuccess/Phoenix-Fire, branch from origin/main (`git switch -c <name> origin/main`, run unsandboxed: the sandbox creates the branch but leaves HEAD behind).
Read CLAUDE.md, then PLANNING/SESSION-HANDOFF.md sections 1, 4 and 5, then LIBRARY/README.md, only the PF-014 entry of `LIBRARY/roadmap.json`, and PLANNING/BRAIN-SPEC.md (tab Brainstorm, voice notes decision).

## Goal
A Brainstorm tab in the brain dashboard (`tools/brain/`): type a thought or dictate one (browser microphone to text), notes stored as files in `LIBRARY/inbox/` (no secrets), listed newest first. End-of-session reminder: each open idea gets "tackle it or drop it" (a `node tools/brain/reminders.mjs` that prints open ideas, plus the row on the page). Screenshots at 390, 820 and 1440 before and after.

## State right now
- Done: PF-012 (server, tabs Roadmap, Libraries, References, Credentials) and PF-013 (tabs Maps and Inputs and outputs; `tools/brain/maps.mjs`; 19 checks in `tests/brain.test.mjs`).
- `node tools/brain/serve.mjs` serves 127.0.0.1:4577 with live refresh. Data in `model()` of `tools/brain/lib.mjs`, page in `tools/brain/index.html`, plain HTML and node, no dependencies. `WATCH` in lib.mjs lists the paths that refresh the page (add `LIBRARY/inbox`; `LIBRARY` is already watched).
- The server is read-only today: add a small POST route (127.0.0.1 only, size-capped, text only) for new notes and for tackle/drop.
- Not started: Brainstorm.

## Do next, in order
1. Check LIBRARY/CLAIMS.md; claim `tools/brain/`, `LIBRARY/inbox/`.
2. Add the note store (one markdown file per idea with date, text, status open/tackled/dropped), the POST route, the tab (type box, microphone button where `webkitSpeechRecognition` exists, list with Tackle and Drop), and `reminders.mjs`.
3. Extend `tests/brain.test.mjs` (store, route rejects non-local and oversize, no secret-shaped text stored). Run `node tools/library/sync.mjs`, `node tests/library.test.mjs`, `node tests/run.mjs` (Chrome: unsandboxed).
4. Commit, push with the gh helper (unsandboxed), PR, merge. Mark PF-014 DONE in `roadmap.json`, set the next open item NEXT (PF-015), regenerate with sync.mjs, write the next prompt, start the next session.

## Decisions already made (do not re-open)
- Merge to main after green checks. No secret values anywhere. Dictation is text only for now (no audio file, no offline transcription).

## Gotchas
- /tmp is a small shared tmpfs; check `df /tmp` first. Tests overwrite site/ with the classic build; rebuild with `node phoenix/build.mjs --out site` after if you need the site.
- Do not use `pkill -f` or `pgrep -f` with a pattern that appears in your own command line. Stop the dashboard with `kill <pid>` from `ss -ltnp | grep 4577`.

## Out of scope
Usage probe (PF-015), hosted mirror (PF-017).

## When done
Update the roadmap row and library files, run node tests/library.test.mjs, write the next prompt, start the next session.
