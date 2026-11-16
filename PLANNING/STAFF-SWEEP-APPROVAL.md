# Staff sweep follow-ups R24 to R29: approve in one reply

Source: `.site-context/spec/STAFF-SWEEP.md` (2026-11-11 sweep of the staff pages, mock data, desktop 1440 and phone 390). All six are **proposed, not approved**, and none is built. Reply with the ids you approve (for example "approve R24 R25 R26 R27, R28 with exception, R29 later").

| Id | What changes | Kind | Phone | Needs from you | Check it passes |
|---|---|---|---|---|---|
| R24 | Staff home: 4 columns from 1100 px, equal-height tiles, no empty cell in the last row | layout only | unchanged | yes / no | `tests/layout-pass.test.mjs` row-level check, screenshots at 1440 |
| R25 | Boardroom: link directory as equal-width auto-fill tiles (no orphan tile); Switches accordion in 2 columns from 1100 with counts beside the title | layout only | unchanged | yes / no | same, plus ids untouched |
| R26 | Dugout: three columns (roster, pitch, ready-check) with equal heights, pitch centred | layout only | unchanged | yes / no | same, pitch aspect kept |
| R27 | Insights: Health and Month-by-month stacked left, To do right, equal width | layout only | unchanged | yes / no | same |
| R28 | Tools (Submissions, Awards) and Content (Ideas tab): native selects, search box and table restyled in the site's input style | **look change: needs a `styleChanges` exception** | possibly | yes / no, and confirm the exception | contrast kept, Phoenix tokens only |
| R29 | Re-run the sweep against live Worker data for the tabs the mock cannot show (Announce, Bot, Health, Audit, feature switches) | audit, no edits | n/a | owner runs or allows a signed-in run on live data | findings list only |

Also decide (from the same sweep): keep the dev toolbar and floating buttons on the published staff pages, and give the floating buttons clear space under them? (yes / no)

Order if all approved: R24, R25, R26, R27 (layout), then R28 (after the exception), then R29. R24 to R27 depend on R30 (rows start level) in the round-2 list; if R30 is not built yet it goes first.

Anything not approved stays in PF-009 as open. R18 and R19 wording was already approved and wired (`PLANNING/OPEN-WORDING.md`).
