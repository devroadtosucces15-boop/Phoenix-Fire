Model: opus (claude-opus-5-5)   Item: PF-024 Item 23: the arcade bot (Items 8 to 19, 21, 22, 24 and 25 are DONE; Item 20 is blocked on the owner's link; Item 23 is the last one)

Repo: /home/mrsuccess/Phoenix-Fire, branch cut from origin/main. Read CLAUDE.md, then PLANNING/SESSION-HANDOFF.md sections 1, 3, 4, 5, 6, then
LIBRARY/README.md, LIBRARY/CLAIMS.md, the PF-024 row of LIBRARY/roadmap.json and the Item 23 text (line ~169, "Arcade bot") of
PLANNING/SIDE-ROADMAP-eager-yawning-lovelace.md plus its Constraints paragraph.

## State right now
- Done: PF-022, PF-023, PF-024 Items 8 to 19, 21, 22, 24 and 25 (16 of 18 = 89%). Item 24 (`bot/points.js`, migration 0077, flag `pointsEconomy` owner,
  `scripts/lib/pointspush.mjs`, Control Center area `points`) is merged; its owner steps and decisions are in `PLANNING/PF-024-GO-LIVE.md`.
- Item 20 stays blocked on the owner's link. Do not start it.
- Item 23 (arcade, about 10 multiplayer short games, invites to a server member, game records and its own score system tied into the shared points) is the
  last PF-024 item. Large: CHECK REUSE FIRST (the existing mini game `bot/game.js`, the `ClubRoom` Durable Object `bot/clubroom.js` for realtime rooms, `bot/predict.js`,
  the rush ladder, the music rooms) before building anything.
- Points hook already there: `awardRule(env, userId, 'games.played' | 'games.won', reason, { ref })` in `bot/points.js` (amounts editable in the Control Center,
  once-only per member through `ref`, owner-first through the flag `pointsEconomy`). Use it; do not add a second ledger.
- Owner DECISION NEEDED before the Discord Activity part: where the Activity web app is hosted. A Discord Activity needs a hosted page that uses the Embedded App SDK
  (the Phoenix Pages site cannot add the Activity URL mapping or the OAuth redirect by itself) and a realtime backend (a Durable Object room like `ClubRoom` on the
  `phoenix-bot` Worker, or a separate Worker). Options: (a) the Pages site hosts the Activity page and the Worker hosts the rooms (one account host, the Discord portal needs the URL
  mapping and the Activity enabled); (b) a separate Cloudflare Pages/Worker project for the arcade. Until the owner picks, build the in-message version (turn-based games with
  buttons in an ephemeral or channel message, state in D1) and keep the game logic in pure modules the Activity can reuse later. List the decision in `PLANNING/PF-024-GO-LIVE.md`
  and do NOT touch the Discord portal.
- Open inbox (small): Item 8 (one owner app per output, CI `result:<match>` claim, board-id compare-and-set, `/matchday` read replies ephemeral); Item 19 (season totals and medals not in
  D1); Item 21 (no site GIF page, no "post again", no GIF limits tool); Item 22 (importer, reason on Reject, DM to member, renaming); Item 24 (no manual bonus or deduction tool, no
  message or engagement points: needs a source and an owner decision, predictions still pay a computed amount instead of a rule, the weekly DM text is not owner-editable);
  Item 25 (no per-test rule overrides beyond `as`, no site tool, `/bot-new` does not yet add a sample step).
- Latest migration used: 0077 (Item 24). Use 0078 or higher (check bot/migrations/).
- New Worker routes a staff tool uses go into `ROUTES` in `bot/ccpermissions.js` (add paths to PATHS in tests/cc-permissions.test.mjs). A new banner key needs `banner-<key>.png`
  in tools/bot-audit/out/cards (draw with `TMPDIR=/tmp/x node tools/bot-audit/render-cards.mjs`, unsandboxed; keep TMPDIR short or Chrome fails on the socket path) plus its cards.json
  entry, or reuse an existing family in `BANNER_BY_COMMAND`. New channel purposes go in `bot/orgconsts.js` and `bot/orgconfig.js` with a test that the module reads its channel
  from config. After any new output or command run `node tools/bot-studio/studio.mjs capture`, `registry`, `testview`, `check --strict`.
- `node tests/run.mjs` needs a roomy TMPDIR (/tmp can be nearly full: use a folder inside the worktree, e.g. `.claude/tmp23`, never commit it; but Chrome needs a SHORT path, so
  render cards with a TMPDIR under /tmp). Tests need a built site first (`node phoenix/build.mjs --out site`). Known environment failures: `tests/design.test.mjs` "renderer: the score
  card ... Chrome exited (null)" (Chrome in the sandbox) and a cardstudio timing flake (run `node tests/cardstudio.test.mjs` alone).
- The Bash hook (rtk) rewrites commands, and auto mode then asks to reissue the exact quoted input; do that. Quote-heavy `node -e` one-liners break in zsh: write a script file in the scratchpad.

## Do next
1. One item per session: Item 23. Split it if it is too big for one session (for example games 1 to 5 first), write the rest into the Inbox and this file. Follow the points hook above,
   Phoenix branding with a test that fails on a NOREX name, colour or crest, the embed rule (Components V2 panel, icons, separators, footer), registry entries, flag owner first.
2. Channels and roles from Organization config; follow the Item 18/19/22/24 wiring list (copy from `git show` of those commits).
3. `node tools/library/sync.mjs`, `node tests/library.test.mjs`, `node tests/run.mjs`, `node phoenix/build.mjs --out site`, commit, push with gh, merge to main, update only the PF-024 row
   (percent = items done of 18; 17 of 18 = 94 after Item 23). The next after Item 23 is Item 20 only when the owner has sent the link; otherwise PF-024 stays open on Item 20.

## Gotchas
- The worktree may live on /mnt/DEV_WORK: the Bash sandbox treats it as read-only there, so edits and tests may need an unsandboxed Bash. Run the full `node tests/run.mjs` (with its build); `--no-build` fails page checks.
- Tests need a built site/ (node phoenix/build.mjs --out site) and overwrite it. Roadmap text must not contain NOREX hex colours.
- Never write a secret value; owner-only steps (deploy, migrations, Discord portal, command registration, flag flips, setting channels, the Activity URL mapping) are listed, not done.
