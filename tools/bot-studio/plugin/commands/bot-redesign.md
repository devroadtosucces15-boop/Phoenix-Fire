---
description: Redesign, fix or reformat one Phoenix bot output safely
argument-hint: <output id or word, e.g. /club> [what to change]
---
Use the bot-output-studio skill. Target: $ARGUMENTS

Run `node tools/bot-studio/studio.mjs deps` and `show` for the target, take a snapshot, make the change the user
described (ask one short question if they did not say what to change), then run `verify` and report: what changed,
what else moved, which tests ran, and the gallery file to look at.
