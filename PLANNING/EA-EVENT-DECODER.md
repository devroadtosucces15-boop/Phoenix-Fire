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
