# Discord output redesign: sections

Goal (owner, 2026-11-12): every message the bots send, in a channel, as a command reply, automated, a reminder or a DM, carries the same
effort as the match result: a drawn picture, a header, facts, buttons. Phoenix branding on all of it (orange `#e8651a`, ink `#0a0705`,
Phoenix crest from `phoenix/overlay/`). Done in small sections, one session each, so no session reads the whole bot.

How a section runs (keep it cheap): Sonnet, medium effort, `node tools/bot-studio/studio.mjs deps <id>` for the outputs in the section only,
edit, `studio.mjs verify <id>`, `node tests/run.mjs <words>` for the touched areas, one full `node tests/run.mjs` before the push. Commit only your files, `git pull --rebase --autostash`, push.
At the end write a short result in this file (status column) and give the owner the prompt for the next section.

Building blocks that exist (do not rebuild):
- `bot/banners.js` families, `scripts/cards.mjs` `BANNERS` (banners and posters, drawn at build), `bot/ui.js` `withBanner` / `autoBanner`.
- Data pictures: `matchPicture`, `reviewCard`, score, field, box, player, compare, top-*, club, results, help-*, queueflow.
- A new picture = a function in `scripts/cards.mjs`, a name in `BANNERS`, a test in `tests/banners.test.mjs` style, bump `TEMPLATE_VERSION` and `BANNER_V` together.

| # | Section | Items | Status |
|---|---|---|---|
| 1 | Match report + family banners | merged match picture, review message, 49 banners on every send point | done (8519e4c, banners commit) |
| 2 | Help and Rush queue posters | 6 help posters, queue how-it-works poster | done |
| 3 | Match night | roster, check-in, lineup pitch, suggested lineup, first-answer order (branch `claude/practical-chandrasekhar-707b93`, pushed, not merged) | to merge and verify |
| 4 | Alerts | match alert (CAUTION message 3), uptime, event cancelled, 30-minute reminder, trial stage, caution DMs | open |
| 5 | Private replies | My insights, My game plan, form score, locker summary, `/me`, `/insight`, `/intel` | open |
| 6 | Automated posts | live, member live, hype, awards, hotw, birthday, welcome, patch notes, media guard, voice recap, burner report, plays, squad post, doc post | open |
| 7 | Slash replies still bare | `/lineup`, `/host`, `/matchday`, `/lfg`, `/trial`, `/feedback`, `/suggest`, `/share`, `/discoveries`, `/wheel`, `/tag`, `/remind`, `/setup`, `/announce` | open |
| 8 | DMs | one poster layout per notification type (27 DM outputs) | open |
| 9 | Buttons, menus, notices | component replies and errors: compact variant of the same look, final audit with `studio.mjs check --strict` | open |
