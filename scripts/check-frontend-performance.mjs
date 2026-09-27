import {promises as fs} from "node:fs";
import path from "node:path";
import {gzipSync} from "node:zlib";

const root = process.cwd();
const distAssets = path.join(root, "dist", "assets");
const entryBudget = {raw: 450_000, gzip: 140_000};

async function filesWithExtension(directory, extension) {
  const entries = await fs.readdir(directory, {withFileTypes: true});
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => entry.name);
}

function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

const jsFiles = await filesWithExtension(distAssets, ".js");
if (!jsFiles.length) {
  throw new Error("未找到 dist/assets/*.js，请先运行 npm run build:web。");
}

const entryName = jsFiles.find((name) => /^index-[^/]+\.js$/.test(name));
if (!entryName) throw new Error("未找到 Vite 入口 chunk（index-*.js）。");

const stats = [];
for (const name of jsFiles) {
  const buffer = await fs.readFile(path.join(distAssets, name));
  stats.push({name, raw: buffer.byteLength, gzip: gzipSync(buffer).byteLength});
}
const entry = stats.find((item) => item.name === entryName);
console.log(`入口 ${entry.name}: ${kb(entry.raw)} raw / ${kb(entry.gzip)} gzip`);
if (entry.raw > entryBudget.raw || entry.gzip > entryBudget.gzip) {
  throw new Error(`入口 JS 超出预算：raw ≤ ${kb(entryBudget.raw)}、gzip ≤ ${kb(entryBudget.gzip)}。`);
}

console.log("最大 JS chunk：");
for (const item of stats.sort((a, b) => b.raw - a.raw).slice(0, 8)) {
  console.log(`  ${item.name}: ${kb(item.raw)} raw / ${kb(item.gzip)} gzip`);
}

const cacheableChunkFamilies = [
  {label: "charts", prefixes: ["vendor-charts-", "recharts-"]},
  {label: "vendor-date", prefixes: ["vendor-date-"]},
  {label: "vendor-base-ui", prefixes: ["vendor-base-ui-"]},
];
for (const family of cacheableChunkFamilies) {
  if (!stats.some((item) => family.prefixes.some((prefix) => item.name.startsWith(prefix)))) {
    throw new Error(`缺少可独立缓存的拆包 chunk：${family.label}`);
  }
}

const indexHtml = await fs.readFile(path.join(root, "dist", "index.html"), "utf8");
const chartChunk = stats.find((item) => ["vendor-charts-", "recharts-"].some((prefix) => item.name.startsWith(prefix)));
const modulepreloadLines = indexHtml.split("\n").filter((line) => line.includes("modulepreload"));
if (chartChunk && modulepreloadLines.some((line) => line.includes(chartChunk.name))) {
  throw new Error(`图表 chunk 不应进入入口 modulepreload：${chartChunk.name}`);
}

const pasteParser = await fs.readFile(path.join(root, "src/features/purchase/utils/parse-purchase-paste.ts"), "utf8");
if (!pasteParser.includes("PURCHASE_PASTE_MAX_TEXT_LENGTH") || !pasteParser.includes("PURCHASE_PASTE_MAX_ROWS")) {
  throw new Error("批量粘贴解析器缺少文本长度或行数上限。");
}

console.log("性能预算检查通过：首屏拆包、批量粘贴上限和缓存 chunk 均存在。");
