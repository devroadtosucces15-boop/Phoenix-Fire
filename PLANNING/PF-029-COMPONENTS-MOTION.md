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

## Roadmap order (lightest first), registered 2026-11-20

Light, mostly invisible (S): PF-029 tap areas, PF-030 labels and announcements, PF-031 header fit, PF-032 effects clean-up (fix only), PF-033 chips and tabs keyboard, PF-034 menus keyboard.
Medium (M): PF-035 shared tooltip, PF-036 loading and empty states, PF-037 forms, PF-038 tables and charts, PF-039 notices, PF-040 dialogs, PF-041 chips and tabs new look, PF-042 search, PF-043 dock.
Heavy (L): PF-044 owner-only effects control (budget and per-effect level), PF-045 the accepted motion pass. Last: PF-046 re-audit.
PF-029 is `NEXT`. The separate PF-029/PF-030 rows registered earlier were replaced by these 18 rows.

## PF-046 re-audit (2026-11-20): before and after

Tool: `node tools/effects/reaudit.mjs site 5 14` (headless Chromium, phone width 390 x 844, built site opened from `file://`, 4 s per page, not signed in;
the budget is set through the `phoenix.fxcfg` cache; `PAGES=stats,index` limits the pages). Before = the Phase 0 numbers above. The probe counts visible
`a[href]`, buttons, role button/tab/menuitem, inputs, selects, summaries.

| Measure | Before (Phase 0) | After, budget 5 | After, budget 14 |
|---|---|---|---|
| Effects granted (`PhoenixFx.running()`) | n/a (4 separate readers) | 5 | 14 |
| Tap targets under 44 px: Club (`index`) | 54 | 39 | 39 |
| Tap targets under 44 px: Stats | 201 | 115 | 115 |
| Tap targets under 44 px: Tactics | 37 | 34 | 34 |
| Unnamed buttons and links (15 pages) | 21 buttons relied on a tooltip only | 0 | 0 |
| Form fields / without a label (15 pages) | 36 / 2 | 16 / 0 | 16 / 0 |
| Native selects in markup (15 pages) | 8 | 92 in markup, 0 visible on Club and Stats, 1 on Tactics | same |
| Running animations: Club / Stats / Tactics | 19 / 11 / 10 (counted as endless) | 18 / 11 / 10 | 18 / 11 / 10 |
| Endless animations: Club / Stats / Tactics | see above | 0 / 0 / 0 (Hub has 4) | same |
| Blocks at opacity 0 on Stats | 106 | 108 | 108 |
| Frame rate (15 pages, 2 s of requestAnimationFrame) | not measured | 60 to 61 fps on every page | 60 to 61 fps |

How to read it:
- Labels: fixed (Join and Apply fields are labelled, no control is without a name). The field count dropped because the probe only counts visible fields on a signed-out page.
- Tap targets: improved by about a half on Stats and a quarter on Club but not done. Leftovers on Stats: result pills (`a.W` 43, `a.L` 11, `a.D` 10), game rows (`a.gdb`, `a.srow` 10 each); on Club: `a.fo` 10, `button.rchip` 9, `a.fd` 5; on Tactics: `button.chip` 13, `button.pc` 11. These are the next roadmap rows.
- Budget 14 changes nothing in this probe: the extra effects (dock arrow, phone tilt, haptics, Insights, spring, ripple, spotlight, ping, pop-in) only act on hover, press, tilt or an open menu, so a still page runs the same animations. Cost shows up in use, not at rest. The budget is still an owner decision (default 5 runs reveals, glow, tilt, parallax, bursts).
- Opacity 0: 108 blocks wait for the scroll reveal (below the fold at load, 2 more than before because the page has grown); they are not stuck, but a "every block reveals" check is a roadmap row.
- Native selects: the 92 are in markup (control center and filter sheets, hidden at rest). The "8" of Phase 0 counted the ones that show.
- Frame rate: no page drops below 60 fps in headless Chromium; a real phone is the owner's check.

## PF-047 tap areas (2026-11-20)

`node tools/effects/reaudit.mjs site 5` now counts a control as small only when its real hit area (box plus invisible `::after`, found with `elementFromPoint` around the centre) is under 44 px. A neighbouring control that owns the shared edge counts as fine (no overlap), a fixed bar is ignored, and a link whose match also has a 44 px row on the page counts as an equivalent control (WCAG 2.5.8). It also reports `box` (plain rectangle count, the old measure) and `covered` (controls whose centre is not tappable), and waits up to 8 s for entrance animations before measuring.

| Measure (budget 5 and 14, same) | PF-046 | PF-047 |
|---|---|---|
| Hit area under 44 px: Club / Stats / Tactics | 39 / 115 / 34 (box) | 0 / 17 / 2 |
| Box under 44 px (look unchanged) | 39 / 115 / 34 | 39 / 115 / 34 |

Changes (`next/static/tap.css`, `widgets.css`): grown area raised with `z-index: 1`; `:not(.cs)` exclusion removed (clean-sheet dot now `::before`); mosaic tiles `inset: -2px` so a tile never takes a neighbour's tap. Screenshots at 390 px before and after are identical outside two animated spots (logo glow, live ring), same as run-to-run noise.

Left, owner choice: 17 mosaic tiles on Stats (17 px, 5 px gap) whose match has no larger row on the page: a 7 px gap or 24 px tiles would pass WCAG 2.5.8 but changes the look. 2 pitch markers on Tactics (`button.pc-marker`, their `::after` is the card shine; card glare stays).

## PF-048 reveals (2026-11-20)

`node tools/effects/reveals.mjs site` (headless Chromium, 390 px, 15 pages) checks three modes: scroll (instant steps top to bottom, then wait), `?still` and print media (both at load, nobody scrolls). It fails when a `.reveal`, staged `.rv-c` or dealt `.rv-g` item is still at opacity 0 (own opacity times ancestors). Result: scroll 0 / still 0 on every page; print had 45 (Club), 108 (Stats), 20 (Tactics), 21 (About) hidden blocks. So the "108 at opacity 0 at load" are waiting for their scroll and do show; the true gap was print. Fix: one `@media print` rule at the end of `motion.css` forces them visible; the screen look is unchanged. Guard: `tests/reveals.test.mjs` (static rules for off, safe mode, still, print, no-JS plus the live probe on Club, Stats, Tactics). Note: the probe scrolls with `behavior: 'instant'`; smooth scrolling in a test skips blocks that then show when scrolled back to.
