#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root =
  process.argv[2] && !process.argv[2].startsWith("-")
    ? process.argv[2]
    : process.cwd();
const maxDescriptionBytes = 64 * 1024;
const fail = (message) => {
  console.error(`validate-store: ${message}`);
  process.exitCode = 1;
};
const isObject = (v) => v && typeof v === "object" && !Array.isArray(v);
const isHttps = (v) => typeof v === "string" && v.startsWith("https://");
const isHex64 = (v) => typeof v === "string" && /^[0-9a-f]{64}$/i.test(v);
const mediaOk = (v, label) =>
  (isObject(v) &&
    isHttps(v.url) &&
    isHex64(v.blake3) &&
    Number.isInteger(v.width) &&
    v.width > 0 &&
    Number.isInteger(v.height) &&
    v.height > 0) ||
  fail(
    `${label} must contain https url, 64-char blake3, positive integer width/height`,
  );
const jsonFiles = [];
const appsDir = path.join(root, "apps");
if (!fs.existsSync(appsDir)) fail(`missing ${appsDir}`);
else
  for (const app of fs
    .readdirSync(appsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()) {
    const dir = path.join(appsDir, app);
    const storePath = path.join(dir, "store.json");
    if (!fs.existsSync(storePath)) {
      fail(`${app}: missing store.json`);
      continue;
    }
    let store;
    try {
      store = JSON.parse(fs.readFileSync(storePath, "utf8"));
    } catch (e) {
      fail(`${app}: invalid JSON (${e.message})`);
      continue;
    }
    jsonFiles.push(storePath);
    const required = [
      "title",
      "summary",
      "tags",
      "screenshots",
      "cover",
      "requirements",
      "paid",
      "price_display",
      "developer",
      "homepage",
      "platforms",
    ];
    for (const key of required)
      if (!(key in store)) fail(`${app}: missing ${key}`);
    for (const key of ["title", "summary"])
      if (
        !isObject(store[key]) ||
        !Object.values(store[key]).every(
          (v) => typeof v === "string" && v.length > 0,
        )
      )
        fail(`${app}: ${key} must be a non-empty language map`);
    if (
      !Array.isArray(store.tags) ||
      store.tags.length < 1 ||
      !store.tags.every(
        (v) => typeof v === "string" && /^[a-z0-9][a-z0-9-]{0,31}$/.test(v),
      )
    )
      fail(`${app}: invalid tags`);
    if (
      !Array.isArray(store.screenshots) ||
      !store.screenshots.every((v, i) => mediaOk(v, `${app}.screenshots[${i}]`))
    )
      fail(`${app}: invalid screenshots`);
    mediaOk(store.cover, `${app}.cover`);
    if (
      !isObject(store.requirements) ||
      !Object.values(store.requirements).every((v) => typeof v === "string")
    )
      fail(`${app}: invalid requirements`);
    if (
      typeof store.paid !== "boolean" ||
      typeof store.price_display !== "string" ||
      typeof store.developer !== "string" ||
      !isHttps(store.homepage)
    )
      fail(`${app}: invalid paid/price/developer/homepage`);
    if (
      !Array.isArray(store.platforms) ||
      !store.platforms.length ||
      !store.platforms.every((v) =>
        ["windows-x64", "linux-x64", "macos-arm64", "macos-x64"].includes(v),
      )
    )
      fail(`${app}: invalid platforms`);
    const desc = path.join(dir, "description.md");
    if (!fs.existsSync(desc)) fail(`${app}: missing description.md`);
    else if (fs.statSync(desc).size > maxDescriptionBytes)
      fail(`${app}: description.md exceeds ${maxDescriptionBytes} bytes`);
  }
if (!process.exitCode)
  console.log(`validated ${jsonFiles.length} store.json file(s)`);
