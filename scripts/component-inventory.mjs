import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dir = path.join(root, "src", "components");
const checkOnly = process.argv.includes("--check");

function collectComponentFiles(directory, prefix = "") {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const full = path.join(directory, entry.name);
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return collectComponentFiles(full, relative);
    return /\.(tsx|ts)$/.test(entry.name) ? [relative] : [];
  });
}

const entries = collectComponentFiles(dir);

const testPattern = /\.test\.(tsx|ts)$/;
const utilityPattern = /(?:Utils|Types|Schema)\.(tsx|ts)$|^use[A-Z].*\.(tsx|ts)$/;
const sharedFiles = new Set([
  "ui.tsx",
  "DataTable.tsx",
  "TanStackDataTable.tsx",
  "DateRangePicker.tsx",
  "DateRangePickerCalendar.tsx",
  "ReportPageLayout.tsx",
]);
const catalogFiles = new Set(["index.ts"]);
const domainPatterns = [
  ["dashboard", /^(Dashboard|AiInsightsCenter|OneERPCopilot|dashboardMetrics)/],
  ["inventory", /^(Product|Inventory|Inspection|ScanInput|CameraScanner|EntityImage|inventoryDetailWorkspaceState)/],
  ["purchase", /^(Purchase|Assembly|purchaseSourceOptions)/],
  ["sales", /^(Sales|Invoice|InvoiceList|Return|Aftersales)/],
  ["finance", /^(Finance|Settlement|CustomerFunds|NonOperating|SupplierPayables|ProductProfit|Commission|financeTurnover)/],
  ["crm", /^(Crm|QuickCapture|CustomerMatch|Partner|SourceCustomer|ConflictNotice|MissingFieldNotice)/],
  ["system", /^(Admin|ComponentShowcase|Sidebar|Workspace|GlobalSearch|Login|ErrorBoundary|Confirm|IosAlert|OrderEntry|MarketQuote)/],
];

function classify(file) {
  if (testPattern.test(file)) return "test";
  if (catalogFiles.has(file)) return "catalog";
  if (file.startsWith("ui/")) return "ui";
  if (file.startsWith("common/")) return "common";
  if (file.startsWith("domain/")) return "domain";
  if (sharedFiles.has(file)) return "shared";
  if (utilityPattern.test(file)) return "support";
  const base = file.replace(/\.(tsx|ts)$/, "");
  const match = domainPatterns.find(([, pattern]) => pattern.test(base));
  return match?.[0] || "unclassified";
}

const grouped = new Map();
for (const file of entries.sort()) {
  const category = classify(file);
  const list = grouped.get(category) || [];
  list.push(file);
  grouped.set(category, list);
}

const counts = Object.fromEntries([...grouped.entries()].map(([key, files]) => [key, files.length]));
if (checkOnly) {
  console.log(`组件目录检查通过：${entries.length} 个组件文件已归类（${Object.entries(counts).map(([key, count]) => `${key} ${count}`).join("，")}）。`);
} else {
  console.log(JSON.stringify({ root: "src/components", counts, files: Object.fromEntries(grouped) }, null, 2));
}

if (grouped.has("unclassified")) {
  console.error(`组件目录存在 ${grouped.get("unclassified").length} 个未分类文件，请补充 component-inventory.mjs 的域规则。`);
  process.exitCode = 1;
}
