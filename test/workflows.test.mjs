import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = name => fs.readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("all index jobs install the same checksum-pinned public binary", t => {
  const pins = ["verify-pr", "snapshot", "timestamp"].map(name => {
    const yaml = read(name);
    assert.doesNotMatch(yaml, /cargo install|actions\/cache|GSP_REF/);
    assert.match(yaml, /curl -fsSL --retry 3/);
    assert.match(yaml, /sha256sum -c -/);
    assert.match(yaml, /set -euo pipefail/);
    assert.match(yaml, /https:\/\/github\.com\/\$GSP_RELEASES_REPO\/releases\/download\/gsp-v\$GSP_VERSION\/gsp-linux-x64/);
    assert.match(yaml, /chmod \+x "\$RUNNER_TEMP\/gsp\/gsp"/);
    assert.match(yaml, /echo "\$RUNNER_TEMP\/gsp" >> "\$GITHUB_PATH"/);
    assert.match(yaml, /"\$RUNNER_TEMP\/gsp\/gsp" --version/);
    const env = /^env:\n((?:  [^\n]+\n)+)/m.exec(yaml)?.[1];
    assert.ok(env, `${name} must declare workflow-level pins`);
    const value = key => new RegExp(`^  ${key}: ['"]?([^'"\\s]+)['"]?$`, "m").exec(env)?.[1];
    const pin = [value("GSP_VERSION"), value("GSP_SHA256"), value("GSP_RELEASES_REPO")];
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
    t.diagnostic("WARNING: GSP_SHA256 is the release placeholder; replace all three workflow pins after manual publication.");
  }
});

test("trusted merge checks the entire PR from the default branch", () => {
  const yaml = read("merge");
  assert.match(yaml, /workflow_run:/);
  assert.match(yaml, /ref: \$\{\{ github.event.repository.default_branch \}\}/);
  assert.equal((yaml.match(/ref:/g) ?? []).length, 1);
  assert.match(yaml, /persist-credentials: false/);
  assert.match(yaml, /node scripts\/check-pr-files\.mjs/);
  assert.match(yaml, /pulls\/\$number\/files\?per_page=100" --paginate --slurp/);
  assert.match(yaml, /\.changed_files/);
  assert.match(yaml, /\.head.sha == \$sha/);
  assert.match(yaml, /head=\$\{head_repo%%\/\*\}:\$head_branch/);
  assert.match(yaml, /\.head.repo.full_name == \$repo/);
  assert.match(yaml, /--match-head-commit "\$sha"/);
  assert.doesNotMatch(yaml, /commits\/|ref:.*head|pull_request_target|download-artifact/);
});

test("timestamps refresh every six hours and signing pushes retry once", () => {
  assert.match(read("timestamp"), /cron: '17 \*\/6 \* \* \*'/);
  for (const name of ["snapshot", "timestamp"]) {
    assert.match(read(name), /git push \|\| \{ git pull --rebase && git push; \}/);
  }
});
