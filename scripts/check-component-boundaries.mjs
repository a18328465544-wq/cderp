import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const componentsRoot = path.join(root, "src", "components");
const adapterRoots = [
  path.join(componentsRoot, "common"),
  // UI primitives may own thin third-party adapters such as chart.tsx;
  // feature pages still cannot import adapter-only packages directly.
  path.join(componentsRoot, "ui"),
];
const legacyAdapterFiles = new Set([
  "ui.tsx",
  "DataTable.tsx",
  "TanStackDataTable.tsx",
  "DateRangePicker.tsx",
  "ReportPageLayout.tsx",
]);

// These packages are intentionally not imported by business pages. They are
// allowed only after a shared/ERP adapter owns their API and accessibility.
const adapterOnlyPackages = [
  "@radix-ui/",
  "@base-ui/react",
  "cmdk",
  "react-day-picker",
  "sonner",
];

function collectFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectFiles(full);
    return /\.(tsx|ts)$/.test(entry.name) && !/\.test\.(tsx|ts)$/.test(entry.name) ? [full] : [];
  });
}

function isAdapterFile(file) {
  const relative = path.relative(componentsRoot, file);
  return adapterRoots.some(dir => file.startsWith(`${dir}${path.sep}`)) || legacyAdapterFiles.has(relative);
}

const violations = [];
const legacyImportPattern = /from\s*["'](?:\.\.?\/)+(?:ui|DataTable|TanStackDataTable|DateRangePicker|ReportPageLayout)(?:\.tsx?)?["']/;
const scanRoots = [
  componentsRoot,
  path.join(root, "src", "app"),
  path.join(root, "src", "features"),
];
for (const file of scanRoots.flatMap(collectFiles)) {
  if (isAdapterFile(file)) continue;
  const source = fs.readFileSync(file, "utf8");
  for (const packageName of adapterOnlyPackages) {
    const pattern = new RegExp(`(?:from|import\\s*\\()\\s*[\\\"']${packageName.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}`);
    if (pattern.test(source)) {
      violations.push(`${path.relative(root, file)} -> ${packageName}`);
    }
  }
  if (legacyImportPattern.test(source)) {
    violations.push(`${path.relative(root, file)} -> legacy component adapter (use src/components/ui or src/components/common)`);
  }
}

if (violations.length) {
  console.error("组件边界检查失败：业务页面必须通过 src/components/ui/common/domain 适配层使用交互包和基础组件。");
  violations.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}

console.log("组件边界检查通过：业务页面未直接依赖适配层专用包。");
