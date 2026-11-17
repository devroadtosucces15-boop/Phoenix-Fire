# PF-024 go-live (owner-only steps)

## Item 8: duplicate-post fix (code done on branch `pf-024-item8`)
No migration needed: claims use the existing `meta` table (keys `remind24:<event>`, `remind2:<event>`, `alert:<match>:<channel>`, `hotw:<week>`).
- Deploy the Worker (`phoenix-bot`) after the merge. Owner step.
- Still to check by hand (cannot be done from the repo): Cloudflare and GitHub for a second Worker, webhook or Actions job from the sibling club repo that uses the same bot tokens or webhook (cause D in the audit). Also `wrangler tail` for repeated posts after deploy.
- Not yet done (later items): one owner app per output (`events.discord_app`), CI result-post claim (`result:<match>`), board-id compare-and-set, `/matchday` read replies ephemeral.

## Item 9: Translator (code done on branch `pf-024-item9`)
Built interactions-only (no gateway, no Message Content intent): message context-menu command **Translate message** (type 3), plus `/translate`, `/enhance` (polish level 1 to 10, tone) and `/language` (saves the member's language in KV `tr:lang:<id>`). All four are in the **tools** app. Feature flag `translate` ships `owner`. New shared AI counter `bot/aibudget.js` (KV `aibudget:<UTC day>`, cap 6000 of the 10,000 free neurons, 20 s cooldown per person per feature; `AI_DAILY_CAP` var overrides). No migration, no new Worker route, no new channel or role.

Owner steps:
1. Deploy the Worker, then register commands (Boardroom "Sync to Discord" or `node bot/register.mjs`) so the right-click command and `/translate` `/enhance` `/language` appear. Owner step.
2. Set the flag: Control Center / Flags tab `translate` to `members` when happy (it is `owner` now).
3. Existing AI features (card studio, hype, `/ask`) do not yet spend from the new counter; they share the same 10,000 pool. Wire them in a later item if the pool runs dry.

Owner decisions (I did not guess; the default built is in bold):
- **Gateway vs interactions-only.** Built **interactions-only**. Limits: the Translator works only when someone right clicks a message or types text; it cannot auto-translate every message as it is sent. Auto-translate-on-send needs a new gateway process next to `dj/` with the Message Content intent (portal toggle, possibly a justification to Discord).
- **Privacy stance.** Built: the text is sent to Workers AI for that one call and never stored; only the chosen language is stored. If you want a posted line telling people this, add it to the rules channel. Cloudflare's Workers AI terms apply.
- **Which languages.** Built 14 (`bot/translatelangs.js`: English, Spanish, Portuguese, French, German, Italian, Dutch, Polish, Turkish, Arabic, Russian, Swedish, Danish, Romanian). Discord allows 25. Tell me the club's real languages.
- **Who may use it.** Built: flag `translate`, then everyone with that level (members when you flip it). Output is public in the channel by design (plan: not private). Option: members only, or managers only, through the flag level.
- **Model quality.** Uses the same small Llama model as `/ask` (`@cf/meta/llama-3.1-8b-instruct-fp8`), which is weak on street slang and rarer languages. Option: a larger model costs several times more neurons per call; set after a trial.
- **Daily cap.** 6000 neurons for new features. Raise or lower with the `AI_DAILY_CAP` var.

## Item 10: Quote card (code done on branch `pf-024-item10`)
Message context-menu command **Quote card** (type 3, tools app, no gateway, no Message Content intent): right click a message → Apps → Quote card. It draws a 1080×1080 Phoenix picture (big quote, author avatar, name, handle, date, crest, motto from `ORG_MOTTO` / config brand.motto) through the Images binding into R2 (`q/<hash>.png`, cached so the same quote is never drawn twice) and posts it publicly in the channel. No Images/R2 binding or a failed draw → a styled text quote instead. Limit 20 cards per person per hour (KV `quoterl:`). Flag `quoteCard` ships `owner`. No migration, no new route, no new channel or role. Code: `bot/quotecard.js`; test: `tests/quotecard.test.mjs`.

Owner steps:
1. Deploy the Worker and sync commands to Discord (the right-click command appears after the sync). Owner step.
2. Flip the `quoteCard` flag to `members` after trying it (it is `owner` now).
3. The drawn pictures stay in R2 forever. Cheap, but see decision 3.

Owner decisions (defaults built in bold):
- **Who may use it:** by flag level (**owner now**, then members). Option: managers only.
- **Whose messages may be quoted:** **any person's message in any channel the bot can see, shown with their name and avatar, posted publicly.** Options: an opt-out for authors (a `/language`-style setting), quote only the user's own messages, or exclude chosen channels (e.g. private staff ones). A message quoted from a private channel becomes visible where the command is run.
- **Retention:** **pictures are kept in R2 with no expiry.** Option: delete after N days (a cleanup job like the media guard).
- **Look:** one dark-ember square. Options: a light variant, a wide 16:9 format, a choice of backgrounds.
- **Not built:** quoting several messages, attachments and embeds (cards use text only), emoji in the picture (the renderer has no emoji font, so they are dropped).
