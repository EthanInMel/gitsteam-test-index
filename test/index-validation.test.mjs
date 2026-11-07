import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const dir = path.resolve(import.meta.dirname, "..");
const validator = path.join(dir, "scripts", "validate-store.mjs");
const builder = path.join(dir, "scripts", "build-api.mjs");

function copyExample() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gitsteam-index-"));
  fs.cpSync(dir, root, { recursive: true });
  fs.rmSync(path.join(root, "dist"), { recursive: true, force: true });
  return root;
}

function validate(root) {
  return spawnSync(process.execPath, [validator, root], { encoding: "utf8" });
}

test("validate accepts the example store", () => {
  const root = copyExample();
  assert.equal(validate(root).status, 0);
  fs.rmSync(root, { recursive: true, force: true });
});

test("validate rejects missing fields and invalid media URLs", () => {
  const root = copyExample();
  const storePath = path.join(root, "apps", "example-game", "store.json");
  const store = JSON.parse(fs.readFileSync(storePath, "utf8"));
  delete store.developer;
  store.screenshots[0].url = "http://insecure.test/image.png";
  fs.writeFileSync(storePath, JSON.stringify(store));
  assert.notEqual(validate(root).status, 0);
  fs.rmSync(root, { recursive: true, force: true });
});

test("validate rejects oversized descriptions", () => {
  const root = copyExample();
  fs.writeFileSync(
    path.join(root, "apps", "example-game", "description.md"),
    "x".repeat(64 * 1024 + 1),
  );
  assert.notEqual(validate(root).status, 0);
  fs.rmSync(root, { recursive: true, force: true });
});

test("build-api groups tags and paginates after 50 apps", () => {
  const root = copyExample();
  const example = path.join(root, "apps", "example-game");
  const source = JSON.parse(
    fs.readFileSync(path.join(example, "store.json"), "utf8"),
  );
  for (let index = 1; index <= 54; index += 1) {
    const id = `game-${String(index).padStart(2, "0")}`;
    const app = path.join(root, "apps", id);
    fs.cpSync(example, app, { recursive: true });
    const store = {
      ...source,
      title: { en: `Game ${index}` },
      tags: ["action", index % 2 ? "coop" : "rpg"],
    };
    fs.writeFileSync(path.join(app, "store.json"), JSON.stringify(store));
  }
  const out = path.join(root, "dist");
  const built = spawnSync(
    process.execPath,
    [builder, "--index", root, "--out", out],
    { encoding: "utf8" },
  );
  assert.equal(built.status, 0, built.stderr);
  const index = JSON.parse(
    fs.readFileSync(path.join(out, "api", "v1", "index.json")),
  );
  assert.equal(index.total, 55);
  assert.equal(index.pages, 2);
  assert.equal(
    JSON.parse(
      fs.readFileSync(path.join(out, "api", "v1", "apps", "page-2.json")),
    ).apps.length,
    5,
  );
  assert.deepEqual(
    JSON.parse(
      fs.readFileSync(path.join(out, "api", "v1", "tags", "action.json")),
    ).apps.length,
    55,
  );
  fs.rmSync(root, { recursive: true, force: true });
});
