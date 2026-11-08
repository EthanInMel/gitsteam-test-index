#!/usr/bin/env bash
set -euo pipefail
mode="$1"
[[ "$mode" == snapshot || "$mode" == timestamp ]]
git config user.name github-actions[bot]
git config user.email 41898282+github-actions[bot]@users.noreply.github.com
for attempt in 1 2 3; do
  git fetch origin main
  git reset --hard origin/main
  if [ "$mode" = snapshot ]; then
    vesper index pending-snapshots --index . > "$RUNNER_TEMP/pending-apps.txt"
    while IFS= read -r app; do
      vesper index snapshot --index . --app "$app"
    done < "$RUNNER_TEMP/pending-apps.txt"
  else
    # Repair changed/expiring snapshots before refreshing all timestamps.
    vesper index pending-snapshots --index . > "$RUNNER_TEMP/pending-apps.txt"
    while IFS= read -r app; do
      vesper index snapshot --index . --app "$app"
    done < "$RUNNER_TEMP/pending-apps.txt"
    vesper index timestamp --index . --all
  fi
  vesper index verify --index .
  git add apps
  if ! git diff --cached --quiet; then
    git commit -m "chore: refresh ${mode} metadata"
  fi
  if git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push origin HEAD:main; then
    echo "sha=$(git rev-parse HEAD)" >> "$GITHUB_OUTPUT"
    exit 0
  fi
  # Never rebase an already signed document onto newer metadata. Re-sign instead.
done
echo 'Signing push failed after three fresh signing attempts.' >&2
exit 1
