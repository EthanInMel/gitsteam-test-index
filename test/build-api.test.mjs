import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
const dir = path.resolve(import.meta.dirname, "..");
const fixture = path.join(dir, "test/fixtures/index");
const scratch = path.join(dir, "test/.tmp");
fs.mkdirSync(scratch, { recursive: true });
const build = path.join(dir, "scripts/build-api.mjs");
test("build is deterministic and paginated", () => {
  const a = fs.mkdtempSync(path.join(scratch, "api-a-"));
  const b = fs.mkdtempSync(path.join(scratch, "api-b-"));
  for (const x of [a, b]) {
    fs.cpSync(fixture, path.join(x, "index"), { recursive: true });
    const base = path.join(x, "index");
    const r = spawnSync(
      process.execPath,
      [build, "--index", base, "--out", path.join(base, "dist")],
      { encoding: "utf8" },
    );
    assert.equal(r.status, 0, r.stderr);
  }
  const files = (root) => {
    const out = [];
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (!p.includes("node_modules"))
          out.push([path.relative(root, p), fs.readFileSync(p)]);
      }
    };
    walk(root);
    return out;
  };
  assert.deepEqual(
    files(path.join(a, "index", "dist")),
    files(path.join(b, "index", "dist")),
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(a, "index", "dist/api/v1/index.json")))
      .pages,
    1,
  );
  fs.rmSync(a, { recursive: true, force: true });
  fs.rmSync(b, { recursive: true, force: true });
});

test("removing a route delists retained app files", () => {
  const temp = fs.mkdtempSync(path.join(scratch, "delist-"));
  try {
    fs.cpSync(fixture, temp, {recursive: true});
    const routes = JSON.parse(fs.readFileSync(path.join(temp, "routes.json"), "utf8"));
    routes.signed.apps = {};
    fs.writeFileSync(path.join(temp, "routes.json"), JSON.stringify(routes));
    const result = spawnSync(process.execPath, [build, "--index", temp], {encoding: "utf8"});
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(fs.readFileSync(path.join(temp, "dist/api/v1/apps/page-1.json"))).total, 0);
    assert.equal(fs.existsSync(path.join(temp, "dist/apps/example-game/targets.json")), false);
  } finally { fs.rmSync(temp, {recursive: true, force: true}); }
});
