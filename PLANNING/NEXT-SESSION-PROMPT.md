Model: sonnet (claude-sonnet-5-5)   Item: PF-015 Project brain: usage probe, snapshots, policy, banner, notification, save mode

Repo: /home/mrsuccess/Phoenix-Fire, branch from origin/main (`git switch -c <name> origin/main`, run unsandboxed: the sandbox creates the branch but leaves HEAD behind).
Read CLAUDE.md, then PLANNING/SESSION-HANDOFF.md sections 1, 4 and 5, then LIBRARY/README.md, only the PF-015 entry of `LIBRARY/roadmap.json`, and PLANNING/BRAIN-SPEC.md (the "Usage reading" and "Save mode" decisions).

## Goal
The brain dashboard shows the current 5-hour and weekly usage with its age, a save-mode banner when a threshold is crossed, and a browser notification. First test whether usage can be read outside a session (status line or another local source); if not, sessions write snapshots to `LIBRARY/state/usage.json`.

## State right now
- Done: PF-012 to PF-014. Tabs Roadmap, Maps, Inputs and outputs, Brainstorm, Libraries, References, Credentials; `tests/brain.test.mjs` (36 checks). Brainstorm store is `tools/brain/inbox.mjs`; the server has two local-only POST routes (`writeRoute` in `tools/brain/serve.mjs`: loopback, JSON, 4 KB cap), reuse that pattern for anything the page writes.
- `node tools/brain/serve.mjs` serves 127.0.0.1:4577 with live refresh. Data in `model()` of `tools/brain/lib.mjs`, page in `tools/brain/index.html`, plain HTML and node, no dependencies. `WATCH` in lib.mjs lists paths that refresh the page.
- Not started: usage probe, `LIBRARY/state/`, policy file, banner, notification.

## Do next, in order
1. Check LIBRARY/CLAIMS.md; claim `tools/brain/`, `LIBRARY/state/`.
2. Probe: can a plain node script read the 5-hour and weekly percent (status line, local Claude files)? Record the answer in BRAIN-SPEC.md. If not, define `LIBRARY/state/usage.json` (percent, reset times, timestamp, source) plus `usage-policy.json` (thresholds 80% five-hour, 85% weekly).
3. Add a Usage tab or header strip: latest snapshot with age, save-mode banner (only `lowHanging` items), Notification API alert when crossed. Screenshots at 390, 820 and 1440 before and after.
4. Extend `tests/brain.test.mjs`; run `node tools/library/sync.mjs`, `node tests/library.test.mjs`, `node tests/run.mjs` (Chrome: unsandboxed).
5. Commit, push with the gh helper (unsandboxed), PR, merge. Mark PF-015 DONE in `roadmap.json`, set the next open item NEXT (PF-016), run sync.mjs, write the next prompt, start the next session.

## Decisions already made (do not re-open)
- Merge to main after green checks. No secret values anywhere. A running session cannot be switched into save mode from outside; the rule is policy plus banner (BRAIN-SPEC).

## Gotchas
- /tmp is a small shared tmpfs (was 96% full); check `df /tmp` first and use the scratchpad. Playwright screenshots must be saved inside the repo folder then deleted.
- Tests overwrite site/ with the classic build; rebuild with `node phoenix/build.mjs --out site` if you need the site.
- Do not use `pkill -f` or `pgrep -f` with a pattern that appears in your own command line; stop the dashboard with `kill <pid>` from `ss -ltnp`.

## Out of scope
Usage intelligence and lessons (PF-016), hosted mirror (PF-017).

## When done
Update the roadmap row and library files, run node tests/library.test.mjs, write the next prompt, start the next session.
