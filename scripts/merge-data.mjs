import fs from "node:fs";
const [mode, file, ...args] = process.argv.slice(2);
const data = JSON.parse(fs.readFileSync(file, "utf8"));
switch (mode) {
  case "number": console.log(data.workflow_run.pull_requests?.[0]?.number ?? ""); break;
  case "head-repo": console.log(data.workflow_run.head_repository?.full_name ?? ""); break;
  case "head-branch": console.log(data.workflow_run.head_branch ?? ""); break;
  case "candidate":
    console.log(data.flat().find(pr => pr.head.sha === args[0] && pr.head.repo.full_name === args[1])?.number ?? "");
    break;
  case "matches":
    process.exitCode = data.state === "open" && data.head.sha === args[0]
      && data.base.ref === args[1] && data.base.repo.full_name === args[2] ? 0 : 1;
    break;
  case "flatten":
    if (!Array.isArray(data) || !data.every(Array.isArray)) throw new Error("Invalid paginated file list");
    console.log(JSON.stringify(data.flat())); break;
  case "count": console.log(data.length); break;
  case "changed": console.log(data.changed_files); break;
  default: throw new Error("Unknown merge data operation");
}
