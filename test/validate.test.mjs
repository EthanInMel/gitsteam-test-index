import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
const dir = path.resolve(import.meta.dirname, "..");
const fixture = path.join(dir, "test/fixtures/index");
const scratch = path.join(dir, "test/.tmp");
fs.mkdirSync(scratch, { recursive: true });
test("example store validates", () => {
  const r = spawnSync(
    process.execPath,
    [path.join(dir, "scripts/validate-store.mjs"), fixture],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stderr);
});
test("invalid store is rejected", () => {
  const tmp = fs.mkdtempSync(path.join(scratch, "store-test-"));
  fs.cpSync(fixture, tmp, { recursive: true });
  const p = path.join(tmp, "apps/example-game/store.json");
  const v = JSON.parse(fs.readFileSync(p));
  v.cover.url = "http://bad";
  fs.writeFileSync(p, JSON.stringify(v));
  const r = spawnSync(
    process.execPath,
    [path.join(dir, "scripts/validate-store.mjs"), tmp],
    { encoding: "utf8" },
  );
  assert.notEqual(r.status, 0);
  fs.rmSync(tmp, { recursive: true, force: true });
});
