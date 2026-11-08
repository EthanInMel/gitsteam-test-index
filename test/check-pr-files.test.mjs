import test from "node:test";
import assert from "node:assert/strict";
import { checkPrFiles } from "../scripts/check-pr-files.mjs";

test("allows only the five metadata files in one application", () => {
  const files = ["store.json", "description.md", "targets.json", "snapshot.json", "timestamp.json"];
  assert.equal(checkPrFiles(files.map(name => ({ filename: `apps/game/${name}` }))).allowed, true);
});

for (const name of ["apps/other/store.json", "routes.json", ".github/workflows/x.yml", "scripts/x.mjs", "schemas/store.schema.json", "root.json", "apps/game/other.json", "apps/game/storeXjson", "apps/../store.json"]) {
  test(`rejects full PR diff containing ${name}`, () => {
    const result = checkPrFiles([{ filename: name }, { filename: "apps/game/store.json" }]);
    assert.equal(result.allowed, false);
    assert.match(result.reason, /Maintainer/);
  });
}

test("rejects empty and malformed lists", () => {
  for (const files of [[], null, {}, [null], [{}]]) {
    assert.equal(checkPrFiles(files).allowed, false);
  }
});

test("checks the old path of renames as well as the new path", () => {
  for (const previous_filename of [".github/workflows/x.yml", "apps/other/store.json"]) {
    assert.equal(checkPrFiles([{ filename: "apps/game/store.json", previous_filename }]).allowed, false);
  }
});
