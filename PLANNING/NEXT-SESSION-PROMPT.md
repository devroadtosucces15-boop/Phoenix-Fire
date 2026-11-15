Model: sonnet (claude-sonnet-5-5)   Item: PF-018 Side roadmap step 2: links (Phases A, B, D1, D5)

Repo: /home/mrsuccess/Phoenix-Fire. Cut a branch from origin/main (`git switch -c <name> origin/main`, run unsandboxed). Read CLAUDE.md, PLANNING/SESSION-HANDOFF.md sections 1, 4 and 5, LIBRARY/README.md, then only the PF-018 row of LIBRARY/roadmap.json and section 2 of PLANNING/SIDE-ROADMAP-eager-yawning-lovelace.md (the owner's side roadmap, now merged into the master roadmap as PF-018 to PF-025).

## Goal
Every button, notification, DM and redirect lands on a current, correct page; no feature has a second landing page. Root cause to fix first: card notifications link to `members.html#cards` (claim page in the Phoenix build, no `cards` key in the forwarder `HASH_MAP`, bell falls back to a 404). Real targets: `staff-artwork.html` (manager approval queue) and `hub-cardstudio.html#lk-cards` (member).

## State right now
- The side roadmap's Item 3 backend (EA decoded columns) and PR 6 (decoded stats, recap) are already on main. Nothing in step 2 is confirmed done: this row is marked verify, so check each part against the code before changing it.
- The project brain dashboard (PF-011 to PF-015) works locally: `node tools/brain/serve.mjs`, http://127.0.0.1:4577. PF-016 and PF-017 are queued after this item.

## Do next, in order
1. Check LIBRARY/CLAIMS.md and add your claim for `next/`, `bot/cardstudio.js`, `phoenix/`.
2. A1: one shared link resolver used by `next/static/alerts.js` ROUTE, `header.js` `room()`, `pages.js`, `LK_FWD` (`next/pages/hub.mjs`) and `HASH_MAP` / `phoenix/claim.html`; drop the `../` fallback; add missing keys (cards, stats, discoveries, trials, vote, suggestions, points, portal, portal-reports, schedule-<id> prefix). This also fixes rows already in D1 and DMs already sent.
3. B1: `bot/cardstudio.js` links (managers to `staff-artwork.html`, members to `hub-cardstudio.html#lk-cards`). B2: dead page names in bot strings (`docs.html`, `feed.html`, `messages.html`, `builder.html`, `compare.html`, `apply.html`, `static/crest-sm.png`, `tactics.html#play` to `playbook.html#play`, `../members.html*` in `mylocker.js` and `playbook.js`). B3: missing anchors (`stats.html#h2h`, `about.html#requests`, `updates.html#<slug>`).
4. D1: redirect stubs in the Phoenix build for dead legacy names (players/<id>.html, matches/<id>.html, docs, feed, messages, builder, compare, apply). D5: keep `#hash` through sign-in (`next/static/session.js`).
5. New test: every bot link literal and every resolver target resolves to a built page; plus brand and leakcheck. Then `node tools/library/sync.mjs`, `node tests/library.test.mjs`, `node tests/run.mjs` (design test needs Chrome: run it unsandboxed), rebuild `node phoenix/build.mjs --out site`.
6. Commit, push with the gh helper (unsandboxed), PR, merge. Mark PF-018 DONE with commit, set PF-019 NEXT, write the next prompt, start the next session. Note what goes live with the merge (the bot deploys from main: B1 needs a Worker deploy).

## Decisions already made (do not re-open)
- Latest version of a feature wins; no feature gets a second landing page; Phoenix branding on every output; merge to main after green checks. New design choices in the library get a row in LIBRARY/DESIGN.md.

## Gotchas
- Tests overwrite `site/` with the classic build: rebuild after any test run. Auto-mode may refuse a Bash call a hook rewrote (the `rtk` prefix): reissue it exactly as quoted. `git switch -c` needs the sandbox off.

## Out of scope
- Step 3 (menu gaps, PF-019) and everything else; new finds go in the roadmap inbox (`LIBRARY/roadmap.json`).

## When done
Update the roadmap and library files, run node tests/library.test.mjs, write the next prompt, start the next session.
