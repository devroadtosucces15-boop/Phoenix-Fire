# EA event counters (decoded columns)

EA's `clubs/matches` response carries four per-player buckets, `match_event_aggregate_0..3`, each a string like `"215:21,216:5"` (event id : count).
Phoenix now keeps every non-zero counter of all four buckets, whether or not the id has a name yet, as `evraw` on each player row of every archived match
(both sides). Decoding is a layer on top and never replaces the raw record, so a column that is named later can be applied to old matches.

## Credit

The id-to-name table in `scripts/lib/events.mjs` is community observation, not EA documentation. Credit to the "EA FC Pro Clubs API research" project
(about 51,000 FC 27 player-match rows), published through the fc27-clubs-api docs: https://1erkandogan.github.io/fc27-clubs-api/match-events/.

## Where it lives

| File | Job |
|---|---|
| `scripts/lib/events.mjs` | `EVENT_STATS` id table, `rawEvents` (store), `decodeEvents` (named stats and derived totals), `unknownIds` (ids with no name yet) |
| `scripts/lib/intel.mjs` | `summarize`, `ratesOf`, `coverage`: totals, per-appearance averages and rates; null (never a fake 0%) without data |
| `scripts/lib/schema.mjs` | schema-drift probe and platform check, called from `scripts/fetch.mjs` |
| `scripts/fetch.mjs` | `slimMatch` stores `evraw`; `api()` reports endpoints that stop returning keys we rely on |
| `next/lib/data.mjs` | `ev` on every match line, `intel` on matches, players and club, `coverage` |
| `next/build.mjs` | writes `intel.json` (coverage, club, per player, per match) |
| `tests/eventdecode.test.mjs` | decoder, rates, drift probe, fetch wiring, data layer on a temp copy |

## Open validation (do before showing derived numbers as official)

On 130 FC 27 player rows from an earlier recon, the named EA fields and the decoded ids matched only partly: `passesmade` equals id 215 on 110/130 rows
(120/130 with id 153 added), `tackleattempts` equals ids 0 + 1 on 44/130, `saves` equals id 202 on 2/4 keepers. Ids 214 and 11 track goals and assists
(129/130 and 128/130) but are not in the table. About 60 ids seen in the recon (for example 121, 114, 151, 8, 178) have no name. Use `unknownIds()` over the
stored `evraw` rows to see what the Phoenix archive holds, and compare against EA's own named fields before adding a name to `EVENT_STATS`.

## Not backfillable

EA serves only the last 10 matches per match type, so matches fetched before `evraw` was kept (all 65 archived so far) have no event data. Coverage grows
from the first fetch after this change.

## Live validation (2026-11-14, `node scripts/validate-events.mjs`)

Retrieval is confirmed: CI (`.github/workflows/update.yml` -> `scripts/fetch.mjs`) stored `evraw` for both sides of the first two matches fetched after the
decoder merged (data/matches/192164113680439.json, 192232180110413.json; 30 player rows). The local sandbox cannot reach EA, so this is the CI data, not a
local pull. Agreement with EA's own named fields on those 30 rows:

| EA field | decoded from | agree | note |
|---|---|---|---|
| `shots` | 217 + 218 | 30/30 (8/8 non-zero) | trusted |
| `goals` | 214 | 30/30 (3/3 non-zero) | now named `goalsEvent` |
| `assists` | 11 | 30/30 (5/5 non-zero) | now named `assistsEvent` |
| `passesmade` | 215 | 29/30 (27/28 non-zero) | one row off by 1 |
| `passattempts` | 215 + 216 | 26/30 | EA counts one or two more than decoded; the gap is not an id we name |
| `tacklesmade` | 0 | 26/30 (11/15 non-zero) | EA higher by 1 on the rest |
| `tackleattempts` | 0 + 1 | 17/30 (9/22 non-zero) | **does not match**; best two-id fit on this sample (121 or 164 with 1) is only 18/30 |
| `saves` | 202 / 267 | 1 keeper row in the sample | inconclusive; 267 agrees, 202 does not |

Decisions: the board and review keep using EA's named `tacklesmade`/`tackleattempts`/`passesmade`/`passattempts` for anything shown as a headline number;
decoded counters are used only where EA gives no equivalent (pass direction and length, possession won and lost by third, positioning, shot position, aerial
duels, keeper save types). Tackle win rate from decoded ids 0 and 1 is NOT shown as a KPI until the mismatch is explained. Unnamed ids seen so far (34, with
counts): 121x21, 8x15, 114x15, 113x11, 150x7, 184x6, 151x4, 157x4, 178x4, 211x4, 162x3, 179x3, and a tail of single or double hits (5, 9, 12, 55, 137, 142,
186, 204, 39, 56, 57, 58, 93, 98, 116, 119, 138, 188, 190, 192, 195, 196). They stay raw in `evraw`. Re-run the check as matches accumulate; a name is added to
`EVENT_STATS` only after it agrees with an EA field on a larger sample.

Calculations proposed (true numbers only): pass accuracy and forward/long share (215/216, 30/31, 28/36), possession won minus lost by third (105-110), shot
accuracy and inside-box share (217/218, 13/14), positioning rate (111/219), interceptions (6), aerial duels (265/266), keeper save types (EA's own
ballDive/parry/punch/reflex/cross fields), team-versus-opposition comparison, and full-match / DNF flags so abandoned games do not skew averages.
