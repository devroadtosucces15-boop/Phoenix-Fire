Item: CR-07 and CR-08 follow-up (Matchday overhaul), then CR-01 for the rest of the re-homes (CR-01 itself is only half done here: only the six Matchday commands moved).

## Done in the Matchday overhaul session
- `bot/matchflow.js`: the timeline (lineup window opens at start - 60 min, check-in opens when the lineup is posted and closes at start - 30 min, reminder 10 min before the close).
- `/host` post: match-day layout (eyebrow, facts, In / Maybe / Out, Still needed, timeline line); `/host` reply states the plan.
- Lineup posts only from -60 min (draft before); check-in only for lineup players (site route + Discord button); reminder cron `checkinNudges`; channel purposes `lineup_posts` and `checkin_reminders` (Organization config, `/setup channel`).
- `/lineup` = next event with a posted lineup, else next event; shows check-in state and (managers) who has not confirmed.
- `/matchday`: create, schedule, who, checkin, lineup (aliases status, next, availability, nextevent).
- Re-homed: /absence /highlight /birthday to Tools; /emoji /gif /arcade to Fun. Tests: `tests/matchflow.test.mjs`.

## Open for the owner
1. mickeyballbot look: matched from its source in `mickey-ball-bot/core/matchday.js`, not from screenshots. Ask for screenshots only if the post should differ.
2. Does "start the same" mean /matchday + /matchdayhelp + /matchday subcommands? Is /host to stay separate (it did)?
3. Owner steps: register commands (`node bot/register.mjs`), deploy the worker, set `lineup_posts` and `checkin_reminders` channels (site Organization page or `/setup channel`), verify the Fun app token is live (name `DISCORD_BOT_TOKEN_FUN` is in `bot/SECRETS-REGISTRY.md`).

## Next
- CR-01 remaining moves (mascot, jail, wheel, Quote card, remind, counselor, Pin to bottom, unpin), /funhelp, then CR-13 audit of /highlight /emoji /gif /arcade.
- Pre-existing red tests seen (not from this work): a11y-labels, engagement-points, events calendar (month boundary), layout-*, lfg, next*, reveals, rushscan.
