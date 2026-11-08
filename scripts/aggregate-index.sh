#!/usr/bin/env bash
set -euo pipefail
git config user.name github-actions[bot]
git config user.email 41898282+github-actions[bot]@users.noreply.github.com
for attempt in 1 2 3; do
  git fetch origin main
  git reset --hard origin/main
  vesper index aggregate --index .
  git add apps
  if git diff --cached --quiet; then
    exit 0
  fi
  git commit -m "chore: aggregate developer metadata"
  if git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push origin HEAD:main; then
    # GITHUB_TOKEN pushes do not start push workflows.
    gh workflow run snapshot.yml --ref main --repo "$REPO"
    exit 0
  fi
done
echo 'Aggregation push failed after three fresh attempts.' >&2
exit 1
