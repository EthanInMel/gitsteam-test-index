# GitSteam index template

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

Offline maintainers sign `routes.json` with the platform root threshold. Developers sign `targets.json` using `gsp` and submit a PR. The `channels.<channel>.manifest` object contains `release_tag`, `asset_name`, `size`, and `blake3`; `sources[]` uses only `{release}` and `{pack_id}` template variables. TUF hashed bins are a future extension once the route table is large enough.

`verify-pr.yml` uses `pull_request` without secrets. Its checks provide fast feedback to contributors; a PR can change those checks, so their success alone never authorizes a merge. `merge.yml` uses `workflow_run` and checks out only the repository default branch with persisted credentials disabled. Its trusted `scripts/check-pr-files.mjs` independently checks the entire paginated PR file list, including old rename paths, before merging. It refuses incomplete file lists and verifies the PR is still open, targets the default branch of this repository, and has the exact `workflow_run.head_sha`.

Automatic merge permits only `store.json`, `description.md`, `targets.json`, `snapshot.json`, and `timestamp.json` under one `apps/<app_id>/` directory. Empty diffs, changes to two apps, `routes.json`, `.github/`, `scripts/`, `schemas/`, `root.json`, and every other path require a maintainer merge; the workflow logs the reason. A `routes.json` change requires the `maintainer-approved` label for PR feedback and still cannot merge automatically. `--match-head-commit` prevents merging a head changed after inspection. For fork PRs without a `workflow_run.pull_requests` entry, the job finds the open PR by head repository, branch, and exact head SHA. It never checks out PR code or downloads PR artifacts with merge credentials.

`snapshot.yml` and `timestamp.yml` use `GSP_ONLINE_KEY` only in trusted branch workflows. Timestamps retain their one-day validity and refresh every six hours to tolerate a delayed or failed run. Both signing jobs retry a failed push once after `git pull --rebase`; a rebase conflict or second failure fails the job.

## Prebuilt gsp installation

All three index workflows download `gsp-linux-x64` from the public binary-only repository `EthanInMel/gsp-releases`, check its pinned SHA-256 before execution, and never need access to the private source repository. The initial `GSP_VERSION: '0.0.0'` and 64-zero `GSP_SHA256` are intentional release placeholders. They cannot install a usable binary: a missing release or checksum mismatch fails the job. After the maintainer publishes the release, replace **both pins in all three workflows** with the real version and Linux SHA-256 from the reviewed `SHA256SUMS`. Keep `GSP_RELEASES_REPO` identical across the workflows. `node --test test/*.mjs` warns about the zero hash while allowing this pre-publication template state.

Build and manual publication instructions are in [the private source release guide](../docs/gsp-releases.md). Copy that guide alongside the template if using this directory as a standalone repository. Only the maintainer publishes binary assets; no private source checkout or source token is required in index Actions.

Cloudflare Pages is recommended for the generated `dist` directory because it can connect directly to this repository and serves static files globally without a Worker request path. Build command: `node scripts/build-api.mjs --index . --out dist`; output directory: `dist`. GitHub Pages remains available through `pages.yml`.
