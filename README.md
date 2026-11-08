# Vesper index template

Fork this repository as the public index for a game catalogue. Each application lives under `apps/<app_id>/`. A registration PR adds the developer public key to `routes.json`; the offline root maintainer signs that change before merge. A game PR adds `store.json`, `description.md`, and developer-signed `targets.json`. `snapshot.json` and `timestamp.json` are produced by Actions.

`store.json` keeps only HTTPS URLs, BLAKE3 hashes, and dimensions for media. Host the actual images in the developer repository or a release. The schema is JSON Schema 2020-12 and `scripts/validate-store.mjs` performs the same practical subset without dependencies.

## Local checks

```bash
node scripts/validate-store.mjs .
node scripts/build-api.mjs --index . --out dist
node --test
```

The API build is deterministic: its generated time is a fixed epoch value so the same inputs produce the same bytes. It writes paged app lists (50 per page), one app record, tag groups, an index record, and copies signed metadata.

## Publishing and signing

Offline maintainers sign `routes.json` with the platform root threshold. Developers sign `targets.json` using `vesper` and submit a PR. The `channels.<channel>.manifest` object contains `release_tag`, `asset_name`, `size`, and `blake3`; `sources[]` uses only `{release}` and `{pack_id}` template variables. TUF hashed bins are a future extension once the route table is large enough.

`verify-pr.yml` uses `pull_request` without secrets. Its checks provide fast feedback to contributors; a PR can change those checks, so their success alone never authorizes a merge. `merge.yml` uses `workflow_run` and checks out only the repository default branch with persisted credentials disabled. Its trusted `scripts/check-pr-files.mjs` independently checks the entire paginated PR file list, including old rename paths, before merging. It refuses incomplete file lists and verifies the PR is still open, targets the default branch of this repository, and has the exact `workflow_run.head_sha`.

Automatic merge permits only `store.json`, `description.md`, `targets.json`, `snapshot.json`, and `timestamp.json` under one `apps/<app_id>/` directory. Empty diffs, changes to two apps, `routes.json`, `.github/`, `scripts/`, `schemas/`, `root.json`, and every other path require a maintainer merge; the workflow logs the reason. A `routes.json` change requires the `maintainer-approved` label for PR feedback and still cannot merge automatically. `--match-head-commit` prevents merging a head changed after inspection. For fork PRs without a `workflow_run.pull_requests` entry, the job finds the open PR by head repository, branch, and exact head SHA. It never checks out PR code or downloads PR artifacts with merge credentials.

`snapshot.yml` and `timestamp.yml` use `VESPER_ONLINE_KEY` only in trusted branch workflows. They share the `index-signing-main` job concurrency group. Each attempt fetches current `main`, discards the previous local signing attempt, and regenerates signatures before pushing; three push failures fail the job. Signed commits are never rebased onto newer metadata.

The GS-G7 signing and verification changes require **vesper >= 0.2.0**. `vesper index pending-snapshots` selects only apps whose canonical targets description changed or whose snapshot has less than two days remaining. `vesper index snapshot` does nothing for other apps; a renewed snapshot increments its own previous version and renews that app's timestamp in the same command. Timestamp versions increment independently from the previous timestamp. Snapshot expiry is checked daily as well as after pushes and merges; timestamps retain one-day validity and refresh every six hours.

Default `vesper index verify` checks developer signatures, online signatures when defined by root, expiry and both canonical version/length/SHA-256 links: timestamp -> snapshot -> targets. Untrusted PR feedback explicitly uses `--targets-only --previous .base-index`, because online signing happens after merge and no online key is available to a PR. That pre-signing check is not a complete published-index verification. Signing always runs the full verifier before committing.

After a successful trusted merge, `merge-pr.sh` dispatches `snapshot.yml` on `main` with `actions: write`. Signing jobs call reusable `pages.yml` with the successfully pushed output SHA, even when no signing changes were needed (for example a store-only PR). Pages checks out that SHA, queues a fresh signing pass for superseded revisions, and serializes deployments with `index-pages-main`. Direct Pages push/manual entry points dispatch signing first so changed targets are never deployed before their snapshot and timestamp. These explicit dispatches and reusable calls work for changes made with `GITHUB_TOKEN`; ordinary bot pushes do not trigger another workflow. The merge script collects paginated API pages before flattening them with Node, avoiding the incompatible `gh --slurp --jq` combination without requiring jq locally.

Tests use `test/fixtures/index`, not the live `apps/` catalogue. The merge shell tests execute Git Bash on Windows with a fake `gh` at the front of PATH; they skip with a reason only when Bash is unavailable.

## Prebuilt vesper installation

All three index workflows download `vesper-linux-x64` from the public binary-only repository
`EthanInMel/gsp-releases`, check its pinned SHA-256 before execution, and never need
access to the private source repository. The template uses the pre-publication
placeholders `VESPER_VERSION: '0.3.0'` and
`VESPER_SHA256: '0000000000000000000000000000000000000000000000000000000000000000'`
in all three workflows. Before using the signing pipeline, the maintainer must
build and publish vesper 0.3.0 and update the checksum in all three workflows from
the reviewed `SHA256SUMS`. The static workflow tests warn about the placeholder
without failing; workflow execution fails closed until the real checksum is
supplied. Keep `VESPER_RELEASES_REPO` identical across workflows. No publication
or pin migration is performed automatically.

Build and manual publication instructions are in [the private source release guide](../docs/vesper-releases.md). Copy that guide alongside the template if using this directory as a standalone repository. Only the maintainer publishes binary assets; no private source checkout or source token is required in index Actions.

Cloudflare Pages is recommended for the generated `dist` directory because it can connect directly to this repository and serves static files globally without a Worker request path. Build command: `node scripts/build-api.mjs --index . --out dist`; output directory: `dist`. GitHub Pages remains available through `pages.yml`.
