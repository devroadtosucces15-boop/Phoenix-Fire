#!/usr/bin/env bash
# Sets the three remaining secrets in the Worker AND GitHub Actions. Input is hidden and never written to disk.
# Usage: set-secrets.sh [GH_DISPATCH_TOKEN VAPID_PRIVATE_KEY CLOUDFLARE_ANALYTICS_TOKEN]   (default: all three)
#   GH_DISPATCH_TOKEN          paste: GitHub fine-grained token, this repo only, Actions: read and write
#   CLOUDFLARE_ANALYTICS_TOKEN paste: Cloudflare token, Account Analytics: Read
#   VAPID_PRIVATE_KEY          nothing to paste: a keypair is generated here. Only the PUBLIC half is printed.
set -u
cd "$(dirname "$0")"
REPO=devroadtosucces15-boop/Phoenix-Fire

put() { # $1 = secret name, $2 = value
  printf '%s' "$2" | npx wrangler secret put "$1" >/dev/null && echo "  worker: $1 set"
  gh secret set "$1" --repo "$REPO" --body "$2" && echo "  github: $1 set"
}

ask() { # $1 = name, $2 = prompt, $3 = min length
  printf '%s, Enter to skip: ' "$2"
  read -rs val; echo
  val="${val//[$'\r\n\t ']/}"
  if [ -z "$val" ]; then echo "  skipped $1"; return; fi
  echo "  got ${#val} characters"
  if [ "${#val}" -lt "$3" ]; then echo "  too short, not saved. Re-run for $1."; return; fi
  put "$1" "$val"
}

names=("$@"); [ ${#names[@]} -eq 0 ] && names=(GH_DISPATCH_TOKEN VAPID_PRIVATE_KEY CLOUDFLARE_ANALYTICS_TOKEN)
for n in "${names[@]}"; do
  case "$n" in
    GH_DISPATCH_TOKEN) ask "$n" "GitHub token (fine-grained, Phoenix-Fire only, Actions read/write)" 30 ;;
    CLOUDFLARE_ANALYTICS_TOKEN) ask "$n" "Cloudflare token (Account Analytics: Read)" 30 ;;
    VAPID_PRIVATE_KEY)
      if gh secret list --repo "$REPO" 2>/dev/null | grep -q '^VAPID_PRIVATE_KEY'; then
        echo "VAPID_PRIVATE_KEY already exists in GitHub. Not overwriting (that would break existing push subscriptions)."; continue
      fi
      out=$(node vapid-gen.mjs) || { echo "  keygen failed"; continue; }
      pub=$(printf '%s\n' "$out" | sed -n 's/^VAPID_PUBLIC_KEY *= *//p')
      priv=$(printf '%s\n' "$out" | sed -n 's/^VAPID_PRIVATE_KEY *= *//p')
      put VAPID_PRIVATE_KEY "$priv"
      unset priv out
      echo "  PUBLIC key (safe to share, tell Claude): $pub" ;;
    *) echo "unknown secret $n" ;;
  esac
done
echo "Done. Tell Claude which ones you set."
