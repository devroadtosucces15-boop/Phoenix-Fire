# PF-023 go-live: Rush queue and LFG as one matchmaking system

Built and tested in the repo. These steps are the owner's (deploy, migrations, Discord portal) and were not done.

1. **Migrations.** Apply `bot/migrations/0064_rush_find_player.sql` and `0065_rush_lfg_positions.sql` to the D1 database (adds `rush_queue.need_open`, `rush_needs`, `rush_need_offers`, `rush_lfg.positions`).
2. **Register commands.** `/lfg now` has a new `position` option (Goalkeeper, Striker, Centre back, Winger, Any). Run the command registration (`bot/register.mjs`) so Discord shows it.
3. **Deploy the Worker** (`phoenix-bot`). Offer DMs come from the Rush app token; `RQ_ID`/`LFG_ID` now also match `pf:rq:offer:y|n:<id>` and `pf:lfg:acc|dec:<id>`.
4. **Flags.** `rushQueue` stays members; `rushLfg` stays owner until you decide to open it (the matcher only sees members who used `/lfg now`).
5. **Check in Discord** (Rush app in the server, DMs on): post a need, mark yourself available with a matching position, confirm both DMs arrive, press yes on both, and see the player join the crew.

## Not built yet (follow-ups, inbox)
- Board-id compare-and-set in D1, delete-then-post verification and orphan sweep (the auto-clean fix from the plan, first bullet of 5b) still use the KV board record.
- Extras: ready check after accept, swap/step-out reopening a need, coverage hints, no-show cooldown, role-ping option (marked "to be confirmed in design" in the plan).
- Registry entries for the offer DMs (`auto:rush-offer`) and bot-audit samples: `bot/rushmatch.js` is listed as a generic sender in `tests/controlcenter.test.mjs` until then.
