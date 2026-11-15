Model: sonnet (claude-sonnet-5-5)   Item: PF-019 Side roadmap step 3: menu gaps and duplicates (Phase C)

Repo: /home/mrsuccess/Phoenix-Fire. Cut a branch from origin/main (`git switch -c <name> origin/main`, run unsandboxed). Read CLAUDE.md, PLANNING/SESSION-HANDOFF.md sections 1, 4 and 5, LIBRARY/README.md, then only the PF-019 row of LIBRARY/roadmap.json and section 3 of PLANNING/SIDE-ROADMAP-eager-yawning-lovelace.md.

## Goal
Menus (dock, header, hub and staff menus) show every real page once, with no duplicate entries and no gaps; each entry lands on the one current page of its feature. The row is marked verify: confirm each gap against the code and a fresh build before changing anything.

## State right now
- PF-018 (links) is merged: one link map `next/lib/linkmap.mjs`, `PhoenixLinks.resolve` (`next/static/links.js`), legacy stubs from `phoenix/build.mjs`, `tests/linkresolve.test.mjs`. New menu targets must be real pages; add any new legacy key to `linkmap.mjs`, not a second resolver.
- Card Studio notification links (B1) need a Worker deploy to go live (owner step, deploys from main).
- Known flake, not yours: `tests/brain.test.mjs` "inbox: listed newest first" fails when two notes get the same second.
- PF-016 and PF-017 (project brain) are queued after this item.

## Do next, in order
1. Check LIBRARY/CLAIMS.md and add your claim for the menu files (`next/lib/ui.mjs`, menu modules).
2. List every menu entry from a fresh build (`node phoenix/build.mjs --out site`) against the page list in LIBRARY/SITEMAP-INDEX.md; write the gaps and duplicates found.
3. Fix them per section 3 of the side roadmap. Keep one landing page per feature.
4. Test: extend or add a test that every menu entry resolves to a built page once; brand and leakcheck.
5. `node tools/library/sync.mjs`, `node tests/library.test.mjs`, `node tests/run.mjs` (design test needs Chrome: run it unsandboxed), rebuild `node phoenix/build.mjs --out site`.
6. Commit, push with the gh helper (unsandboxed), PR, merge. Mark PF-019 DONE, set the next item NEXT in the master roadmap (side roadmap step 4, PF-020), write the next prompt, start the next session.

## Decisions already made (do not re-open)
- Latest version of a feature wins; no feature gets a second landing page; Phoenix branding on every output; merge to main after green checks. New design choices in the library get a row in LIBRARY/DESIGN.md.

## Gotchas
- Tests overwrite `site/` with the classic build: rebuild after any test run. Auto-mode may refuse a Bash call a hook rewrote (the `rtk` prefix): reissue it exactly as quoted. `git switch -c` needs the sandbox off.

## Out of scope
- Step 4 and later; new finds go in the roadmap inbox (`LIBRARY/roadmap.json`).
