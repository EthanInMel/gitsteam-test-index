import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const scratch = path.join(root, "test/.tmp");
fs.mkdirSync(scratch, { recursive: true });
const bash = process.platform === "win32"
  ? [path.join(process.env.ProgramFiles, "Git/bin/bash.exe"), path.join(process.env.ProgramFiles, "Git/usr/bin/bash.exe")].find(fs.existsSync)
  : "bash";
const available = bash && spawnSync(bash, ["--version"]).status === 0;
const posix = file => file.replaceAll("\\", "/").replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);

for (const scenario of ["allowed", "path", "incomplete", "head", "fork", "hosted", "merge-failed"]) {
  test(`merge shell: ${scenario}`, t => {
    if (!available) { t.skip("Git Bash is unavailable; cannot execute trusted merge shell"); return; }
    const dir = fs.mkdtempSync(path.join(scratch, "merge-"));
    try {
      const event = { workflow_run: { pull_requests: scenario === "fork" ? [] : [{ number: 1 }],
        head_repository: { full_name: "fork/index" }, head_branch: "change" } };
      fs.writeFileSync(path.join(dir, "event.json"), JSON.stringify(event));
      fs.writeFileSync(path.join(dir, "gh"), '#!/usr/bin/env bash\nexec node "$MOCK_GH" "$@"\n', { mode: 0o755 });
      fs.writeFileSync(path.join(dir, "gh.cjs"), `
        const fs = require("node:fs");
        const args = process.argv.slice(2), scenario = process.env.SCENARIO;
        fs.appendFileSync(process.env.MOCK_LOG, JSON.stringify(args) + "\\n");
        if (args.includes("--slurp") && (args.includes("--jq") || args.includes("--template"))) process.exit(9);
        if (args[0] === "api") {
          const endpoint = args.find(arg => arg.startsWith("repos/"));
          if (endpoint.includes("/contents/routes.json?ref=")) {
            console.log(JSON.stringify({signed:{apps:{game:scenario === "hosted" ? {metadata_url:"https://example.test/"} : {}}}}));
          } else if (endpoint.endsWith("/files?per_page=100")) {
            console.log(JSON.stringify([[{ filename: scenario === "path" ? ".github/workflows/verify-pr.yml" : "apps/game/store.json" }], []]));
          } else if (endpoint.endsWith("/pulls/1")) {
            console.log(JSON.stringify({state:"open",head:{sha:scenario === "head" ? "changed" : "verified"},
              base:{ref:"main",repo:{full_name:"owner/index"}},changed_files:scenario === "incomplete" ? 2 : 1}));
          } else if (endpoint.endsWith("/pulls")) {
            console.log(JSON.stringify([[{number:1,head:{sha:"verified",repo:{full_name:"fork/index"}}}]]));
          } else process.exit(8);
        } else if (args[0] === "pr" && args[1] === "merge") {
          if (scenario === "merge-failed") process.exit(7);
        } else if (!(args[0] === "workflow" && args[1] === "run")) process.exit(8);
      `);
      const log = path.join(dir, "calls.jsonl");
      const result = spawnSync(bash, ["-c", 'export PATH="$MOCK_BIN:$PATH"; bash scripts/merge-pr.sh'], {
        cwd: root, encoding: "utf8", env: { ...process.env, MOCK_BIN: posix(dir), MOCK_GH: path.join(dir, "gh.cjs"),
          MOCK_LOG: log, SCENARIO: scenario, VERIFIED_SHA: "verified", DEFAULT_BRANCH: "main", REPO: "owner/index",
          GITHUB_EVENT_PATH: posix(path.join(dir, "event.json")), RUNNER_TEMP: posix(dir) },
      });
      assert.equal(result.status, scenario === "merge-failed" ? 7 : 0, result.stderr);
      const calls = fs.readFileSync(log, "utf8").trim().split("\n").map(JSON.parse);
      const merged = calls.find(args => args[0] === "pr");
      const dispatched = calls.find(args => args[0] === "workflow");
      if (["allowed", "fork", "merge-failed"].includes(scenario)) {
        assert.deepEqual(merged, ["pr", "merge", "1", "--squash", "--match-head-commit", "verified", "--repo", "owner/index"]);
      } else assert.equal(merged, undefined);
      if (["allowed", "fork"].includes(scenario)) {
        assert.deepEqual(dispatched, ["workflow", "run", "snapshot.yml", "--ref", "main", "--repo", "owner/index"]);
        assert.ok(calls.indexOf(dispatched) > calls.indexOf(merged));
      } else assert.equal(dispatched, undefined);
      if (scenario === "path") assert.match(result.stdout, /Maintainer merge required for path/);
      if (scenario === "incomplete") assert.match(result.stdout, /incomplete PR file list/);
      if (scenario === "head") assert.match(result.stdout, /head, state, or base/);
      if (scenario === "hosted") assert.match(result.stdout, /developer-hosted metadata/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
}
