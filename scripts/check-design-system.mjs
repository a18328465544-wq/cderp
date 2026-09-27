import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const warnings = [];
const requiredTokens = [
  "--erp-color-canvas",
  "--erp-color-surface",
  "--erp-color-primary",
  "--erp-color-primary-soft",
  "--erp-color-info",
  "--erp-color-info-soft",
  "--erp-color-success",
  "--erp-color-success-soft",
  "--erp-color-warning",
  "--erp-color-warning-soft",
  "--erp-color-danger",
  "--erp-color-danger-soft",
  "--erp-color-income",
  "--erp-color-income-soft",
  "--erp-color-expense",
  "--erp-color-expense-soft",
  "--erp-color-net",
  "--erp-color-risk",
  "--erp-color-risk-soft",
  "--erp-space-4",
  "--erp-radius-xs",
  "--erp-radius-md",
  "--erp-shadow-card",
  "--erp-font-body",
  "--erp-control-height",
  "--erp-quick-status-height",
  "--erp-quick-status-icon-size",
  "--erp-quick-status-gap",
  "--erp-workspace-bar-height",
  "--erp-layer-tab-navigation",
  "--erp-layer-drawer",
  "--erp-layer-content-sticky",
  "--erp-metric-min-width",
  "--erp-chart-primary",
  "--erp-chart-muted",
  "--erp-chart-positive",
  "--erp-chart-warning",
  "--erp-chart-negative",
  "--erp-chart-grid",
  "--erp-chart-axis",
  "--erp-chart-track",
  "--erp-chart-tooltip-bg",
  "--erp-chart-tooltip-border",
  "--erp-chart-stroke-width",
  "--erp-chart-bar-radius",
  "--erp-chart-bar-gap",
  "--erp-chart-area-opacity",
  "--erp-chart-animation-duration",
];

const tokenFile = path.join(root, "src/styles/tokens.css");
const tokenSource = fs.readFileSync(tokenFile, "utf8");
const definedTokens = new Set([...tokenSource.matchAll(/--erp-[a-z0-9-]+\s*:/g)].map((match) => match[0].split(/\s*:/, 1)[0]));
for (const token of requiredTokens) {
  if (!tokenSource.includes(token)) failures.push(`缺少必需 Token：${token}`);
}
if ((tokenSource.match(/:root\s*\{/g) || []).length !== 1) failures.push("tokens.css 必须只有一个 :root 定义，避免出现第二套 Token 来源。");

const globalStylesFile = path.join(root, "src/styles/globals.css");
const globalStylesSource = fs.readFileSync(globalStylesFile, "utf8");
const tabLayerMatch = tokenSource.match(/--erp-layer-tab-navigation\s*:\s*(\d+)/);
const tabLayer = tabLayerMatch ? Number(tabLayerMatch[1]) : NaN;
if (!Number.isFinite(tabLayer)) failures.push("缺少有效的 Tab 导航全局层级值：--erp-layer-tab-navigation");
const drawerLayerMatch = tokenSource.match(/--erp-layer-drawer\s*:\s*(\d+)/);
const drawerLayer = drawerLayerMatch ? Number(drawerLayerMatch[1]) : NaN;
if (!Number.isFinite(drawerLayer)) failures.push("缺少有效的侧边抽屉全局层级值：--erp-layer-drawer");
if (Number.isFinite(tabLayer) && Number.isFinite(drawerLayer) && drawerLayer >= tabLayer) {
  failures.push("Workspace Tab 导航必须保持最高应用层级，侧边抽屉层级应低于 Tab。");
}
if (!globalStylesSource.includes(".erp-tab-navigation")) failures.push("缺少全局 Tab 导航层级规则：.erp-tab-navigation");
if (!globalStylesSource.includes("z-index: var(--erp-layer-tab-navigation)")) failures.push("Tab 导航必须引用 --erp-layer-tab-navigation，禁止局部硬编码层级。");
if (!globalStylesSource.includes(".erp-drawer-viewport") || !globalStylesSource.includes("top: var(--erp-workspace-bar-height)")) failures.push("侧边抽屉必须从 Workspace Bar 底部开始渲染，禁止覆盖 Tab 导航。");

const pageHeaderFile = path.join(root, "src/components/common/ErpPageHeader.tsx");
const pageHeaderSource = fs.readFileSync(pageHeaderFile, "utf8");
for (const prop of ["quickStatus", "dateContent", "actions"]) {
  if (!pageHeaderSource.includes(prop)) failures.push(`ErpPageHeader 缺少统一能力：${prop}`);
}

const quickStatusFile = path.join(root, "src/components/common/ErpQuickStatus.tsx");
const quickStatusSource = fs.readFileSync(quickStatusFile, "utf8");
for (const status of ["neutral", "info", "success", "warning", "danger"]) {
  if (!quickStatusSource.includes(status)) failures.push(`QuickStatus 缺少状态：${status}`);
}
if (!quickStatusSource.includes("maxVisible = 4")) failures.push("QuickStatus 桌面端默认最多展示 4 项的契约缺失。");
if (!quickStatusSource.includes('variant = "compact"')) failures.push("QuickStatus 默认变体必须是 compact。");
if (!quickStatusSource.includes('data-variant="compact"')) failures.push("QuickStatus 缺少 Compact 变体标记，无法进行自动验收。");
if (!quickStatusSource.includes('data-variant="workflow"')) failures.push("QuickStatus 缺少 Workflow 兼容变体标记。");
if (!quickStatusSource.includes("item.tooltip")) failures.push("QuickStatus 缺少 Tooltip 兼容能力。");
if (!quickStatusSource.includes("item.tone")) failures.push("QuickStatus 必须使用统一 tone 语义。");
if (!quickStatusSource.includes("item.action")) failures.push("QuickStatus 必须使用统一 action 语义。");
if (/status\??\s*:\s*QuickStatusTone|onClick\??\s*:\s*\(\)\s*=>/.test(quickStatusSource)) failures.push("QuickStatus 不得保留 deprecated status/onClick API。");
if (!quickStatusSource.includes("maxVisible?: 1 | 2 | 3 | 4")) failures.push("QuickStatus maxVisible 必须限制为 1-4，禁止暴露任意数字。");

const pageFrameFile = path.join(root, "src/components/common/ErpPageFrame.tsx");
const pageFrameSource = fs.existsSync(pageFrameFile) ? fs.readFileSync(pageFrameFile, "utf8") : "";
for (const marker of [
  'data-erp-component="page-frame"',
  'data-erp-region="page-topbar"',
  'data-erp-region="page-identity"',
  'data-erp-region="page-context"',
  'data-erp-region="page-toolbar"',
  'data-erp-region="page-content"',
]) {
  if (!pageFrameSource.includes(marker)) failures.push(`统一 PageFrame 缺少区域标记：${marker}`);
}
const pageFramesSource = fs.readFileSync(path.join(root, "src/components/common/ErpPageFrames.tsx"), "utf8");
if (pageFramesSource.includes("AnalyticsFrame")) failures.push("场景 Frame 不得反向依赖旧 AnalyticsFrame 外壳。");

const routerSource = fs.readFileSync(path.join(root, "src/app/router.tsx"), "utf8");
if (!routerSource.includes("/__design-system")) failures.push("缺少开发环境组件展示入口：/__design-system");

function collect(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return collect(file);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) ? [file] : [];
  });
}

