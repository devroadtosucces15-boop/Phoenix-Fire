# Reference (fc-clubs-api) vs Phoenix: side-by-side inventory (2026-11-18)

Reference = https://1erkandogan.github.io/fc27-clubs-api/ (pages: home, endpoints, match events, API reference, output formats, images).
Ours = this repo on main. Counts are from the docs excerpts and from `scripts/lib/events.mjs`, `data/matches`, `data/clubs` (node count, 2026-11-18).
Caveat: the reference's feedback rows were cut off in the page excerpt after "best option taken", so 2 feedback ids (182, 183) could not be
confirmed on its side. Nothing was run from the reference; it is Python and not a dependency.

## A. How much each provides (the numbers)

| Measure | Reference | Phoenix | Same? |
|---|---|---|---|
| Confirmed event stats decoded (named, from ids) | 75 visible (+2 not visible in excerpt) | 77 (`EVENT_STATS`) | Same 75; our 2 extra are feedback ids 182, 183 |
| Derived event totals (shots, dribblesBeat, foulsConceded, yellowCards, 4 "unknown" remainders) | 8 | 8 | Same |
| Total decoded event columns per player-match | ~83 to 85 ("80+") | 85 | Same |
| Partly known ids (not decoded) | 16 ids listed (151, 121, 157, 150, 179, 49, 50, 12, 124, 137, 140, 93, 238, 123, 96, 104) | 0 named; all kept raw in `evraw`, 81 ids reported unnamed | Theirs adds hints, we add nothing yet |
| EA per-player named fields per match | 39 documented | 36 stored (33 EA fields + `evraw` + `dribbles` + `secondassists`) | We drop `vproattr`, `vprohackreason`; the 4 event buckets are folded into `evraw` |
| EA per-club fields per match | 14 + `aggregate` + `timeAgo` | 15 (same 13 + `name`, `kit`) | We lack `aggregate`, `timeAgo` |
| Member (season) fields | ~34 (incl. `prevGoals` 0 to 10) | 34 | Same |
| Member career fields | 9 | 9 | Same |
| EA endpoints | 8 documented | 7 used (6 shared + the `allTimeLeaderboard` list they do not document) | We lack `currentSeasonLeaderboard/search`, `club/playoffAchievements` (returns []) |
| Per-90 values | 0 | 5 box columns (Fwd, Int, Won, Lost, Aer) | Ours only |
| Match-level team totals | none (EA `aggregate` raw) | 13 (`teamTotals`) + 5 extra comparison bars | Ours only |
| Match intelligence (club, player, match summaries, rates) | none | `scripts/lib/intel.mjs` | Ours only |
| Possession % | none | none (stated on the match page) | Same |

Bottom line: the same raw material (about 120 numbers per player per match: ~35 EA fields plus ~85 decoded counters). The reference has no
decode we lack, only two extra pieces of EA data (`aggregate`, `timeAgo`) and its caveats; we have the per-90, team and intel layers it lacks.

## B. Event stats, side by side (id: name; I = in both, O = only ours, R = only reference)

| Group | Stats (id) | Reference | Phoenix |
|---|---|---|---|
| Passing, completed/failed | passesCompleted 215, passesFailed 216 | Yes | Yes |
| Passing by direction | completed forward 30, backward 32, sideways 34; failed forward 31, backward 33, sideways 35; two "direction unknown" remainders | Yes | Yes |
| Passing by length | completed short 24, medium 26, long 28, cross 36; failed 25, 27, 29, 37; two "length unknown" remainders | Yes | Yes |
| Passing styles | first-time 143, switches 144, flair 147, through 152, offside passes 153 | Yes | Yes |
| Shooting | on target 217, off target 218, on/off by inside/outside box 13, 18, 14, 19, saved 202, shots (sum) | Yes | Yes |
| Goals and assists | goals 214, assists 11, second assists 115, through-ball assists 118, first-time 128, weak foot 131, off post 136 | Yes (names `goals`, `assists`) | Yes (names `goalsEvent`, `assistsEvent`) |
| Dribbling | completed 174, carried 97, skill-move beat 38, beat (112 minus 38) | Yes | Yes |
| Tackling | won 0, lost 1, standing 229, sliding 230, clean 164, dangerous 163 | Yes | Yes |
| Other defending | interceptions 6, dispossessed 158, crosses blocked 156 | Yes | Yes |
| Aerials, keeper | aerial won attacking 265, defending 266, good-direction saves 267 | Yes | Yes |
| Possession | lost per third 105 to 107, won per third 108 to 110 | Yes | Yes |
| Discipline and set pieces | fouls 2 and 3, fouls won 4, yellows 95, 213, penalties conceded 94, corners conceded 10, corners taken 145 | Yes | Yes |
| Positioning | in position 111, out of position 219, severity 99 to 103 | Yes | Yes |
| Feedback | use the ball 212, pick your pass 207, no good option 175, good option 176, best option 177 | Yes | Yes |
| Feedback (more) | should have passed elsewhere 182, chose to pass 183 | Not visible in excerpt | O (unconfirmed by reference) |
| Partly known ids | 151 bad passes, 121 tackle success, 157 crosses attempted, 150, 179, 49/50 save sub-types, goal techniques (12, 124, 137, 140, 93, 238, 123), 96, 104 | R (labels only) | O: we hold the raw counts (121: 486 hits, 151: 294, 157: 182) |
| Unnamed by both | 8, 114, 113, 184, 178, 9, 142, 119 and about 60 more | not named | not named |

## C. Functions and features, side by side

| Function | Reference | Phoenix |
|---|---|---|
| Club search by name (all-time, current season) | Yes (2 endpoints, `find_club_id`) | Partial: all-time only, in fetch and the club lookup |
| Club info, overall stats | Yes | Yes |
| Member season and career stats | Yes | Yes |
| Match list (league, friendly, playoff) | Yes, 10 max, no paging | Yes, hourly archive, 134 matches kept |
| Per-player match rows, both teams | Yes (`both_teams`) | Yes (our lines and `olines`) |
| Decoded events on demand | Yes (`include_events`) | Yes (`evraw` + `decodeEvents` at build) |
| Win/draw/loss and quit (`dnf`) per match | Yes, from goals, friendlies too | Yes, from goals and `winnerByDnf` |
| Crest URL with fallback rule (`TEAM`, teamId, crestAssetId) | Yes | Not verified: we read crestAssetId (fetch.mjs, data.mjs); no fallback chain seen |
| Division badge and reputation icon URLs | Yes | Not verified: division number is stored; no icon helper seen |
| Kit colour decimal to hex | Yes | Not seen in match code |
| Timezone-aware timestamps | Yes | Site formats dates itself |
| Output formats raw / records / dataframe, CLI, typed errors | Yes (Python) | Not applicable (Node, files) |
| Playoff achievements | Yes (empty so far) | No |
| Box score tab, per-90 switch, team comparison, coverage note | No | Yes |
| Discord box score card, review message, "My match" | No | Yes |
| Club-wide intel and player trends | No | Yes |
| Validator against EA named fields (`validate-events`) | No (documents 4 of 59 rows mismatched) | Yes (608 rows checked) |

## D. What the table says to do

Take from the reference (docs only): the offside-pass note for `passesmade`, `aggregate` and `timeAgo`, the crest fallback rule, the division
and reputation icon URLs, the partial-id hints as "candidates", and the rule that EA's named fields are the totals. Take nothing that is code.
The prioritised plan is section 6 of `PLANNING/MATCHSTATS-REVIEW.md`. No source was changed.
