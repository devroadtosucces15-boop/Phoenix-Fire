# Match day and match stats: audit and integration plan (2026-11-18)

Read-only audit, no source changes. Waiting for the owner's link to a community setup that retrieves decoded EA match stats. It will be
compared with our own decode (PF-021, done 2026-11-15). Idea saved in the Brainstorm inbox (PR 30). Separate from the PF-024 bot items.
Counts below are from the archive on 2026-11-18 (data/matches: 134 files, 37 with event counters, 608 player rows with `evraw`).

## 1. How a match goes from EA to the site and Discord today

1. `scripts/fetch.mjs` (`api()`, `fetchClub()`, `slimMatch()`) pulls `clubs/matches` per match type for each org club and writes
   `data/matches/<matchId>.json`. `slimMatch` drops the four opaque `match_event_aggregate_0..3` strings and `vproattr`, and stores one
   `evraw` string per player ("id:count,id:count", every non-zero id, named or not) built by `rawEvents()` in `scripts/lib/events.mjs`.
   Club blocks keep goals, result, `winnerByDnf`, name and kit; players keep EA's per-player columns.
2. `scripts/lib/events.mjs`: `EVENT_STATS` is the confirmed id table (community research, credited in the file), `decodeEvents(raw)` returns
   named stats plus derived totals, `unknownIds(rows)` lists ids not yet named. `scripts/lib/validate.mjs` +
   `scripts/validate-events.mjs` cross-check decoded counters against EA's own columns.
3. `next/lib/data.mjs`: `toLine()` turns a stored player into a line (EA columns, `ev` = decoded counters or null, GK save types),
   `teamTotals()` sums our sides for the comparison bars, `isFull()` decides whether a match was played to the end. `summarize()` /
   `coverage()` (`scripts/lib/intel.mjs`) build the per-match, per-player and club "match intelligence".
4. `scripts/lib/boxscore.mjs` (PF-021): `BOX_COLS`, `boxEv`, `boxCell`, `per90`, `evCoverage`. Pure functions shared by the site and the card.
5. Site: `next/pages/matches.mjs` (`results()`, `match(m)`: pitch view, Box score tab with Total / Per 90 switch, `evCompare()` team comparison,
   coverage note; `opps()` / `oppPage()` for opponents). Built to the Phoenix theme by `phoenix/build.mjs`.
6. Discord: `scripts/build.mjs` adds `ev` to the `ps` rows (`boxEv(decodeEvents(p.evraw))`); `scripts/cards.mjs` `boxScoreCard()` renders
   the "Box score" picture (Int / Won / Lost / Aer columns, our side only); `scripts/post-results.mjs` and `bot/matchalert.js` post results;
   `scripts/lib/matchreview.mjs` writes the rule-based review message; `bot/matchcard.js` answers "My match".
7. `/matchday` (`bot/matchday.js`, `bot/merged.js`) is a different thing: scheduling, sign-up, check-in for a match night. It does not read EA
   stats; the link to stats is only the lineup/prediction handling that treats tournament and VPG events like league games.

## 2. What is decoded today, and what is not

Decoded (confirmed table, ~90 ids): passes by direction and length (completed and failed), first-time, switches, flair, through passes,
shots on/off target by box zone, saves, goals/assists events, second assists, dribbles, tackles (won, lost, standing, sliding, clean,
dangerous), interceptions, dispossessions, aerials won (attacking and defending), good-direction saves, possession won and lost by third,
fouls, cards, penalties, corners, in/out of position and severity, pass feedback messages.

Box score columns (PF-021, `BOX_COLS`): Fwd (id 30), Int (6), Won (108, 109, 110 summed), Lost (105, 106, 107 summed), Aer (265 + 266),
Pos% (111 vs 219, a share of in-position events, not a possession share). Per 90 uses 5400/secs, null under 600 s.

Not claimed or not known:
- **Possession percentage** is unpublished: EA does not send it, the site says so on the match page, and a test guards the wording.
- **Unknown ids** are visible, never dropped. 608 rows show about 80 unnamed ids, the largest by volume: 121 (486), 8 (431), 114 (365),
  151 (294), 157 (182), 113 (123), 184 (113), 178 (112), 9 (104), 150 (100). Several likely belong to shots, touches, headers or
  pressure but nothing confirms that; ids 2 and 112 feed derived totals only.
- Goalkeeper: we have GK save types from EA columns (dive, parry, punch, reflex, cross, good direction) and clean sheets, but no decoded
  GK-specific events (claims, distribution, sweeper actions).
- No shot map, xG, pass map, heat map, event timeline or positions: the feed has none of them (comment in `next/lib/data.mjs`).
- 97 of 134 archived matches have no counters (kept only from a later date), so those pages show no decoded columns.
- Opponent players: lines exist for both sides, but the Discord card shows our side only.

## 3. Known gaps and questions the community setup could answer

