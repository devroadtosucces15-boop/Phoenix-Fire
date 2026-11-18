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