const formalFiles = ["src/app", "src/components/ui", "src/components/common", "src/components/domain", "src/features"].flatMap((directory) => collect(path.join(root, directory)));
for (const file of collect(path.join(root, "src/features"))) {
  const source = fs.readFileSync(file, "utf8");
  const relative = path.relative(root, file);
  if (relative.startsWith("src/features/design-system/")) continue;
  if (/<QuickStatus(?:Group|Item)\b|data-erp-component=["']quick-status-(?:group|item)/.test(source)) {
    failures.push(`${relative} 不得重新实现 QuickStatus 布局，必须通过 ErpPageHeader/QuickStatusGroup 复用公共组件。`);
  }
  if (/quickStatusVariant\s*=\s*["']workflow["']/.test(source)) {
    warnings.push(`${relative} 使用了 Workflow QuickStatus，请确认它是真正的流程场景；普通摘要应保持默认 Compact。`);
  }
}
const directColorPattern = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\s*\(/;
const namedColorPattern = /(?:bg|text|border)-(?:slate|gray|zinc|neutral|stone|red|rose|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink)-[A-Za-z0-9./[\]%-]+/g;
for (const file of formalFiles) {
  const source = fs.readFileSync(file, "utf8");
  const relative = path.relative(root, file);
  if (directColorPattern.test(source)) failures.push(`${relative} 直接写入颜色值，请使用 Design Token。`);
  const namedColors = [...new Set(source.match(namedColorPattern) || [])];
  if (namedColors.length > 0) warnings.push(`${relative} 仍有受控 Tailwind 语义色：${namedColors.join(", ")}`);
  if (/src\/components\/(?:erp|shared|ui\.tsx)/.test(source)) failures.push(`${relative} 引用了旧版 shared/erp/ui.tsx 路径。`);
  const rawRadii = [...new Set(source.match(/\brounded-(?:sm|md|lg|xl)\b/g) || [])];
  if (rawRadii.length && relative.startsWith("src/features/")) {
    failures.push(`${relative} 使用了裸圆角类（${rawRadii.join(", ")}），请改用 rounded-[var(--erp-radius-md)] 等语义令牌。`);
  }
  if (Number.isFinite(tabLayer)) {
    const numericLayers = [...source.matchAll(/\bz-(?:\[)?(\d+)/g)].map((match) => Number(match[1]));
    const invalidLayer = numericLayers.find((layer) => layer >= tabLayer);
    if (invalidLayer !== undefined) failures.push(`${relative} 使用了不低于 Tab 导航的层级 z-${invalidLayer}，所有应用层必须低于 ${tabLayer}。`);
  }
}

/* Catch token drift at the source boundary. A missing custom property is
   otherwise silently rendered as an invalid declaration and usually only
   appears on one feature or browser. Definitions live exclusively in
   tokens.css, so every --erp-* reference must resolve here. */
for (const file of [...formalFiles, globalStylesFile]) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/var\((--erp-[a-z0-9-]+)/g)) {
    const token = match[1];
    if (!definedTokens.has(token)) failures.push(`${path.relative(root, file)} 引用了未定义 Token：${token}。请先在 src/styles/tokens.css 建立语义令牌。`);
  }
}

if (failures.length) {
  console.error(`Design System 检查失败（${failures.length} 项）：`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
warnings.slice(0, 20).forEach((warning) => console.warn(`⚠ ${warning}`));
if (warnings.length > 20) console.warn(`⚠ 另有 ${warnings.length - 20} 项语义色待后续收口。`);
console.log(`Design System 检查通过：${requiredTokens.length} 个核心 Token、Header 契约、Quick Status 契约和开发展示入口均存在。`);
