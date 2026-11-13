---
description: Check every Phoenix bot output for Discord limits, design-system drift and NOREX leaks
argument-hint: [word to filter by]
---
Run `node tools/bot-studio/studio.mjs capture` then `node tools/bot-studio/studio.mjs check $ARGUMENTS` from the repo
root. Summarise the FIX items first (file and what breaks), then the warnings. Do not fix anything unless asked.
