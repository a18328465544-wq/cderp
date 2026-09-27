import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testRoots = ["server", "src"];
const testFiles = [];

for (const root of testRoots) {
  const rootPath = path.join(projectRoot, root);
  const entries = await readdir(rootPath, { recursive: true, withFileTypes: true });
  entries.forEach((entry) => {
    if (!entry.isFile() || !/\.test\.tsx?$/.test(entry.name)) return;
    testFiles.push(path.join(entry.parentPath, entry.name));
  });
}

testFiles.sort();
if (!testFiles.length) {
  throw new Error("未发现测试文件");
}

const tsxCli = path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
const child = spawn(process.execPath, [tsxCli, "--test", ...testFiles], {
  cwd: projectRoot,
  stdio: "inherit",
});

child.once("error", (error) => {
  throw error;
});
child.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exitCode = code ?? 1;
});
