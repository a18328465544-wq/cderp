import fs from "node:fs";
import path from "node:path";
import {collectJsxElements} from "./architecture-utils.mjs";

const root = process.cwd();
const sourceRoots = [
  "src/app",
  "src/components/ui",
  "src/components/common",
  "src/components/domain",
  "src/features",
  "src/services",
  "src/hooks",
  "src/stores",
  "src/types",
  "src/config",
  "src/lib",
].map((relative) => path.join(root, relative));

function collectFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(file);
    return /\.(ts|tsx)$/.test(entry.name) ? [file] : [];
  });
}

function relative(file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function layerOf(file) {
  const name = relative(file);
  if (name.startsWith("src/components/ui/")) return {name: "ui"};
  if (name.startsWith("src/components/common/")) return {name: "common"};
  if (name.startsWith("src/components/domain/")) return {name: "domain"};
  if (name.startsWith("src/features/")) return {name: "feature", module: name.split("/")[2]};
  if (name.startsWith("src/services/")) return {name: "services"};
  if (name.startsWith("src/app/")) return {name: "app"};
  if (name.startsWith("src/hooks/")) return {name: "hooks"};
  if (name.startsWith("src/stores/")) return {name: "stores"};
  if (name.startsWith("src/types/")) return {name: "types"};
  if (name.startsWith("src/config/")) return {name: "config"};
  if (name.startsWith("src/lib/")) return {name: "lib"};
  return {name: "other"};
}

function resolveImport(file, specifier) {
  if (specifier.startsWith("@/")) return path.join(root, specifier.slice(2));
  if (specifier.startsWith(".")) return path.resolve(path.dirname(file), specifier);
  return null;
}

function importSpecifiers(source) {
  const specs = [];
  const pattern = /(?:import|export)(?:[\s\S]*?from\s*)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of source.matchAll(pattern)) specs.push(match[1] || match[2]);
  return specs;
}

function isComponentsRootLegacyTarget(target) {
  if (!target) return false;
  const name = relative(target);
  if (!name.startsWith("src/components/")) return false;
  const segment = name.split("/")[2];
  return !["ui", "common", "domain"].includes(segment);
}

const files = sourceRoots.flatMap(collectFiles).filter((file, index, all) => all.indexOf(file) === index);
const productionFiles = files.filter((file) => !/\.test\.(ts|tsx)$/.test(file));
const failures = [];
const warnings = [];

