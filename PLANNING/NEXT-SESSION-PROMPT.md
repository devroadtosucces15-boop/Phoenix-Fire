Model: sonnet (claude-sonnet-5-5)   Item: PF-024 Side roadmap Items 8 to 25: bot cleanup and new bot features (Items 8 to 18 are DONE; take Item 19, birthdays)

Repo: /home/mrsuccess/Phoenix-Fire, branch cut from origin/main. Read CLAUDE.md, then PLANNING/SESSION-HANDOFF.md sections 1, 3, 4, 5, 6, then
LIBRARY/README.md, LIBRARY/CLAIMS.md, the PF-024 row of LIBRARY/roadmap.json and plan sections 5c of PLANNING/SIDE-ROADMAP-eager-yawning-lovelace.md (Items 16 to 18 section, line ~158, and the Constraints paragraph).

## State right now
- Done: PF-022, PF-023, PF-024 Items 8 to 18. Item 18 (`bot/highlight.js`, /highlight upload|mine|delete|list in the matchday app, R2 `hl/` keys + D1 `highlights` index, migration 0074, flag `highlight` owner, limits in config.json `highlight` copied to Worker var `HIGHLIGHT` by bot.yml, purpose `highlights` for an optional card; owner steps and decisions in PLANNING/PF-024-GO-LIVE.md). Item 17 (`bot/absence.js`, migration 0073) and Item 16 (`bot/biocard.js`, migration 0072, the bio card; Item 19 adds a birthday field to it) are the closest patterns.
- Item 20 stays blocked on the owner's link. Do not start it.
- Still open from Item 8 (inbox, small): one owner app per output (`events.discord_app`), CI `result:<match>` claim, board-id compare-and-set, `/matchday` read replies ephemeral.
- Any new Worker route a staff tool uses goes into `ROUTES` in `bot/ccpermissions.js` (tests/cc-permissions.test.mjs). A new banner key needs `banner-<key>.png` in tools/bot-audit/out/cards plus its entry in cards.json (render just that job: see how Item 18 did it with a one-off script filtering `cardJobs` on key `['banner', '<key>']`; `studio.mjs check --strict` must say 0 to fix, `studio.mjs capture` clears the no-captured-reply warning). Regenerate `bot/registry.gen.js` with `node tools/bot-studio/studio.mjs registry`.
- Latest migration used: 0074. Use 0075 or higher.
- `node tests/run.mjs` needs free space in /tmp (it was full): set `TMPDIR` to a folder on the home disk. A flaky cardstudio timing failure: run `node tests/cardstudio.test.mjs` alone.

## Do next
1. One item per session: Item 19 (birthdays) in PLANNING/SIDE-ROADMAP-eager-yawning-lovelace.md (line ~172): `/birthday` stores the date from the bio (Item 16: the bio command gains a birthday field with a visibility toggle, year optional). On the day: a personalised Phoenix card in a configured channel (purpose `birthdays`; a role ping is configurable; `@everyone` only if the owner explicitly chooses it) mentioning the player, plus a private DM with a heartfelt message built from real data (join date, games, goals, assists, MOTMs, medals, badges, points) with a safe fallback when stats are missing. Birthdays already post through the fun app (`bot/worker.js:79`): reuse and fold that in rather than adding a second birthday poster (duplicate rule; `bot/once.js` claims prevent double posts). Check `bot/profiles.js` and `bot/biocard.js` for the existing fields. Personal data: only fields the member chose to share, and the year is optional.
2. Channels and roles from Organization config; Phoenix branding on every output with a test that fails on a NOREX name, colour or crest; registry entry for new outputs; the embed rule (Components V2 panel, icons, separators, footer). Follow the Item 17/18 wiring list (copy from `git show <item 18 commit>`).
3. `node tools/library/sync.mjs`, `node tests/library.test.mjs`, `node tests/run.mjs`, `node phoenix/build.mjs --out site`, commit, push with gh, merge to main, update only the PF-024 row (percent = items done of 18; 12 of 18 = 67 after Item 19), rewrite this file for Item 21 (Item 20 is blocked; skip to 21 unless the owner has sent the link).

## Gotchas
- The worktree may live on /mnt/DEV_WORK: the Bash sandbox treats it as read-only there, so edits and tests may need an unsandboxed Bash. Set `TMPDIR` to a roomy folder when /tmp is nearly full. Run the full `node tests/run.mjs` (with its build); `--no-build` fails page checks.
- Tests need a built site/ (node phoenix/build.mjs --out site) and overwrite it. Roadmap text must not contain NOREX hex colours.
- Never write a secret value; owner-only steps (deploy, migrations, Discord portal) are listed, not done.
