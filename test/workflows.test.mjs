import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = name => fs.readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("all index jobs install the same checksum-pinned public binary", t => {
  const pins = ["verify-pr", "snapshot", "timestamp"].map(name => {
    const yaml = read(name);
    assert.doesNotMatch(yaml, /cargo install|actions\/cache|VESPER_REF/);
    assert.match(yaml, /curl -fsSL --retry 3/);
    assert.match(yaml, /sha256sum -c -/);
    assert.match(yaml, /set -euo pipefail/);
    assert.match(yaml, /https:\/\/github\.com\/\$VESPER_RELEASES_REPO\/releases\/download\/vesper-v\$VESPER_VERSION\/vesper-linux-x64/);
    assert.match(yaml, /chmod \+x "\$RUNNER_TEMP\/vesper\/vesper"/);
    assert.match(yaml, /echo "\$RUNNER_TEMP\/vesper" >> "\$GITHUB_PATH"/);
    assert.match(yaml, /"\$RUNNER_TEMP\/vesper\/vesper" --version/);
    const env = /^env:\n((?:  [^\n]+\n)+)/m.exec(yaml)?.[1];
    assert.ok(env, `${name} must declare workflow-level pins`);
    const value = key => new RegExp(`^  ${key}: ['"]?([^'"\\s]+)['"]?$`, "m").exec(env)?.[1];
    const pin = [value("VESPER_VERSION"), value("VESPER_SHA256"), value("VESPER_RELEASES_REPO")];
    assert.match(pin[0] ?? "", /^\d+\.\d+\.\d+$/);
    assert.match(pin[1] ?? "", /^[0-9a-f]{64}$/);
    assert.equal(pin[2], "EthanInMel/gsp-releases");
    // Verify that a checksum error stops execution before the file can run.
    assert.ok(yaml.indexOf("sha256sum -c -") < yaml.indexOf("chmod +x"));
    return pin;
  });
  assert.deepEqual(pins[0], pins[1]);
  assert.deepEqual(pins[0], pins[2]);
  if (/^0{64}$/.test(pins[0][1])) {
    t.diagnostic("WARNING: VESPER_SHA256 is the release placeholder; replace all three workflow pins after manual publication.");
  }
});

test("trusted merge uses default branch code and dispatches signing after merge", () => {
  const yaml = read("merge");
  const script = fs.readFileSync(new URL("../scripts/merge-pr.sh", import.meta.url), "utf8");
  assert.match(yaml, /workflow_run:/);
  assert.match(yaml, /ref: \$\{\{ github.event.repository.default_branch \}\}/);
  assert.match(yaml, /persist-credentials: false/);
  assert.match(yaml, /actions: write/);
  assert.match(yaml, /bash scripts\/merge-pr.sh/);
  assert.match(script, /node scripts\/check-pr-files\.mjs/);
  assert.match(script, /--match-head-commit "\$sha"/);
  assert.match(script, /gh workflow run snapshot.yml --ref "\$DEFAULT_BRANCH"/);
  assert.doesNotMatch(yaml, /ref:.*head|pull_request_target|download-artifact/);
});

test("gh never combines slurp with jq or template in any workflow or shell script", () => {
  const directories = [new URL("../.github/workflows/", import.meta.url), new URL("../scripts/", import.meta.url)];
  for (const dir of directories) for (const name of fs.readdirSync(dir)) {
    if (!/\.(ya?ml|sh)$/.test(name)) continue;
    const source = fs.readFileSync(new URL(name, dir), "utf8").replace(/\\\r?\n\s*/g, " ");
    for (const line of source.split(/\r?\n/)) {
      if (!/\bgh\s/.test(line) || /^\s*#/.test(line)) continue;
      assert.ok(!(line.includes("--slurp") && /--(?:jq|template)(?:[=\s]|$)/.test(line)), `${name}: ${line}`);
    }
  }
});

test("signers serialize, regenerate on conflicts and deploy their output SHA", () => {
  const script = fs.readFileSync(new URL("../scripts/sign-index.sh", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(read("timestamp"), /cron: '17 \*\/6 \* \* \*'/);
  for (const name of ["snapshot", "timestamp"]) {
    const yaml = read(name);
    assert.match(yaml, /group: index-signing-main/);
    assert.match(yaml, /cancel-in-progress: false/);
    assert.match(yaml, new RegExp(`needs: ${name}`));
    assert.match(yaml, /uses: \.\/\.github\/workflows\/pages.yml/);
    assert.ok(yaml.includes("sha: ${{ needs." + name + ".outputs.sha }}"));
  }
  assert.match(script, /for attempt in 1 2 3; do/);
  assert.match(script, /git fetch origin main\n  git reset --hard origin\/main/);
  assert.doesNotMatch(script, /git (?:pull|rebase)/);
  assert.match(script, /vesper index pending-snapshots --index/);
  assert.match(script, /vesper index verify --index/);
  assert.match(script, /sha=\$\(git rev-parse HEAD\)/);
  const pages = read("pages");
  assert.match(pages, /workflow_call:/);
  assert.match(pages, /push:/);
  assert.match(pages, /workflow_dispatch:/);
  assert.match(pages, /ref: \$\{\{ inputs.sha/);
  assert.match(pages, /group: index-pages-main/);
  assert.match(pages, /late stale caller/);
  assert.match(pages, /if: needs.build.outputs.current == 'true'/);
  assert.match(pages, /gh workflow run snapshot.yml --ref main/);
});
