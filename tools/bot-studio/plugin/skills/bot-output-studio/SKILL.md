---
name: bot-output-studio
description: Use for any change to what the Phoenix Fire Discord apps send - redesigning, fixing, reformatting, correcting or adding a slash command reply, button, menu, form, automated post, DM, or a card image or banner. Also use when asked how a bot message looks, what a message depends on, or whether a bot change broke another message.
---

# Phoenix Bot Studio

The tool is `node tools/bot-studio/studio.mjs` (run from the repo root, `help` lists every command). It reads the
real bot code through the capture harness in `tools/bot-audit/`. It never edits bot code: you do, and it proves
the edit changed only what was meant.

Every output has an ID: `slash:/club`, `comp:norex:mp:…`, `auto:event-league`, `dm:notify:award`, `image:score`.
A unique part is enough (`/club`). `studio.mjs list <word>` finds them.

## Changing an existing output (redesign, fix, reformat, correct)

Follow these in order. Do not skip the snapshot or the verify step.

1. `studio.mjs deps <id>`: read the whole answer. It lists every file that must stay in step (builder, command
   definition, handlers of its buttons, card functions, flag, channel purpose, help text, tests) and a checklist
   for this exact output. Open each listed file you will touch.
2. `studio.mjs show <id>`: the current message, line by line, for every variant.
3. `studio.mjs snapshot`: remember how all outputs look before the edit.
4. Edit the builder. Rules that keep things working:
   - Build with `bot/ui.js` blocks (`message`, `header`, `text`, `facts`, `sep`, `footer`, `buttons`, `cards`,
     `notice`). Do not hand-write component JSON.
   - Stripe colour is an `ACCENT` key (`red` = Phoenix orange, `gold`, `win`, `loss`, `steel`). Never a hex value
     in a module. Brand values come from config (`orgName(env)`, `config.json`).
   - Never change a `custom_id`. Posts already in Discord keep sending the old one and the Worker matches by pattern.
     A new button gets a new ID plus a handler and a test.
   - Never add a channel or role name or ID to code. Channels come from the Organization config by purpose
     (`bot/orgconfig.js`); a new destination is a new purpose in `bot/orgconsts.js` plus a test.
   - Keep `allowed_mentions` and `ephemeral` as they were unless the task is to change them.
   - A shared helper (`bot/ui.js`, `bot/icons.js`, a helper inside the module) reaches many outputs: check
     "Other code that imports" in the deps answer first.
   - Card images are drawn by `scripts/cards.mjs`. After a template change bump `TEMPLATE_VERSION` there and
     `BANNER_V` in `bot/ui.js` to the same number, then `studio.mjs capture --cards` (needs Chrome, outside a sandbox).
   - Player images are chest up, clear of every card edge, with a big bold shirt number (CLAUDE.md).
   - If a command's name, description or options change: `bot/commanddefs.js`, the help text in `bot/help.js`,
     then tell the user the command must be re-registered (Boardroom → Sync to Discord). Do not register it yourself.
5. `studio.mjs verify <id>`: recaptures, checks Discord's limits, the design system and NOREX leaks, diffs
   against the snapshot and runs the tests tied to the output. "also changed, outside this output" means a
   shared helper moved: either that was the task, or revert that part.
6. Update or add a test for what changed (the repo rule: a rebrand or redesign extends a test).
7. `studio.mjs gallery <word>` and show the user the new look, then `studio.mjs snapshot` once they accept it.

## Adding a new output

1. `studio.mjs new <name>` creates `tools/bot-studio/drafts/<name>.mjs`. Shape the message there.
2. `studio.mjs render tools/bot-studio/drafts/<name>.mjs` draws it like Discord and checks limits and branding.
   Iterate with the user on the draft before touching bot code.
3. Wire it, following the list `new` printed: builder in a bot module, then for a command `bot/commanddefs.js`
   (`COMMANDS` and exactly one app in `APP_COMMANDS`), a route in `bot/worker.js`, `bot/help.js`; for a post a
   channel purpose; a feature flag in `config.json`; a sample in `tools/bot-audit/capture-auto.mjs`; a test.
4. `studio.mjs capture && studio.mjs check <name>`, then the gallery.

## Checking

`studio.mjs check` lists what Discord would reject, NOREX leaks, and cross-file mismatches (banner version,
missing banner pictures, accent vs config, command ownership). `FIX` items are real defects; `warn` items are
off the design system but still send. Report what you find; fix only what the user asked for.

## Limits to keep in mind

- Outputs that need live Discord, EA or an image model show "no offline preview". Say so instead of guessing how
  they look; their dependency list still works.
- Sample names and numbers come from the test fixtures, not the live club.
- Deploying, registering commands and posting to Discord are the user's to trigger.
