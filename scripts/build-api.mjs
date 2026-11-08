#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const at = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const root = at("--index", process.cwd());
const out = at("--out", path.join(root, "dist"));
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
};
const copy = (src, dst) => {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
};
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const file of ["root.json", "routes.json"])
  if (fs.existsSync(path.join(root, file)))
    copy(path.join(root, file), path.join(out, file));
const appsRoot = path.join(root, "apps");
const apps = fs.existsSync(appsRoot)
  ? fs
      .readdirSync(appsRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
  : [];
const records = [];
const tags = new Map();
for (const app of apps) {
  const dir = path.join(appsRoot, app);
  const storePath = path.join(dir, "store.json");
  if (!fs.existsSync(storePath)) continue;
  const store = JSON.parse(fs.readFileSync(storePath, "utf8"));
  const descriptionPath = path.join(dir, "description.md");
  const description = fs.existsSync(descriptionPath)
    ? fs.readFileSync(descriptionPath, "utf8")
    : "";
  const links = {};
  for (const name of ["targets.json", "snapshot.json", "timestamp.json"])
    if (fs.existsSync(path.join(dir, name)))
      links[name.slice(0, -5)] = `../../../apps/${app}/${name}`;
  records.push({ app_id: app, store, description, metadata: links });
  for (const tag of store.tags ?? []) {
    if (!tags.has(tag)) tags.set(tag, []);
    tags.get(tag).push(app);
  }
  for (const name of [
    "store.json",
    "description.md",
    "targets.json",
    "snapshot.json",
    "timestamp.json",
  ])
    if (fs.existsSync(path.join(dir, name)))
      copy(path.join(dir, name), path.join(out, "apps", app, name));
}
const pages = Math.max(1, Math.ceil(records.length / 50));
for (let n = 0; n < pages; n++)
  writeJson(path.join(out, "api/v1/apps", `page-${n + 1}.json`), {
    page: n + 1,
    per_page: 50,
    total: records.length,
    apps: records
      .slice(n * 50, n * 50 + 50)
      .map((r) => ({ app_id: r.app_id, store: r.store })),
  });
for (const r of records)
  writeJson(path.join(out, "api/v1/apps", `${r.app_id}.json`), r);
for (const [tag, ids] of [...tags.entries()].sort(([a], [b]) =>
  a.localeCompare(b),
))
  writeJson(path.join(out, "api/v1/tags", `${tag}.json`), {
    tag,
    apps: [...ids].sort(),
  });
writeJson(path.join(out, "api/v1/index.json"), {
  total: records.length,
  pages,
  per_page: 50,
  generated_at: "1970-01-01T00:00:00.000Z",
  routes: "../../routes.json",
});
console.log(`built ${records.length} app(s) into ${out}`);
