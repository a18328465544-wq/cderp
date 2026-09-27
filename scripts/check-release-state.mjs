import { execFileSync } from "node:child_process";

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

const status = git("status", "--porcelain", "--untracked-files=all");
const commit = git("rev-parse", "HEAD");
const branch = git("branch", "--show-current") || "(detached HEAD)";
const version = execFileSync("node", ["-e", "process.stdout.write(require('./package.json').version)"], { encoding: "utf8" }).trim();
const forbiddenTrackedFiles = [".env", ".env.production", "data/app-state.json"]
  .filter((file) => {
    try {
      git("ls-files", "--error-unmatch", file);
      return true;
    } catch {
      return false;
    }
  });

console.log(`Release candidate: v${version} ${commit.slice(0, 12)} on ${branch}`);
if (forbiddenTrackedFiles.length) {
  console.error(`FAIL: sensitive runtime files are tracked: ${forbiddenTrackedFiles.join(", ")}`);
  process.exitCode = 1;
}
if (status) {
  console.error("FAIL: working tree is not clean; commit or deliberately review all release files before deployment.");
  console.error(status);
  process.exitCode = 1;
} else if (!forbiddenTrackedFiles.length) {
  console.log("PASS: clean, traceable release state with no tracked runtime secrets.");
}
