# Secrets registry (names and locations only, never values)

Last checked: 2026-11-10 (Matchday and Rush rows added 2026-11-12 from `bot/wrangler.toml` and `bot.yml`; whether their token secrets are set is not re-verified: the GitHub CLI login in the working session is expired). Values are never stored here. Public IDs and keys are in `bot/wrangler.toml`.

## Discord apps

| App | Application ID | Public key | Endpoint | Intents on |
|---|---|---|---|---|
| core "Phoenix Fire" | 1569450321057550537 | in wrangler.toml (`DISCORD_PUBLIC_KEY`) | `/interactions/core` and `/` | members, presence, message content |
| stats "Phoenix Stats" | 1569608077748080720 | in wrangler.toml (`_STATS`) | `/interactions/stats` | none |
| tools "Phoenix Toolbot" | 1569608448507650048 | in wrangler.toml (`_TOOLS`) | `/interactions/tools` | members |
| fun "Phoenix Fun" | 1569608868533637121 | in wrangler.toml (`_FUN`) | `/interactions/fun` | none (kept empty for the transition) |
| matchday "Phoenix Matchday" | 1569650108256092180 | in wrangler.toml (`_MATCHDAY`) | `/interactions/matchday` | none |
| rush "Phoenix Rush" | 1569650983120805988 | in wrangler.toml (`_RUSH`) | `/interactions/rush` | none |

Core OAuth redirect: `https://phoenix-bot.norexunited.workers.dev/auth/callback` (verified in the portal). The host keeps the original account subdomain until the owner moves it; `phoenix/worker-host.json` records it and `node phoenix/worker-host.mjs flip` updates this line (`PLANNING/WORKER-HOST.md`).

## Secrets: where each one lives

| Name | Needed for | Source | In Worker | In GitHub |
|---|---|---|---|---|
| `DISCORD_BOT_TOKEN` | core bot token (fallback name) | Dev Portal, core app, Bot, Reset Token | set 2026-11-10 | set 2026-11-10 |
| `DISCORD_BOT_TOKEN_CORE` | core bot token | same | set 2026-11-10 | set 2026-11-10 |
| `DISCORD_BOT_TOKEN_STATS` | stats app | Dev Portal, Stats app, Bot, Reset Token | set 2026-11-10 | set 2026-11-10 |
| `DISCORD_BOT_TOKEN_TOOLS` | toolbot app | Dev Portal, Toolbot app, Bot, Reset Token | set 2026-11-10 | set 2026-11-10 |
| `DISCORD_BOT_TOKEN_FUN` | fun app | Dev Portal, Fun app, Bot, Reset Token | set 2026-11-10 | set 2026-11-10 |
| `DISCORD_BOT_TOKEN_MATCHDAY` | matchday app | Dev Portal, Matchday app, Bot, Reset Token | set with `bot/set-tokens.sh MATCHDAY`; `bot.yml` uploads it | same |
| `DISCORD_BOT_TOKEN_RUSH` | rush app | Dev Portal, Rush app, Bot, Reset Token | set with `bot/set-tokens.sh RUSH`; `bot.yml` uploads it | same |
| `DISCORD_CLIENT_SECRET` | website login (core) | Dev Portal, core app, OAuth2, Reset Secret | present | no |
| `GH_DISPATCH_TOKEN` | cron triggers site update | GitHub fine-grained token, Actions write on this repo | set 2026-11-10 | set 2026-11-10 |
| `VAPID_PRIVATE_KEY` | web push | keypair generated once | set 2026-11-10 | set 2026-11-10 |
| `CLOUDFLARE_ANALYTICS_TOKEN` | health page | Cloudflare token, Account Analytics read | set 2026-11-10 | set 2026-11-10 |
| `CLOUDFLARE_ACCOUNT_ID` | health page and CI | c84cd49d2e12a5dca30af9abbb35ce9e (not secret) | set 2026-11-10 | set 2026-11-10 |
| `CLOUDFLARE_API_TOKEN` | CI deploy | Cloudflare, API tokens, "phoenix-bot CI deploy v2" | n/a | set 2026-11-10 |

CI: `bot.yml` run 42778501358 (2026-11-10) passed every step, including slash command registration. All four endpoints answer 401 to unsigned requests.
Bot tokens are set with `bash bot/set-tokens.sh [CORE STATS TOOLS FUN MATCHDAY RUSH]` (hidden input, sets Worker and GitHub).

## Problems found

- The Worker has a secret whose *name* looks like a pasted token value (a mistaken `wrangler secret put <value>`). Delete it with
  `wrangler secret delete "<that name>"` and treat the pasted value as leaked: reset the matching token or secret in its portal.

## How to set one

```
cd bot && npx wrangler secret put NAME      # paste at the prompt
gh secret set NAME                          # same for GitHub
```
