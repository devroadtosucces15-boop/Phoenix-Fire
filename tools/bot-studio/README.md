# Phoenix Bot Studio

See, check and safely change every message and picture the Phoenix Fire apps put into Discord.

```
node tools/bot-studio/studio.mjs help
```

| Command | What it does |
| --- | --- |
| `list [word]` | Every output with its ID |
| `show <id>` | One output as text: every line, button and picture |
| `gallery [word]` | The visual gallery, drawn like Discord → `out/gallery.html` |
| `deps <id>` | Every file that must stay in step when this output changes, plus an edit checklist |
| `check [word]` | Discord limits, design system (`bot/ui.js`), NOREX leaks, cross-file mismatches |
| `snapshot` / `diff` | Remember how every output looks, then see exactly what an edit changed |
| `verify <id>` | After an edit: recapture → check → diff → run the tests tied to that output |
| `new <name>` / `render <draft>` | Draft a new message and draw it before wiring it into the bot |
| `capture [--cards]` | Refresh the captures from the bot code (`--cards` redraws card images, needs Chrome) |

## How it works

`tools/bot-audit/` runs the real Worker against the repo's test mocks and records every message it would send
(`capture.mjs`: every slash command on its home app, then every button, menu and form it finds; `capture-auto.mjs`:
automated posts and DMs; `render-cards.mjs`: the card images). The studio reads those captures and adds:

- `lib/model.mjs`: one list of outputs (slash, component, form, automated, dm, image)
- `lib/deps.mjs`: the dependency map (imports, command sets, custom_id handlers, card functions, flags, channel purposes, help text, tests)
- `lib/lint.mjs`: per-message checks and cross-file checks
- `lib/snapshot.mjs`: stable fingerprints and readable diffs
- `lib/gallery.mjs` + `gallery.html`: the Discord-style page

The studio never edits bot code. `tests/botstudio.test.mjs` guards the tool itself.

## The workflow for a redesign

```
node tools/bot-studio/studio.mjs deps /club        # what is it wired to
node tools/bot-studio/studio.mjs snapshot          # before
# … edit the builder with bot/ui.js blocks …
node tools/bot-studio/studio.mjs verify /club      # after: proves only /club moved
node tools/bot-studio/studio.mjs gallery club      # look at it
```

## As a Claude Code plugin

`tools/bot-studio/` is also a plugin marketplace with one plugin (skill `bot-output-studio`, commands `/bot-redesign`,
`/bot-new`, `/bot-check`, `/bot-gallery`). Install once from the repo root in a terminal:

```
claude plugin marketplace add ./tools/bot-studio
claude plugin install phoenix-bot-studio@phoenix-tools
```

## Not covered offline

Outputs that need live Discord, EA or an image model (hype poster, Card Studio card, avatar card, weekly awards,
event reminders, leave log and others) are listed with "no offline preview" and the reason. Their dependency map
still works. Adding a sample for one is a few lines in `tools/bot-audit/capture-auto.mjs`.

## Every new output must register (Control Center)

Every command, button, automated post, scheduled job, DM/notification type and site section is listed in `bot/registry.gen.js`,
which the website's Control Center and the `/setup output` command read. **Never edit that file by hand.** It is generated:

```
node tools/bot-studio/studio.mjs capture     # redraw outputs (adds new samples)
node tools/bot-studio/studio.mjs registry    # rewrite bot/registry.gen.js from the live code
```

Adding an output = add it where it lives (a `COMMANDS` entry, a `notify.js` TYPES entry, a `job('name', …)` in `scheduled()`, a
`capture-auto.mjs` sample or an `UNCAPTURED` entry in `tools/bot-audit/registry.mjs`, a `config.json` feature), then run the two
commands above. `tests/controlcenter.test.mjs` fails when the registry is stale, when something exists without an entry, when a module
posts to a channel without being a registered source, or when a channel/role name or ID is typed into code. Channels and roles always
come from the Organization config or a Control Center row (`bot/controls.js`: `postChannels`, `audienceOf`, `gate`), never from code.
A skill or plugin that drafts a new output (`/bot-new`) must finish with these two commands.
