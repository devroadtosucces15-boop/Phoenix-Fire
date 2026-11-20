# PF-029 and PF-030: components, motion and effects (owner decisions 2026-11-20)

Detail page for two roadmap rows that are **not registered yet**. `LIBRARY/ROADMAP.md` is claimed by another live session
(`LIBRARY/CLAIMS.md`, opencode pf-009-r29), so the rows are added to `LIBRARY/roadmap.json` after that claim clears.
Source: the owner's answers in the master plan artifact (every option had a live demo). Nothing is built yet.

## Rules that apply to every item

- Every component keeps its **icons and emoji** (win ✅, draw 🤝, loss ❌ chips, tab icons, button icons) and its Phoenix palette.
- The **player card keeps its glare, shine and shape**. No added outline. Share images stay chest-up.
- **Pointer shadow is removed.** Motion and effects stay **owner-only**: one switch for everyone, no per-user options.
- A look change is only applied where the owner ticked it (below). Anything refused keeps today's look.
- Alignment rules from the owner's notes (apply to every new component):
  1. Highlights never overlap another row or group. A wrapped chip highlights only itself.
  2. Tables: every column except the first is centred in its own column. First column (names) stays left-aligned.
  3. Numbers and their unit sit on one line (the % beside its number). Labels and values line up.

## Decisions (A fix only, B fix + extra, C new proposal, D keep)

| Item | Choice | Look changes accepted | Look changes refused | Owner notes |
|---|---|---|---|---|
| Buttons (components and motion) | B | none | solid ember colour, 10 px corners and 44 px height, glow removal | Keep the gold look. Tap area grows invisibly to 44 px; busy and done state; double taps ignored. |
| Dock, tab bar, navigation | B | none | none shown | Five items (Club, Matches, Hub in the centre, Stats, Tactics). Keep the dock as it is and enhance its live effects. Phone: dock auto-hides on scroll down; a small bottom-centre icon with an upward pointer bobs up now and then to bring it back. |
| Hub entrance | B | none | rise-in replacing blur-zoom | Keep today's look; keep the three safety rules and add a Skip. |
| Search and command search | C | group headings and key hints, 12 px panel with no glow | none | |
| Text fields and forms | C | 44 px field with leading icon | orange focus ring (not ticked) | |
| Selects and filter chips | C | segmented bar with sliding highlight, dark amber selected state | none | Highlight must never cover other options when chips wrap. |
| Tabs and segmented controls | C | same as chips | none | Same alignment rule as chips. |
| Dialogs and slide-up panels | C | bottom sheet on phones, grab handle | none | |
| Menus and dropdowns | C | shortcut hints, soft pop-in | none | |
| Notices (toasts) | C | stacked up to 3, 12 px corners, progress line, errors stay | none | |
| Tables and long lists | C | 10 px row spacing, Compare button per row | none | Centre all columns but the first. |
| Player cards | C | spring settle, deeper photo layer | none | Glare and shine untouched. |
| Charts and numbers | C | rolling digits, smooth ring | none | Number and % on one line; goals label and value aligned. |
| Loading and empty states | C | shimmer placeholders, larger empty icon with a button | none | |
| Effect budget | C | owner controls: a level for each effect (Full / Balanced / Off) and the budget itself, any number from 5 up to every effect | none | Default is 5 at a time (Full). The owner sets the budget number (minimum 5, no upper limit) and the level of each effect separately. Owner-only, one setting for everyone. |
| Header, logo, banners | C | logo shortens to PHOENIX on small phones, badge 9+ | none | |
| Tooltips | C | amber border, keyboard hint | none | Not audited yet; audit in Phase 0. |
| Motion: player card, scrolling, selection reactions, menu, page transitions, dialogs, loading, charts, celebrations, glow, tabs, island menus, side rail and owner button, header, widgets, status accents | C | as listed in the master plan for each | none | Glow: spotlight inside the hovered panel only (no pointer shadow). |

Layout and design proposals are **parked**: the owner rejected the layout "after" designs (icons and the card glare were removed in them).
Do not apply any of them. Revisit when the owner asks. The first-round answers for the desktop rail and the phone dock are superseded by
the dock row above.

## Where the details live

- Master plan artifact (private): https://claude.ai/artifact/Vhbk9Moy6gBGgKr23fD7tQ (database collections `choices`, `submission`, `ideas`).
- Evidence: 15 pages probed (36 form fields, 2 without labels; 4 tables with no caption; 8 native selects), tap-target counts (54, 201 and 37 under
  44 px on Club, Stats, Tactics at phone width), endless animations (19, 11, 10), 106 blocks at opacity 0 on Stats.
- Earlier proposal: PF-029 phases 0 to 10 (foundations, owner-only Effects control, fixes, notices, dialogs, search, numbers, buttons and tabs,
  phone navigation, motion pass, re-audit) in the first proposal artifact; re-order them to match the table above.

## Next step

When `LIBRARY/CLAIMS.md` no longer lists `LIBRARY/ROADMAP.md`: add PF-029 (components) and PF-030 (motion and effects) to `roadmap.json`,
run `node tools/library/sync.mjs` and `node tests/library.test.mjs`, then take Phase 0 (shared tokens, one effects switch, tooltip audit).

## Phase 0 audit findings (2026-11-20)

Tooltips (the unchecked item):
- 132 `title="..."` attributes across `next/pages`, `next/lib`, `next/static` and `web/`. These are browser-default tooltips: slow, mouse only, unstyled.
- 31 buttons carry a `title`; 21 of them have no `aria-label`, so their only name for a screen reader is the tooltip text.
- Tooltip code already exists in 10 `web/*.js` files (events, feed, profile, mystats, app, presence, squads, ratings, ui, messages) with no shared component. Phase 0 output: one shared tooltip (hover and keyboard focus, amber border and key hint per the owner's choice), then replace these copies one family at a time.

Effects state (feeds PF-030):
- Effect preferences are read in four places: `next/static/app.js`, `next/static/motion.js`, `next/static/safe.js` and `next/lib/ui.mjs`. PF-030 replaces them with one owner-set config (budget of 5 or more, level per effect) that all four read.

Components probe (15 pages, phone width): 36 form fields (2 unlabelled: Join, Apply), 4 tables (none captioned, 3 without header scope), 8 native selects, empty states on 5 pages.

Next: Phase 1 (buttons and tap areas, gold look kept) and the shared tooltip.
