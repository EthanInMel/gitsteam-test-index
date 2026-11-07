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

`verify-pr.yml` uses `pull_request`, runs no secrets in PR jobs, and checks the changed path before invoking the fixed `GSP_REF` source. A separate `workflow_run` job is the place for a maintainer-controlled auto-merge, so untrusted PR code is never executed with merge credentials. `snapshot.yml` and `timestamp.yml` use `GSP_ONLINE_KEY` only on pushes or scheduled/manual runs on `main`.

One pull request may change only one `apps/<app_id>/` directory. A `routes.json` change requires the `maintainer-approved` label for verification and is always left for a maintainer to merge manually. `merge.yml` binds the merge to the exact verified `workflow_run.head_sha` with `--match-head-commit`; for fork pull requests, where GitHub may leave `workflow_run.pull_requests` empty, it finds the open pull request by head repository, branch, and exact head SHA.

Cloudflare Pages is recommended for the generated `dist` directory because it can connect directly to this repository and serves static files globally without a Worker request path. Build command: `node scripts/build-api.mjs --index . --out dist`; output directory: `dist`. GitHub Pages remains available through `pages.yml`.
