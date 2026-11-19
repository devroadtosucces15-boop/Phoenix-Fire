Model: opus (claude-opus-5-5)   Item: PF-024 Item 20: the "Ghostly" bot (BLOCKED until the owner sends the link). Do not start it without the link.

Repo: /home/mrsuccess/Phoenix-Fire, branch cut from origin/main. Read CLAUDE.md, PLANNING/SESSION-HANDOFF.md sections 1, 3, 4, 5, 6, LIBRARY/README.md, LIBRARY/CLAIMS.md, the PF-024 row of
LIBRARY/roadmap.json and the Item 20 text of PLANNING/SIDE-ROADMAP-eager-yawning-lovelace.md.

## State right now
- Done: PF-022, PF-023, PF-024 Items 8 to 19, 21, 22, 23 (first slice), 24 and 25 (17 of 18 = 94%). Item 23 (`bot/arcade.js`, `bot/arcadegames.js`, migration 0078, flag `arcade` owner) is merged;
  its owner steps and the Activity hosting decision are in `PLANNING/PF-024-GO-LIVE.md`.
- Item 20 ("Ghostly" bot): the owner will send a link describing it. Do NOT guess its tools. If no link is in the session or in LIBRARY/CLAIMS.md/the notes folder, stop and say so.
- Arcade follow-ups (small, only on the owner's say): the other real-time games and the Discord Activity (needs the hosting decision), rematch button, open lobby, site page for records.
- Open inbox (small): Item 8 (one owner app per output, CI `result:<match>` claim, board-id compare-and-set, `/matchday` read replies ephemeral); Item 19 (season totals and medals not in D1);
  Item 21 (no site GIF page, no "post again", no GIF limits tool); Item 22 (importer, reason on Reject, DM to member, renaming); Item 24 (no manual bonus or deduction tool, no message or
  engagement points, predictions pay a computed amount, weekly DM text not owner-editable); Item 25 (no per-test rule overrides beyond `as`, no site tool); Item 23 (per-pair daily cap, arcade season reset).
- Latest migration used: 0078 (Item 23). Use 0079 or higher.

## Do next
1. With the link: one item, Item 20, following the wiring list of Items 18/19/22/24/25/23 (`git show` those commits): migration number above the latest, new Worker routes into `ROUTES` in
   `bot/ccpermissions.js`, channel purposes in `bot/orgconsts.js` and `bot/orgconfig.js`, registry entry, flag owner first, Phoenix branding test, owner steps listed not done.
2. `node tools/library/sync.mjs`, `node tests/library.test.mjs`, `node tests/run.mjs`, `node phoenix/build.mjs --out site`, commit, push with gh, merge to main, update only the PF-024 row (18 of 18 = 100).
3. Without the link: PF-024 stays open on Item 20; pick nothing else from this roadmap.

## Gotchas
- `node tests/run.mjs` needs a roomy TMPDIR (a folder inside the worktree, never committed; Chrome needs a SHORT path, so render cards with a TMPDIR under /tmp). Tests need a built site first
  (`node phoenix/build.mjs --out site`). Known environment failures: `tests/design.test.mjs` "renderer: the score card ... Chrome exited (null)" and a cardstudio timing flake (run it alone).
- The Bash hook (rtk) may make auto mode ask to reissue the exact quoted input; do that. Quote-heavy `node -e` breaks in zsh: write a script file.
- Never write a secret value; owner-only steps (deploy, migrations, Discord portal, command registration, flag flips, setting channels) are listed, not done.
