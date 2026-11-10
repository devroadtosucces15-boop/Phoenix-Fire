# Phoenix bot output audit: paste-ready prompt

Model: **Opus** (it reads many modules and builds a capture pipeline). One lane. Work in `~/Phoenix-Fire` only.

---

## Prompt to paste into the new session (cwd `~/Phoenix-Fire`)

Fetch GitHub main first, then read `CLAUDE.md`, `README.md`, `bot/README.md` and `PLANNING/BOT-SPLIT.md`.

**Goal.** Build a local audit page that shows exactly how every message our Discord apps send looks today, so I can review
them without running each command by hand. This is an inventory of the CURRENT state, not a redesign. Do not align
anything to a target design and do not change any bot code. The page is the thing I use to decide what to fix next.

**Scope: everything a user can see from the bots.**
- Every slash command reply, across all apps (`core`, `stats`, `tools`, `fun`, plus `matchday` and `rush` where switched on).
  The map is `APP_COMMANDS` in `bot/commanddefs.js`. Include public, private (ephemeral) and error/refusal/validation notices.
- Every button, select menu and modal response (custom IDs are handled in `bot/worker.js`).
- Every automated post that needs no command: cron jobs in `bot/worker.js scheduled()`, result posts
  (`scripts/post-results.mjs`, `scripts/lib/resultpost.mjs`), burner reports (`bot/burnerstats.js`), live/stream alerts
  (`bot/live.js`, `bot/memberlive.js`), awards, event reminders, welcome/leave logs, uptime/health alerts, patch notes
  (`scripts/updates.mjs`), insights, watchlist, birthdays and any hype/recap posts.
- Every DM the bot sends: replies, notifications (`bot/notify.js`), reminders, queue/RSVP/trial/LFG messages, award DMs,
  export DMs, insight DMs.
- Any generated image the bot attaches (score, field, box score, player, compare, top-lists, club, results, card studio,
  avatar card) rendered to a real PNG.
- Old and new versions of the same thing: show the new one as the main entry, keep the old one (legacy embed, text fallback,
  no-card fallback) as a clearly marked fallback entry. If two entries have a different trigger but show the same data,
  keep both and tag them as related.

**For each message, show:**
1. How it renders, drawn like Discord (Components V2 panels, classic embeds, plain text, buttons, select menus, images,
   mentions, timestamps, custom emoji, "Only you can see this" for private replies, "Direct message" frame for DMs).
2. Trigger (the command, button or event) and when it fires (instant, cron schedule, GitHub Action, on RSVP and so on).
3. Where it goes: channel (by purpose, from the Organization config, never a hardcoded name), DM, private reply, webhook, site.
   List several when it can go to more than one place.
4. Gate: feature flag and level (public/members/managers/owner) from `config.json` and the settings module, plus who can run it.
5. Status: active now, staff only, owner testing, not configured (no channel set), or fallback only.
6. Duplicate or unique, and which entry it duplicates.
7. Source file, so I can jump to the code.
8. Notes where the formatting is inconsistent with the rest (different colour, title size, missing footer, missing crest,
   compact wall of text, classic embed where the rest use panels, wrong or missing icon).

**Phoenix identity must be right in what you render.** Use the Phoenix crest from `phoenix/overlay/crest*.png`, accent
`#e8651a` (not NOREX red `0xc8352c`), ink `#0a0705`, name PHOENIX FIRE, motto "Rise. Burn. Repeat.". If a captured message
still shows a NOREX name, colour, crest or link, flag it in the page as a branding leak (`CLAUDE.md` branding rule). This
audit doubles as a leak finder.

**How to build it (the method that worked for NOREX).**
1. Do not hand-write samples. Run the real code and capture what it would send: a preload that replaces `fetch`/Discord
   calls and records every message body (V2 components, embeds, flags such as ephemeral 1<<6 and IS_V2 1<<15, content).
   Reuse the repo's own test fixtures and mocks (`tests/*.test.mjs`, `tests/botfeat-sample.mjs`, the mock server) to drive
   each command and cron path. `bot/emojis.gen.js` is empty in tests; fill the emoji map in the preload so custom emoji
   render as icons.
2. Drive DMs through the real notify/deliver functions, drive cron jobs by calling their handlers with fake env/D1/KV,
   and drive result and burner posts through `scripts/lib/resultpost.mjs` and `bot/burnerstats.js`.
3. Render card images with the repo's own generators (`scripts/cards.mjs`, `bot/cardstudio.js`, `bot/avatarcard.js`) to PNG
   with headless Chrome (`scripts/lib/chrome.mjs`). Chrome does not start inside the sandbox, so run those steps unsandboxed.
   Per-match score and field cards for a dozen real matches are better than one generic image.
4. Keep a registry file: one entry per message with id, name, category (automated, manager, slash, notice, DM, per-app),
   trigger, schedule, destinations, flag, status, source, related ids. Classify and de-duplicate from that, not by eye.
5. Where a real capture is impossible (needs a live platform, a token, or live EA data), build it from the code's own
   builder with sample data and mark it "rebuilt from code". Label pictures that come from a platform (stream snapshot,
   video thumbnail, channel picture) as placeholders.
6. Emit ONE self-contained HTML file (images as data URIs, a small renderer script, no external requests except Google
   Fonts) with: filters by category, app, status, duplicates and unique, a search box, and a count per filter. Dark theme using
   the Phoenix colours. Put the generator scripts in the repo (for example `tools/bot-audit/`) so I can re-run it whenever
   the bot changes. Output the page to `PLANNING/bot-audit.html` and keep it out of the deployed site.

**Reference from the NOREX project (read only, do not copy files across or reuse NOREX branding).**
The NOREX version of this work exists and is the model for layout and the fields above:
- `/home/mrsuccess/NOREX UNITED/PLANNING/bot-outputs-final.html` (every message, with trigger, destination, flag, status, duplicates)
- `/home/mrsuccess/NOREX UNITED/PLANNING/bot-outputs-before-after.html` (before and after side by side, with the issue list)
- `/home/mrsuccess/NOREX UNITED/PLANNING/bot-outputs-current.html` (the first, plainest "as it looks today" gallery)
- Published private artifacts: https://claude.ai/artifact/TnrpjDT9YhHPYdwywZafjm and https://claude.ai/artifact/S9UzdiJ9s3oB4X64FirD5W
Look at the HTML source for the message renderer and layout. The capture scripts that produced them lived in a temporary
folder and are gone, so rebuild them for Phoenix. Phoenix has a different set of apps (core, stats, tools, fun, matchday,
rush) and no separate music/DJ bot, so skip the DJ section. Do check whether Phoenix has anything the NOREX bot did not.

**Deliverable now: the CURRENT-state page only** (first version of the NOREX work was exactly this). Redesign proposals,
a before/after page and any code changes come later, after I have looked at it. Do not touch live Discord or deploy anything.

**Finish with:** counts per category and status, what could not be captured and why, any NOREX leaks found, how to re-run
the generator, and the next-session prompt (name Sonnet or Opus). Run `node tests/run.mjs` before any push, add no AI
attribution anywhere in the repo, and stage and commit in one call.

---

## Notes for me (not part of the prompt)
- The new session starts cold. The prompt points at the NOREX HTML files by absolute path so it can read the finished
  versions. Keeping the NOREX files outside this repo avoids breaking the "no NOREX leftovers" rule here.
- Suggested follow-ups once the current-state page exists: a Phoenix design-system pass (one panel format, per-feature
  banners, Phoenix crest), then a before/after page, then implement in bundled waves.