// Recharts is an interaction-heavy optional runtime. Keep its only runtime
// import behind the shared synchronous adapter so feature pages cannot couple
// themselves to the vendor package. The adapter is split into a cacheable
// vendor chunk by Vite; React.lazy is intentionally not used for Recharts
// forwardRef primitives. Type-only imports in the shared chart contract are
// intentionally allowed.
for (const file of productionFiles) {
  const fileName = relative(file);
  if (fileName === "src/components/ui/recharts.tsx") continue;
  const source = fs.readFileSync(file, "utf8");
  // Keep the statement boundary in the pattern. The previous broad replace
  // could start at an unrelated `import type` and consume a later runtime
  // Recharts import, allowing a feature to bypass the lazy-loading contract.
  const runtimeRechartsImport = /import\s+(?!type\b)(?:(?!;)[\s\S])*?from\s+["']recharts["']/;
  if (runtimeRechartsImport.test(source)) {
    fail(file, "运行时代码不得直接导入 recharts，请通过 src/components/ui/recharts.tsx 使用共享图表适配器。");
  }
}

// Keep Sonner behind the semantic notification facade. The toaster host is
// the only UI integration point; business code should depend on notify() so
// changing the notification provider does not require a page-by-page rewrite.
const allowedSonnerFiles = new Set([
  "src/utils/notification.ts",
  "src/components/common/NotificationToaster.tsx",
]);
for (const file of collectFiles(path.join(root, "src")).filter((candidate) => !/\.test\.(ts|tsx)$/.test(candidate))) {
  const source = fs.readFileSync(file, "utf8");
  if (/from\s+["']sonner["']/.test(source) && !allowedSonnerFiles.has(relative(file))) {
    fail(file, "业务代码不得直接依赖 sonner，请使用 src/utils/notification.ts 导出的 notify API。");
  }
}

const pageFramePattern = /Erp(?:List|Transaction|Warehouse|Finance|Crm|Analytics|Detail|Settings|Dashboard)PageFrame|ErpPageFrame|FinanceEntryPageLayout/;
for (const file of productionFiles.filter((candidate) => /\/pages\/[^/]+\.tsx$/.test(relative(candidate)) && relative(candidate).startsWith("src/features/"))) {
  const source = fs.readFileSync(file, "utf8");
  const fileName = relative(file);
  if (!pageFramePattern.test(source)) fail(file, "标准 Feature 页面必须复用统一 PageFrame，不得新增平行页面 Shell。");
  if (/\bDashboardShell\b/.test(source)) fail(file, "正式 Feature 页面不得使用 DashboardShell，请使用 ErpDashboardPageFrame。");
  const filtersOutsideToolbar = collectJsxElements(source)
    .filter((element) => element.name === "ErpFilterBar")
    .filter((element) => !element.ancestors.includes("ErpPageToolbar"));
  if (filtersOutsideToolbar.length) fail(file, "ErpFilterBar 必须放在 ErpPageToolbar 语义区域中。");
  if (/export\s+(?:function|const)\s+\w*(?:Shell|PageShell|Frame)\b/.test(source)) fail(file, "业务页面不得定义新的 Shell/Frame 组件；请扩展白名单 Frame 或使用现有场景 Frame。");
  if (/mx-auto[\s\S]{0,120}space-y-(?:6|8)|space-y-(?:6|8)[\s\S]{0,120}mx-auto/.test(source) && !pageFramePattern.test(source)) {
    fail(file, "页面根布局不得使用过大的自定义 vertical rhythm，请使用 PageFrame density。");
  }
}

const quickStatusPath = path.join(root, "src/components/common/ErpQuickStatus.tsx");
if (fs.existsSync(quickStatusPath)) {
  const quickStatusSource = fs.readFileSync(quickStatusPath, "utf8");
  if (/status\??\s*:\s*QuickStatusTone|onClick\??\s*:\s*\(\)\s*=>/.test(quickStatusSource)) {
    fail(quickStatusPath, "QuickStatus 只能暴露 tone/action，禁止恢复 deprecated status/onClick。");
  }
}

function fail(file, message) {
  failures.push(`${relative(file)}: ${message}`);
}

for (const file of productionFiles) {
  const source = fs.readFileSync(file, "utf8");
  const layer = layerOf(file);
  const specs = importSpecifiers(source);

  if (/\bany\b/.test(source)) fail(file, "新增业务代码不得使用 any，请定义明确的 DTO 或 Domain 类型");
  if (/\bfetch\s*\(/.test(source) && layer.name === "feature") fail(file, "Feature 页面不得直接调用 fetch，请使用 services/api Endpoint");
  if (/["'`]\/api\//.test(source) && layer.name === "feature") fail(file, "Feature 页面不得拼接 API 地址，请使用 services/api Endpoint");
  if (layer.name === "feature") {
    for (const match of source.matchAll(/queryKey\s*:\s*([A-Za-z_$][\w$]*|\[)/g)) {
      if (match[1] !== "queryKeys") fail(file, "Query Key 必须集中在 queryKeys，不得在页面内写匿名 key");
    }
  }
  if (/(?:#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\s*\()/.test(source)) fail(file, "业务 TypeScript/TSX 不得直接写颜色值，请使用 Design Token");

  for (const specifier of specs) {
    const target = resolveImport(file, specifier);
    const targetLayer = target ? layerOf(target) : {name: "package"};
    const targetName = target ? relative(target) : specifier;
    const isDto = targetName.includes("src/services/api/dto/") || specifier.includes("services/api/dto/");
    const isMock = /(?:^|[./_-])mock(?:[./_-]|$)/i.test(specifier) || specifier.includes("src/data/mockData");
    const isLegacy = specifier.includes("/legacy/") || isComponentsRootLegacyTarget(target);

    if (layer.name === "ui" && ["common", "domain", "feature", "services", "stores", "app"].includes(targetLayer.name)) {
      fail(file, `ui 不得依赖 ${targetLayer.name}（${specifier}）`);
    }
    if (layer.name === "common" && targetLayer.name === "feature") fail(file, `common 不得依赖 Feature（${specifier}）`);
    if (layer.name === "domain" && ["feature", "services"].includes(targetLayer.name)) fail(file, `domain 不得依赖 ${targetLayer.name}（${specifier}）`);
    if (layer.name === "feature" && targetLayer.name === "feature" && targetLayer.module !== layer.module) fail(file, `Feature 不得深层依赖其他 Feature（${specifier}）`);
    if (["feature", "domain", "common"].includes(layer.name) && isDto) fail(file, `页面和业务组件不得直接消费 API DTO（${specifier}）`);
    if (isLegacy) fail(file, `正式 V2 代码不得导入 legacy 组件或兼容文件（${specifier}）`);
    if (layer.name === "feature" && isMock) fail(file, `正式 Feature 不得导入 Mock 数据（${specifier}）`);
  }
}

const routerFile = path.join(root, "src/app/router.tsx");
if (fs.existsSync(routerFile)) {
  const routerSource = fs.readFileSync(routerFile, "utf8");
  const staticFeatureImports = routerSource.split("\n").filter((line) => line.trimStart().startsWith("import ") && line.includes("@/src/features/"));
  if (staticFeatureImports.length) fail(routerFile, "Router 不得静态导入业务页面，必须保持路由级分包");

  const dynamicFeaturePageImports = routerSource.split("\n").filter((line) => line.includes("import(\"@/src/features/") && line.includes("/pages/"));
  const sharedPageLoaderImport = routerSource.includes('import {pageLoaders} from "./pageLoaders"');
  const sharedPageComponentImport = routerSource.includes('import {pageComponents} from "./pageComponents"');
  if (!dynamicFeaturePageImports.length && !sharedPageLoaderImport && !sharedPageComponentImport) fail(routerFile, "Router 缺少按路由动态加载的业务页面");
  if (dynamicFeaturePageImports.some((line) => !line.includes("lazyRouteComponent("))) {
    fail(routerFile, "业务页面动态导入必须统一使用 lazyRouteComponent");
  }
  if (sharedPageLoaderImport) {
    const pageLoaderFile = path.join(root, "src/app/pageLoaders.ts");
    const pageLoaderSource = fs.existsSync(pageLoaderFile) ? fs.readFileSync(pageLoaderFile, "utf8") : "";
    const dynamicLoaderImports = pageLoaderSource.split("\n").filter((line) => line.includes("import(\"@/src/features/") && line.includes("/pages/"));
    if (!dynamicLoaderImports.length) fail(pageLoaderFile, "共享 pageLoaders 缺少按页面分包的动态 import");
  }
  if (sharedPageComponentImport) {
    const pageComponentFile = path.join(root, "src/app/pageComponents.ts");
    const pageComponentSource = fs.existsSync(pageComponentFile) ? fs.readFileSync(pageComponentFile, "utf8") : "";
    if (!pageComponentSource.includes('import {pageLoaders} from "./pageLoaders"')) fail(pageComponentFile, "共享 pageComponents 必须复用 pageLoaders");
    if (!pageComponentSource.includes("lazyRouteComponent(")) fail(pageComponentFile, "共享 pageComponents 必须使用 lazyRouteComponent");
  }
  if (!routerSource.includes("defaultPendingComponent: RouteLoadingState")) {
    fail(routerFile, "Router 必须保留统一的路由加载状态");
  }
}

if (failures.length) {
  console.error(`Frontend V2 规则检查失败（${failures.length} 项）：`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

if (warnings.length) warnings.forEach((warning) => console.warn(`⚠ ${warning}`));
console.log(`Frontend V2 规则检查通过：${productionFiles.length} 个正式源文件，无边界违规。`);