1. Does it decode ids we leave unnamed (list in section 2)? With what evidence (cross-checks against EA's own columns)?
2. Does its id table disagree with ours for any named id? Especially 214 and 11 (goals/assists events), 38 and 112 (dribbles beat),
   the three possession-won/lost thirds, and the 2 + 3 fouls sum.
3. Which source does it read: the same `clubs/matches` endpoint, the match-detail endpoint, or something else? Does that source add fields
   (possession, shots by player zone, xG, positions, event timeline)?
4. Units and scale: seconds vs minutes, is an 80-minute match 4800 s everywhere, how it treats AI players, quits (`winnerByDnf`) and extra time.
5. Goalkeeper stats: save type ids, goals conceded by zone, claims, distribution.
6. Per 90 convention: ours scales a played match of 4800 s to 5400. Does it use the same?
7. Can it fetch matches that fall out of EA's history window, so the 97 matches without counters could be filled in?
8. Rate limits, auth and licence: can we reuse its table or code (credit and licence), or only compare behaviour?

## 4. Checklist for the owner's link

Compare, in this order (note results in this file under a new "Findings" heading, no raw data, no secrets):
- [ ] Licence and source of the decode table; whether it is the same research project already credited in `scripts/lib/events.mjs`.
- [ ] Id table side by side with `EVENT_STATS`: agree / differ / new. Mark each new id as confirmed, partial or guess, and how it was checked.
- [ ] Field names and units (counts, seconds, percentages, per 90 definition, rounding).
- [ ] Goalkeeper stats: names, ids, what we lack.
- [ ] Derived stats it publishes (pass %, possession, xG, shots by zone) and the formulas.
- [ ] Shot maps or any positional data: only if the source carries coordinates; otherwise note "none".
- [ ] Coverage: which of our 134 matches it can decode, and whether it works for matches older than our counters.
- [ ] Run its decode on a few archived `evraw` rows and compare to `decodeEvents` (counts only, no paste of raw rows).

Tests to extend: `tests/boxscore.test.mjs` (new columns, GK columns, per 90 edge cases), `tests/eventdecode.test.mjs` and
`tests/events.test.mjs` (new ids, aliases), `tests/intel.test.mjs` (club summaries), `scripts/validate-events.mjs` (cross-checks for each
newly named id before it joins `EVENT_STATS`). Every new output also gets a Phoenix guard test (CLAUDE.md rule 5).

Where results would land:
- Match page and Box score tab: `next/pages/matches.mjs` (`table()`, `evCompare()`), data from `next/lib/data.mjs` `toLine()`.
- Match center / results list: `results()` in `next/pages/matches.mjs`, `intel` in `next/lib/data.mjs`.
- Discord card: `boxScoreCard()` in `scripts/cards.mjs`, `ps` rows from `scripts/build.mjs`; review text in `scripts/lib/matchreview.mjs`.
- Control Center data tab: the Boardroom health/data views (PF-022 shell) are the place for an "unknown ids" and coverage report;
  nothing wires `unknownIds` there yet, so that is new work.
- Stored data: any new fetched field goes in `slimMatch()` (`scripts/fetch.mjs`) and the `data/matches` shape; keep `evraw` as the raw record.

## 5. Matchday issues noticed in passing (not fixed)

- `/matchday` is dark until the Phoenix Matchday app is configured (`bot/apps.js` HELD): nothing answers before then.
- `bot/help.js` and `bot/matchcard.js` still use `norex:` custom-id prefixes (identifier class from audit A2; not visible text).
- 72% of archived matches carry no counters, so match pages for those show no decoded columns; this is by design but not explained on the page.
- The box score card is our side only while the site shows both; opponent columns would need card space.
- Pos% reads like possession; the tooltip says "In position", but a reader could confuse it. Consider a clearer header on the next design pass.
- No page lists unnamed event ids for the owner; only `scripts/validate-events.mjs` does.

## 6. Findings: comparison with the reference setup (read 2026-11-18)

Source: fc-clubs-api docs (https://1erkandogan.github.io/fc27-clubs-api/), an MIT-licensed unofficial Python client (repo
1erkandogan/fc27-clubs-api, 38 commits). Pages read: home, Endpoints, Match events, and the repo front page. Not read: the research
repo it credits (Interactive-63/eafc-pro-clubs-api-research), its fixtures, or its "exploratory findings" section (cut from the excerpt).
Nothing was run and no dependency is added. It is Python and we are Node, so only its documented facts are usable, not its code.

**Headline: it is the same decode we already have.** Its confirmed table comes from the research project our `scripts/lib/events.mjs`
already credits (~51,000 player-match rows). Every stat in its confirmed table that I checked is in our `EVENT_STATS` with the same id.
So the link does not add a better decode. It adds documentation, caveats and a list of partly known ids.

Endpoints: the same eight we use or could use (`clubs/matches`, `clubs/info`, `clubs/overallStats`, `members/stats`,
`members/career/stats`, both leaderboard searches, `club/playoffAchievements`). We fetch the first four plus members. Facts we lack in docs:
- `clubs/matches` is capped at 10 per call, no paging, so our archive is the only long history (hourly fetch matters).
- Each match also carries `aggregate` (EA's per-club sum of the player fields) and `timeAgo`. `slimMatch()` drops both.
- `result` codes: 1 win, 2 loss, 4 draw, 16385 win by opponent quit, 10 loss by quit. Friendlies send 0 for wins, ties, losses and result,
  so only goals decide. We already use goals, and `matchType` is "1" league, "5" friendly.
- Everything is a string. `secondsPlayed` is seconds. `passesmade` includes offside passes (215 + 153).

Differences and contradictions:
- **Possession:** it documents no possession percentage either, which agrees with ours. Nothing contradicts the unpublished note.
- **Names:** its `goals` is our `goalsEvent` (214) and its `assists` is our `assistsEvent` (11). Same ids, different names. No change needed.
- **Totals caveat:** it says EA's named fields are authoritative for totals and events are a breakdown (4 of 59 rows had events far below
  named fields). Our own check (`node scripts/validate-events.mjs`, 608 rows) agrees: pass attempts match on 472 of 608 rows, tackle
  attempts on 315, passes completed on 494. We must not present decoded sums as totals where EA's named field exists.
- **Saves:** it lists `shotsSaved` = id 202 and `goodDirectionSaves` = 267. In our data id 202 matches EA's `saves` on 0 of 37 goalkeeper
  rows and 267 on 6 of 37, so neither is a reliable save count. Keep EA's `saves` and the five save-type columns as the keeper source.
- **Goalkeepers:** no decoded keeper-specific events beyond 267. Same save-type fields we store.
- **Per 90 and units:** it documents no per-90 convention. Ours (5400/secs, null under 600 s) stays our own, labelled as such.
- **Positioning:** its "in position" id 111 is feedback praise, not a measured share, so our Pos% is a ratio of feedback events. Rename the
  tooltip, not the maths.

Partly known ids it lists (not decoded there either). They match our biggest unnamed ids:
121 (tackle success indicator, matches 229 98.5%; ours has 486 hits), 151 (bad passes; 294), 157 (crosses attempted; 182),
150 (tiki-taka pass; 100), 179 ("Should have shot"; 77), 49 and 50 (save sub-types; 37 and 5), 12, 124, 137, 140, 93, 238, 123
(goal techniques), 96 and 104 (red card trigger, offside). Still unnamed anywhere I read: 8, 114, 113, 184, 178, 9, 142, 119.

### Prioritised integration (audit only, nothing built)
1. **Totals vs events rule** (small, high value): decoded sums are a breakdown, EA's named field is the total. Add a test in
   `tests/boxscore.test.mjs` that no box column or comparison bar presents an event sum as a named total, and a note in the coverage text.
2. **Store `aggregate` per club** in `slimMatch()` (`scripts/fetch.mjs`): EA's own club sums could replace `teamTotals()` sums and expose the
   AI-player gap. Check one fetched match first (shape unverified in our data). Extend `tests/eventdecode.test.mjs` and a fixture.
3. **Candidate tier for partial ids** in `scripts/lib/events.mjs`: label 121, 151, 157 and the others "candidate", never shown on pages until
   `scripts/lib/validate.mjs` agrees with EA's columns. Extend `tests/events.test.mjs` and `tests/intel.test.mjs`.
4. **Fix the save source** for keepers (keep EA `saves` and types; drop reliance on ids 202 and 267 in any new output); test in `tests/boxscore.test.mjs`.
5. **Control Center data tab**: show coverage (37 of 134 matches), unnamed ids by volume and the validator result (PF-022 shell; new view).
6. Later, own work: opponent columns on the Discord card, a clearer Pos% header, per-90 wording. Each new output gets a Phoenix guard test.

## 7. Status (2026-11-18, owner approved building)

Done and tested (`tests/matchstats-ref.test.mjs`, 20 checks): offside-aware pass check in `scripts/lib/validate.mjs`; candidate id labels
(`CANDIDATE_IDS`, labels only, never decoded); totals-vs-breakdown and keeper-saves guards; `scripts/lib/ea-assets.mjs` (crest fallback chain,
division badge, reputation icon, kit colour hex); `aggregate` stored per club (`scripts/lib/matchslim.mjs`, used by `slimMatch`);
`currentSeasonLeaderboard/search` fetched next to the all-time one into `data/clubs/<id>.json` `seasonBoard` and read as `clubStats.season`;
`matches[].agg`, `oppCrests`, `oppKit` in `next/lib/data.mjs` (no page reads them yet). Outputs are unchanged except one: the result post and
its review are now ONE Discord message (flag `matchReviewSplit: true` restores two); `tests/matchreview.test.mjs` and
`tests/resultpost-brand.test.mjs` updated. Before/after mockups of every stats output are in the owner's private Artifact
(https://claude.ai/artifact/KvbFVYG6FxzgWK1Qj3hkdZ); wiring the new stats into the real outputs waits for the owner's go.
Not verified live: the shape of `aggregate` and the season row (EA blocks this sandbox); the first real fetch will show them.
