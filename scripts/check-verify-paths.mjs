import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { checkPrFiles } from "./check-pr-files.mjs";

export function checkVerifyPaths(files, labels = "") {
  if (!Array.isArray(files) || !files.length) return { allowed: false, reason: "Empty PR diff" };
  const routes = files.includes("routes.json");
  if (routes && !labels.split(",").includes("maintainer-approved")) {
    return { allowed: false, reason: "routes.json requires maintainer-approved" };
  }
  const appFiles = files.filter(name => name !== "routes.json");
  return appFiles.length ? checkPrFiles(appFiles) : { allowed: routes, reason: "Maintainer route change" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = execFileSync("git", ["diff", "--name-only", "--no-renames", "-z", process.env.BASE_SHA, "HEAD"], { encoding: "utf8" }).split("\0").filter(Boolean);
  const result = checkVerifyPaths(files, process.env.PR_LABELS);
  console.log(result.reason);
  process.exitCode = result.allowed ? 0 : 1;
}
