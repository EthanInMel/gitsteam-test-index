import fs from "node:fs";
import { pathToFileURL } from "node:url";

// Inspect the complete PR diff, including both sides of a rename.
export function checkPrFiles(files, registries = []) {
  if (!Array.isArray(files) || files.length === 0) {
    return { allowed: false, reason: "The PR file list is empty or invalid." };
  }
  const apps = new Set();
  for (const file of files) {
    const paths = typeof file === "string"
      ? [file]
      : [file?.filename, ...(file?.previous_filename ? [file.previous_filename] : [])];
    for (const name of paths) {
      const match = typeof name === "string"
        && /^apps\/([^/]+)\/(store\.json|description\.md|targets\.json)$/.exec(name);
      if (!match || match[1] === "." || match[1] === ".." || /[\\\x00-\x1f\x7f]/.test(name)) {
        return { allowed: false, reason: `Maintainer merge required for path: ${JSON.stringify(name)}` };
      }
      apps.add(match[1]);
      if (registries.some(routes => routes?.signed?.apps?.[match[1]]?.metadata_url)) {
        return { allowed: false, reason: `Maintainer merge required: ${match[1]} uses developer-hosted metadata.` };
      }
    }
  }
  if (apps.size !== 1) {
    return { allowed: false, reason: "Maintainer merge required: the PR changes multiple applications." };
  }
  return { allowed: true, reason: `Allowed application metadata changes for ${[...apps][0]}.` };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const routes = JSON.parse(fs.readFileSync(process.argv[3] ?? "routes.json", "utf8"));
    const result = checkPrFiles(JSON.parse(fs.readFileSync(process.argv[2], "utf8")), [routes]);
    console.log(result.reason);
    process.exitCode = result.allowed ? 0 : 1;
  } catch (error) {
    console.error(`Cannot inspect PR files: ${error.message}`);
    process.exitCode = 1;
  }
}
