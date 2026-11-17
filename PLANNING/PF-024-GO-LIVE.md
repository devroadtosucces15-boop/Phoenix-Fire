# PF-024 go-live (owner-only steps)

## Item 8: duplicate-post fix (code done on branch `pf-024-item8`)
No migration needed: claims use the existing `meta` table (keys `remind24:<event>`, `remind2:<event>`, `alert:<match>:<channel>`, `hotw:<week>`).
- Deploy the Worker (`phoenix-bot`) after the merge. Owner step.
- Still to check by hand (cannot be done from the repo): Cloudflare and GitHub for a second Worker, webhook or Actions job from the sibling club repo that uses the same bot tokens or webhook (cause D in the audit). Also `wrangler tail` for repeated posts after deploy.
- Not yet done (later items): one owner app per output (`events.discord_app`), CI result-post claim (`result:<match>`), board-id compare-and-set, `/matchday` read replies ephemeral.
