#!/usr/bin/env bash
# Sets each Discord bot token in the Worker AND in GitHub Actions, one prompt per app.
# Input is hidden and never written to disk. Press Enter on an empty prompt to skip an app.
# Usage: set-tokens.sh [CORE STATS TOOLS FUN]   (default: all four)
set -u
cd "$(dirname "$0")"
REPO=devroadtosucces15-boop/Phoenix-Fire

put() { # $1 = secret name, $2 = token
  printf '%s' "$2" | npx wrangler secret put "$1" >/dev/null && echo "  worker: $1 set"
  gh secret set "$1" --repo "$REPO" --body "$2" && echo "  github: $1 set"
}

apps=("$@"); [ ${#apps[@]} -eq 0 ] && apps=(CORE STATS TOOLS FUN)
for app in "${apps[@]}"; do
  printf 'Bot token for %s (Portal > that app > Bot > Reset Token), Enter to skip: ' "$app"
  read -rs tok; echo
  tok="${tok//[$'\r\n\t ']/}"
  if [ -z "$tok" ]; then echo "  skipped $app"; continue; fi
  echo "  got ${#tok} characters"
  if [ "${#tok}" -lt 50 ]; then echo "  too short for a bot token, not saved. Re-run for $app."; continue; fi
  if [ "${#tok}" -gt 100 ]; then echo "  too long for a bot token (pasted twice?), not saved. Re-run for $app."; continue; fi
  put "DISCORD_BOT_TOKEN_$app" "$tok"
  [ "$app" = CORE ] && put DISCORD_BOT_TOKEN "$tok"
done
echo "Done. Tell Claude to re-run the workflow."
