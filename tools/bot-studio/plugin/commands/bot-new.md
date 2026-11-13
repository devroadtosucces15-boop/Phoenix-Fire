---
description: Draft a new Phoenix bot message and draw it like Discord before wiring it
argument-hint: <name> [what it should say]
---
Use the bot-output-studio skill, "Adding a new output". Name and brief: $ARGUMENTS

Create the draft with `node tools/bot-studio/studio.mjs new`, shape it, `render` it, and show the user the result
before touching any bot module.
