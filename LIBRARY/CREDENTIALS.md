# Credentials and keys (registry only)

Last verified: 2026-11-15

**Never write a secret value into this repo, this library, a prompt, a commit message or chat.** This file says where each credential
lives and who owns it, so a session can find it without anyone pasting it. The detailed table (app IDs, token names, where each is set in
the Worker and in GitHub) is `bot/SECRETS-REGISTRY.md`; it is the single source and `tests/docs-fresh.test.mjs` keeps it in step with the code.

| Kind | Where the value lives | Registry row | Owner action |
|---|---|---|---|
| Discord bot tokens (one per app) | Dev Portal, set in the Worker and GitHub secrets | `bot/SECRETS-REGISTRY.md`, "Discord apps" and "Secrets" | Reset in the portal, then `set-tokens.sh` |
| Discord application IDs and public keys | Public; `bot/wrangler.toml` | same | none |
| VAPID, dispatch and analytics secrets | Worker secrets | same | Rotate by the owner |
| GitHub access | `gh` login on the owner's machine (`gh auth setup-git` makes plain `git push` work) | memory note `git-push-gh-credential` | Re-login if expired |
| Cloudflare account and deploy token | Owner's Cloudflare account; deploys run from GitHub (`bot.yml`) | `bot/SECRETS-REGISTRY.md` (verify the exact names in PF-002) | Owner only |
| Any other key (analytics, club data) | Worker secrets or GitHub secrets; never committed | `bot/SECRETS-REGISTRY.md` | Owner |

Rules for sessions:
- Read secrets from the environment or the platform that holds them; do not print them, log them, or copy them into files.
- Never type a password into a login. Ask the owner to enter it.
- A new secret gets a row in `bot/SECRETS-REGISTRY.md` (name, purpose, where set, date), not a value.
- `tests/library.test.mjs` fails if a token-shaped string appears anywhere in `LIBRARY/`.
