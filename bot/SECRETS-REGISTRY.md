# Secrets registry (names and locations only, never values)

Last checked: 2026-11-10. Values are never stored here. Public IDs and keys are in `bot/wrangler.toml`.

## Discord apps

| App | Application ID | Public key | Endpoint | Intents on |
|---|---|---|---|---|
| core "Phoenix Fire" | 1569450321057550537 | in wrangler.toml (`DISCORD_PUBLIC_KEY`) | `/interactions/core` and `/` | members, presence, message content |
| stats "Phoenix Stats" | 1569608077748080720 | in wrangler.toml (`_STATS`) | `/interactions/stats` | none |
| tools "Phoenix Toolbot" | 1569608448507650048 | in wrangler.toml (`_TOOLS`) | `/interactions/tools` | members |
| fun "Phoenix Fun" | 1569608868533637121 | in wrangler.toml (`_FUN`) | `/interactions/fun` | none |

Core OAuth redirect: `https://phoenix-bot.norexunited.workers.dev/auth/callback` (verified in the portal).

## Secrets: where each one lives

| Name | Needed for | Source | In Worker | In GitHub |
|---|---|---|---|---|
| `DISCORD_BOT_TOKEN` | core bot token (fallback name) | Dev Portal, core app, Bot, Reset Token | MISSING | no |
| `DISCORD_BOT_TOKEN_CORE` | core bot token | same | MISSING | no |
| `DISCORD_BOT_TOKEN_STATS` | stats app | Dev Portal, Stats app, Bot, Reset Token | MISSING | no |
| `DISCORD_BOT_TOKEN_TOOLS` | toolbot app | Dev Portal, Toolbot app, Bot, Reset Token | MISSING | no |
| `DISCORD_BOT_TOKEN_FUN` | fun app | Dev Portal, Fun app, Bot, Reset Token | MISSING | no |
| `DISCORD_CLIENT_SECRET` | website login (core) | Dev Portal, core app, OAuth2, Reset Secret | present | no |
| `GH_DISPATCH_TOKEN` | cron triggers site update | GitHub fine-grained token, Actions write on this repo | MISSING | no |
| `VAPID_PRIVATE_KEY` | web push | keypair generated once | MISSING | no |
| `CLOUDFLARE_ANALYTICS_TOKEN` | health page | Cloudflare token, Account Analytics read | MISSING | no |
| `CLOUDFLARE_ACCOUNT_ID` | health page and CI | c84cd49d2e12a5dca30af9abbb35ce9e (not secret) | MISSING | no |
| `CLOUDFLARE_API_TOKEN` | CI deploy | Cloudflare, API tokens, "phoenix-bot CI deploy" | n/a | no |

Cloudflare token form "phoenix-bot CI deploy" is prepared in Chrome but not yet created.

## Problems found

- The Worker has a secret whose *name* looks like a pasted token value (a mistaken `wrangler secret put <value>`). Delete it with
  `wrangler secret delete "<that name>"` and treat the pasted value as leaked: reset the matching token or secret in its portal.
- Without `DISCORD_BOT_TOKEN` (core), posts, role sync and cron messages cannot work.
- No GitHub Actions secrets exist, so `bot.yml` skips every step. Deploys are manual with wrangler until
  `CLOUDFLARE_API_TOKEN` is added.

## How to set one

```
cd bot && npx wrangler secret put NAME      # paste at the prompt
gh secret set NAME                          # same for GitHub
```
