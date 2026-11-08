#!/usr/bin/env bash
set -euo pipefail
data() { node scripts/merge-data.mjs "$@"; }
sha="$VERIFIED_SHA"
number=$(data number "$GITHUB_EVENT_PATH")
if [ -z "$number" ]; then
  head_repo=$(data head-repo "$GITHUB_EVENT_PATH")
  head_branch=$(data head-branch "$GITHUB_EVENT_PATH")
  test -n "$head_repo" -a -n "$head_branch"
  gh api --method GET "repos/$REPO/pulls" -f state=open \
    -f "head=${head_repo%%/*}:$head_branch" --paginate --slurp > "$RUNNER_TEMP/pr-candidates.json"
  number=$(data candidate "$RUNNER_TEMP/pr-candidates.json" "$sha" "$head_repo")
fi
test -n "$number"
[[ "$number" =~ ^[0-9]+$ ]]
gh api "repos/$REPO/pulls/$number" > "$RUNNER_TEMP/pr.json"
if ! data matches "$RUNNER_TEMP/pr.json" "$sha" "$DEFAULT_BRANCH" "$REPO"; then
  echo 'Maintainer merge required: PR head, state, or base no longer matches.'
  exit 0
fi
# First collect pages, then flatten separately; gh disallows --slurp with --jq.
gh api "repos/$REPO/pulls/$number/files?per_page=100" --paginate --slurp > "$RUNNER_TEMP/pr-file-pages.json"
data flatten "$RUNNER_TEMP/pr-file-pages.json" > "$RUNNER_TEMP/pr-files.json"
# GitHub caps this endpoint at 3000 files. Fail closed on incomplete diffs.
if [ "$(data count "$RUNNER_TEMP/pr-files.json")" != "$(data changed "$RUNNER_TEMP/pr.json")" ]; then
  echo 'Maintainer merge required: incomplete PR file list.'
  exit 0
fi
# Re-read current registry data rather than trusting the job's earlier checkout.
gh api "repos/$REPO/contents/routes.json?ref=$DEFAULT_BRANCH" \
  --header 'Accept: application/vnd.github.raw+json' > "$RUNNER_TEMP/routes.json"
if ! node scripts/check-pr-files.mjs "$RUNNER_TEMP/pr-files.json" "$RUNNER_TEMP/routes.json"; then
  echo 'Automatic merge skipped; see the path policy reason above.'
  exit 0
fi
gh pr merge "$number" --squash --match-head-commit "$sha" --repo "$REPO"
gh workflow run snapshot.yml --ref "$DEFAULT_BRANCH" --repo "$REPO"
