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
| 3 | Match night | roster, check-in, lineup pitch, suggested lineup, first-answer order | done (merged to main, verified) |
| 4 | Alerts | match alert (CAUTION message 3), uptime, event cancelled, 30-minute reminder, trial stage, caution DMs | done (alert pictures in scripts/cards.mjs, bot/matchalert.js). The match-alert trigger is wired (2026-11-12): a defeat by 3 or more goals, from the result import, channel and roles from the Organization config; tests/matchalert-trigger.test.mjs |
| 5 | Private replies | My insights, My game plan, form score, locker summary, `/me`, `/insight`, `/intel` | done (private pictures: `privatePicture` in scripts/cards.mjs, version 10; the first four are site Locker Room pages, not bot outputs) |
| 6 | Automated posts | live, member live, hype, awards, hotw, birthday, welcome, patch notes, media guard, voice recap, burner report, plays, squad post, doc post | done (post pictures: `postPicture` in scripts/cards.mjs, `picture()` in bot/ui.js, version 11; media guard is the `storage` DM) |
| 7 | Slash replies still bare | `/lineup`, `/host`, `/matchday`, `/lfg`, `/trial`, `/feedback`, `/suggest`, `/share`, `/discoveries`, `/wheel`, `/tag`, `/remind`, `/setup`, `/announce` | done |
| 8 | DMs | one poster layout per notification type (27 DM outputs) | done (`DMS` table + `dmPicture` in scripts/cards.mjs, banners `dm-<type>`, `BANNER_BY_DM` in bot/banners.js, version 13; tests/dm-posters.test.mjs) |
| 9 | Buttons, menus, notices | component replies and errors: compact variant of the same look, final audit with `studio.mjs check --strict` | done (`NOTICES` table + compact `noticePicture` in scripts/cards.mjs, 9 kinds as banners `notice-<kind>`, `noticeKindFor` in bot/banners.js, `withNotice` in the worker reply helper in bot/ui.js, `channelNotice` reads the missing channel from config, version 14; tests/notice-posters.test.mjs; `check --strict` now 307 outputs, 0 to fix, 0 warnings: eyebrow and footer on the picture replies, `/burner remove` header, the webhook result post is the Phoenix panel and the classic embed uses palette colours; tests/webhook-panel.test.mjs) |
| 10 | Match result post (fix) | result picture and review message: Phoenix orange accent, Phoenix crest only (attached `crest.png`, never the opponent's), name from `config.siteTitle`, no circles (stat meters, bar, rounded lineup tiles), `/queue settings` confirmation is a success notice | done (`scripts/lib/resultpost.mjs`, `scripts/cards.mjs` version 15, `BANNER_V` 15; tests/resultpost-brand.test.mjs; private "My match" reply still uses the opponent crest, owner to decide) |
