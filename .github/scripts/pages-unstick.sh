#!/usr/bin/env bash
# Clears a GitHub Pages deployment left stuck by an earlier run (seen 2026-11-10: stuck in "syncing_files" for 20+ min).
# While one is open, GitHub refuses every new deploy with "in progress deployment, please cancel <sha> first".
#
# Only cancels deployments that are BOTH in an early state (files not yet live) AND older than 10 minutes. Late states
# such as "updating_pages" / "purging_cdn" are left alone: GitHub can leave a deployment that already went live parked
# there, and cancelling it would mark the live site's deployment cancelled.
#
#   pages-unstick.sh          cancel stuck leftovers once
#   pages-unstick.sh --wait   also wait (up to ~8 min) until GitHub reports them closed
#
# Needs GH_TOKEN with pages: write and deployments: read. Never fails the job: the deploy step reports real errors.
set -uo pipefail

repo="${GITHUB_REPOSITORY:?}"
wait_mode="${1:-}"
early=" deployment_queued deployment_in_progress syncing_files "
min_age=600 # seconds

stuck_leftovers() {
  local now; now=$(date -u +%s)
  gh api "repos/$repo/deployments?environment=github-pages&per_page=10" --jq '.[]|"\(.sha) \(.created_at)"' 2>/dev/null |
    while read -r sha created; do
      [ "$sha" = "${GITHUB_SHA:-}" ] && continue
      age=$(( now - $(date -u -d "$created" +%s) ))
      [ "$age" -lt "$min_age" ] && continue
      status=$(gh api "repos/$repo/pages/deployments/$sha" --jq '.status' 2>/dev/null) || continue
      case "$early" in *" $status "*) echo "$sha $status $age" ;; esac
    done | sort -u
}

for attempt in $(seq 1 16); do
  left=$(stuck_leftovers)
  if [ -z "$left" ]; then
    [ "$attempt" -gt 1 ] && echo "Pages queue is clear."
    exit 0
  fi
  while read -r sha status age; do
    echo "Cancelling stuck Pages deployment $sha (status: $status, $((age / 60)) min old)"
    gh api -X POST "repos/$repo/pages/deployments/$sha/cancel" >/dev/null 2>&1 || echo "  cancel request failed, will check again"
  done <<<"$left"
  [ "$wait_mode" = "--wait" ] || exit 0
  sleep 30
done
echo "::warning::A stuck Pages deployment is still open after ~8 minutes; the deploy may be refused."
exit 0
