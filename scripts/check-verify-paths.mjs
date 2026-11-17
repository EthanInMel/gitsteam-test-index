import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { checkPrFiles } from "./check-pr-files.mjs";
import fs from "node:fs";

export function checkVerifyPaths(files, labels = "", registries = []) {
  if (!Array.isArray(files) || !files.length) return { allowed: false, reason: "Empty PR diff" };
  // routes.json and the root files (root.json, <N>.root.json) are signed offline.
  const maintainerFile = name => name === "routes.json" || name === "root.json" || /^[1-9][0-9]*\.root\.json$/.test(name);
  const maintained = files.filter(maintainerFile);
  if (maintained.length && !labels.split(",").includes("maintainer-approved")) {
    return { allowed: false, reason: `${maintained.join(", ")} requires maintainer-approved` };
  }
  const appFiles = files.filter(name => !maintainerFile(name));
  if (!appFiles.length) return { allowed: true, reason: "Maintainer route or root change" };
  const paths = checkPrFiles(appFiles);
  if (!paths.allowed) return paths;
  return labels.split(",").includes("maintainer-approved") ? paths : checkPrFiles(appFiles, registries);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = execFileSync("git", ["diff", "--name-only", "--no-renames", "-z", process.env.BASE_SHA, "HEAD"], { encoding: "utf8" }).split("\0").filter(Boolean);
  const registries = ["routes.json", ".base-index/routes.json"].map(file => JSON.parse(fs.readFileSync(file, "utf8")));
  const result = checkVerifyPaths(files, process.env.PR_LABELS, registries);
  console.log(result.reason);
  process.exitCode = result.allowed ? 0 : 1;
}
