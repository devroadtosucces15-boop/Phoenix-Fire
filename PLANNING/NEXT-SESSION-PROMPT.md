Model: sonnet (claude-sonnet-5-5)   Item: PF-024 Side roadmap Items 8 to 25: bot cleanup and new bot features (Items 8 to 19 are DONE; take Item 21, the GIF maker; Item 20 is blocked on the owner's link)

Repo: /home/mrsuccess/Phoenix-Fire, branch cut from origin/main. Read CLAUDE.md, then PLANNING/SESSION-HANDOFF.md sections 1, 3, 4, 5, 6, then
LIBRARY/README.md, LIBRARY/CLAIMS.md, the PF-024 row of LIBRARY/roadmap.json and the Item 21 text (line ~175) of PLANNING/SIDE-ROADMAP-eager-yawning-lovelace.md plus its Constraints paragraph.

## State right now
- Done: PF-022, PF-023, PF-024 Items 8 to 19. Item 19 (`bot/birthday.js`: /birthday set|visible|show|clear in the matchday app, the one daily poster folded in from `bot/fun.js`, purpose `birthdays`, ping group `ping_birthdays`, flag `birthday` owner, no migration: `profiles.birthday` + `bio_show.birthday`; owner steps and decisions in PLANNING/PF-024-GO-LIVE.md). Item 18 (`bot/highlight.js`, R2 `hl/` keys + D1 `highlights`, migration 0074, limits in config.json `highlight`) is the closest pattern for Item 21 (attachment in, R2 + D1 index, private receipt, limits from config, per-member daily limit).
- Item 20 stays blocked on the owner's link. Do not start it.
- Item 21 needs an owner decision that the plan flags: the Worker cannot transcode video, so the video-to-GIF converter must run elsewhere (CI job, the PC/VM process next to `dj/` with ffmpeg, or a hosted media service). Build everything that does not depend on it (command, validation of length and size from config, R2 input and output keys, D1 job table with status queued/done/failed, receipt, rate limit, a converter interface with a clearly named stub) and list the converter choice as the owner decision in PLANNING/PF-024-GO-LIVE.md; do not guess an external service or write a secret.
- Still open from Item 8 (inbox, small): one owner app per output (`events.discord_app`), CI `result:<match>` claim, board-id compare-and-set, `/matchday` read replies ephemeral. Item 19 inbox: Pro Clubs season totals and medals are not in D1, so the birthday DM leaves them out.
- Latest migration used: 0074. Use 0075 or higher (check bot/migrations/).
- Any new Worker route a staff tool uses goes into `ROUTES` in `bot/ccpermissions.js` (tests/cc-permissions.test.mjs). A new banner key needs `banner-<key>.png` in tools/bot-audit/out/cards plus its entry in cards.json (render just that job with a one-off script filtering `cardJobs` on key `['banner', '<key>']`; `studio.mjs check --strict` must say 0 to fix, `studio.mjs capture` clears the no-captured-reply warning). Regenerate `bot/registry.gen.js` with `node tools/bot-studio/studio.mjs registry`. New channel purposes go in `bot/orgconsts.js` and `bot/orgconfig.js` with a test that the module reads its channel from config.
- `node tests/run.mjs` needs free space in /tmp (3 GB free was enough). In the Bash sandbox a TMPDIR on the home disk is read-only: use the sandbox TMPDIR. A flaky cardstudio timing failure: run `node tests/cardstudio.test.mjs` alone. A stale `.git/config.lock` may block `git checkout -b ... origin/main` upstream setup (the branch is still created): use `--no-track`.

## Do next
1. One item per session: Item 21 (GIF maker) as above. Member submits a video of at most 15 s, gets back a GIF others can favourite; caps and length from config; private receipt; Phoenix branding with a test that fails on a NOREX name, colour or crest; the embed rule (Components V2 panel, icons, separators, footer); registry entries for new outputs; flag owner first.
2. Channels and roles from Organization config; follow the Item 18/19 wiring list (copy from `git show` of those commits).
3. `node tools/library/sync.mjs`, `node tests/library.test.mjs`, `node tests/run.mjs`, `node phoenix/build.mjs --out site`, commit, push with gh, merge to main, update only the PF-024 row (percent = items done of 18; 13 of 18 = 72 after Item 21), rewrite this file for Item 22 (emoji and sticker suggester; Item 20 stays blocked unless the owner has sent the link).

## Gotchas
- The worktree may live on /mnt/DEV_WORK: the Bash sandbox treats it as read-only there, so edits and tests may need an unsandboxed Bash. Run the full `node tests/run.mjs` (with its build); `--no-build` fails page checks.
- Tests need a built site/ (node phoenix/build.mjs --out site) and overwrite it. Roadmap text must not contain NOREX hex colours.
- Never write a secret value; owner-only steps (deploy, migrations, Discord portal, converter hosting) are listed, not done.
