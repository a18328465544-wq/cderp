import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import path from "node:path";

/**
 * Lightweight visual contract for the browser smoke suite.
 *
 * The repository intentionally does not commit large PNG baselines. The
 * smoke suite still captures the same desktop/tablet/mobile surfaces, while
 * this check locks their viewport dimensions and SHA-256 fingerprints in a
 * small manifest. A deliberate visual change refreshes the manifest in the
 * same review, making accidental layout drift visible without another test
 * runner or image dependency.
 */
const root = process.cwd();
const artifactDir = path.resolve(root, "output/playwright/browser-smoke");
const manifestPath = path.resolve(root, "scripts/visual-baseline.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const failures = [];

function pngDimensions(buffer) {
  if (buffer.length < 24 || buffer.readUInt32BE(0) !== 0x89504e47 || buffer.readUInt32BE(4) !== 0x0d0a1a0a) return null;
  return {width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20)};
}

for (const [filename, expected] of Object.entries(manifest.screenshots || {})) {
  const file = path.join(artifactDir, filename);
  let buffer;
  try {
    buffer = await readFile(file);
  } catch {
    failures.push(`${filename} 不存在，请先运行 npm run smoke:browser`);
    continue;
  }
  const dimensions = pngDimensions(buffer);
  if (!dimensions) {
    failures.push(`${filename} 不是有效 PNG`);
    continue;
  }
  if (dimensions.width !== expected.width || dimensions.height !== expected.height) {
    failures.push(`${filename} 尺寸 ${dimensions.width}x${dimensions.height}，预期 ${expected.width}x${expected.height}`);
  }
  const hash = createHash("sha256").update(buffer).digest("hex");
  if (expected.sha256 && hash !== expected.sha256) {
    failures.push(`${filename} 视觉指纹发生变化（${hash.slice(0, 12)}…），如为预期改动请更新 scripts/visual-baseline.json`);
  }
}

if (failures.length) {
  console.error(`视觉回归检查失败（${failures.length} 项）：`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`视觉回归检查通过：${Object.keys(manifest.screenshots || {}).length} 个桌面、平板和移动端快照。`);
