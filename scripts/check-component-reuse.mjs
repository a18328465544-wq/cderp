import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

const targets = [
  {
    name: "库存正式页",
    file: "src/features/inventory/pages/InventoryListPage.tsx",
    required: ["ErpPageHeader", "ErpFilterBar", "ErpDataTable", "ErpDetailDrawer", "ErpStatusBadge", "ErpLoadingState", "ErpPageError", "MetricsRegion"],
    forbidden: [
      [/<table\b/, "不得在库存列表页重复实现 DataTable 外壳"],
      [/<Sheet\b|<Sheet\./, "详情必须使用 ErpDetailDrawer，不能直接使用基础 Sheet"],
      [/function\s+PageState\b/, "加载/错误状态应使用 Common 状态组件"],
    ],
  },
  {
    name: "新建销售单页",
    file: "src/features/sales/pages/NewSalesOrderPage.tsx",
    required: ["ErpPageHeader", "ErpFormSection", "ErpSubmitBar", "ErpLoadingState", "ErpPageError", "CustomerPicker", "SalesLineItemsTable", "SalesAmountSummary", "SalesPaymentSection"],
    forbidden: [
      [/<Sheet\b|<Sheet\./, "详情或侧栏不能在销售页另建基础 Sheet"],
      [/function\s+PageState\b/, "加载/错误状态应使用 Common 状态组件"],
      [/\bfetch\s*\(|["'`]\/api\//, "页面不得绕过 API Service"],
    ],
  },
  {
    name: "客户 CRM 工作台",
    file: "src/features/crm/pages/CrmWorkspacePage.tsx",
    required: ["ErpPageHeader", "ErpFilterBar", "ErpDataTable", "ErpDetailDrawer", "ErpStatusBadge", "ErpLoadingState", "ErpPageError", "MetricsRegion"],
    forbidden: [
      [/<table\b/, "不得在 CRM 页面重复实现 DataTable 外壳"],
      [/<Sheet\b|<Sheet\./, "详情必须使用 ErpDetailDrawer，不能直接使用基础 Sheet"],
      [/\bfetch\s*\(|["'`]\/api\//, "页面不得绕过 API Service"],
      [/LegacyRoutePage|\/legacy\//, "正式 CRM 页面不得依赖 Legacy 实现"],
    ],
  },
  {
    name: "客户档案页",
    file: "src/features/customers/pages/CustomerDirectoryPage.tsx",
    required: ["ErpPageHeader", "ErpFilterBar", "ErpDataTable", "ErpDetailDrawer", "ErpStatusBadge", "ErpLoadingState", "ErpPageError", "MetricsRegion"],
    forbidden: [
      [/<table\b/, "不得在客户档案页重复实现 DataTable 外壳"],
      [/<Sheet\b|<Sheet\./, "详情必须使用 ErpDetailDrawer，不能直接使用基础 Sheet"],
      [/\bfetch\s*\(|["'`]\/api\//, "页面不得绕过 API Service"],
      [/LegacyRoutePage|\/legacy\//, "正式客户档案页不得依赖 Legacy 实现"],
    ],
  },
  {
    name: "同行档案页",
    file: "src/features/vendors/pages/VendorDirectoryPage.tsx",
    required: ["ErpPageHeader", "ErpFilterBar", "ErpDataTable", "ErpDetailDrawer", "ErpStatusBadge", "ErpLoadingState", "ErpPageError", "MetricsRegion"],
    forbidden: [
      [/<table\b/, "不得在同行档案页重复实现 DataTable 外壳"],
      [/<Sheet\b|<Sheet\./, "详情必须使用 ErpDetailDrawer，不能直接使用基础 Sheet"],
      [/\bfetch\s*\(|["'`]\/api\//, "页面不得绕过 API Service"],
      [/LegacyRoutePage|\/legacy\//, "正式同行档案页不得依赖 Legacy 实现"],
    ],
  },
];

for (const target of targets) {
  const absolute = path.join(root, target.file);
  const source = fs.readFileSync(absolute, "utf8");
  for (const required of target.required) {
    if (!source.includes(required)) failures.push(`${target.name} 缺少复用契约：${required}`);
  }
  for (const [pattern, message] of target.forbidden) {
    if (pattern.test(source)) failures.push(`${target.name} ${message}`);
  }
  if (/(?:bg|text|border)-(?:slate|gray|zinc|neutral|stone|red|rose|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink)-[A-Za-z0-9./[\]%-]+/.test(source)) {
    failures.push(`${target.name} 使用了未收口的 Tailwind 语义色，请改用 Design Token。`);
  }
}

const salesComponents = [
  "src/features/sales/components/SalesLineItemsTable.tsx",
  "src/features/sales/components/SalesPaymentSection.tsx",
];
for (const file of salesComponents) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  if (!source.includes("ErpAmountInput")) failures.push(`${file} 的金额字段必须使用 ErpAmountInput。`);
}

if (failures.length) {
  console.error(`Component Reuse 检查失败（${failures.length} 项）：`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Component Reuse 检查通过：库存、CRM List/Dashboard 与销售 Create/Edit Page 均复用统一骨架和公共能力。");
