Model: sonnet (claude-sonnet-5-5)   Item: PF-030 Labels and announcements (the NEXT row of LIBRARY/roadmap.json).

Repo: /home/mrsuccess/Phoenix-Fire, branch cut from origin/main. Read CLAUDE.md, PLANNING/SESSION-HANDOFF.md sections 1, 3, 4, 5, 6, LIBRARY/README.md, LIBRARY/CLAIMS.md, the PF-030 row of
LIBRARY/roadmap.json and `PLANNING/PF-029-COMPONENTS-MOTION.md` (owner decisions, Phase 0 audit, rules). Add your CLAIMS row before editing.

## State right now
- Done: PF-029 (PR 46): `next/static/tap.css` (invisible 44 px hit area), `next/static/tap.js` (600 ms double-press guard), `tests/tap-targets.test.mjs`. Left from it: W/D/L form pips (17 px links) and 3D pitch markers.
- PF-030 scope (from the audit): 2 unlabelled fields (Join, Apply), the 21 icon buttons that only have a `title`, 4 uncaptioned tables (caption + header scope), `aria-current` on the docked page, banners announced (role=status / alert). Icons and emoji stay; the look does not change.
- Components and motion roadmap order: PF-029..PF-046 in `LIBRARY/ROADMAP.md`; one item per session; lighter fixes first. PF-024 Item 20 stays BLOCKED until the owner sends the link.

## Do next
1. One item, PF-030. Add a test that fails when an icon button has no accessible name, a field has no label, a table has no caption, or the dock does not mark the current page.
2. Check before and after at 390 px (text first, screenshot only for anything visible), `node tools/library/sync.mjs`, `node tests/library.test.mjs`, `node phoenix/build.mjs --out site`, brand and leak tests, commit, push with gh, merge to main.
3. Set PF-030 DONE with a doneLog entry, make PF-031 NEXT, write the next prompt, remove your CLAIMS row.
