/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { StoreRole } from "../types";

export type AppMenuGroup =
  | "经营看板"
  | "商品库存"
  | "采购回收"
  | "销售管理"
  | "客户CRM"
  | "财务利润"
  | "系统设置";

export interface AppMenuItem {
  id: string;
  name: string;
  group: AppMenuGroup;
  badge?: string;
  /** 页面内已有分类切换时，不在侧栏二级菜单重复展示。 */
  hiddenInNavigation?: boolean;
  /** 低频入口保留在模块的“更多”分组，不与核心工作流平铺。 */
  navigationSection?: "primary" | "more";
}

export interface AppMenuModule {
  name: AppMenuGroup;
  items: AppMenuItem[];
}

const item = (
  group: AppMenuGroup,
  id: string,
  name: string,
  badge?: string,
  hiddenInNavigation = false,
  navigationSection: "primary" | "more" = "primary",
): AppMenuItem => ({
  id,
  name,
  group,
  ...(badge ? { badge } : {}),
  ...(hiddenInNavigation ? { hiddenInNavigation } : {}),
  ...(navigationSection === "more" ? { navigationSection } : {}),
});

export const APP_MENU_MODULES: AppMenuModule[] = [
  {
    name: "经营看板",
    items: [
      item("经营看板", "dashboard", "首页"),
      item("经营看板", "ai_insights", "经营建议", "AI"),
      item("经营看板", "quotes", "行情参考"),
    ],
  },
  {
    name: "商品库存",
    items: [
      item("商品库存", "inventory", "库存查询"),
      item("商品库存", "products", "商品库"),
      item("商品库存", "assembly", "组装拆卸"),
    ],
  },
  {
    name: "采购回收",
    items: [
      item("采购回收", "purchase_add", "采购开单", "批量"),
      item("采购回收", "purchase_list", "采购单据"),
      item("采购回收", "inspections", "检测质检", "质检"),
      item("采购回收", "return_purchase", "采购退货"),
    ],
  },
  {
    name: "销售管理",
    items: [
      item("销售管理", "sales_add", "销售开单"),
      item("销售管理", "sales_outbound", "销售出库", "扫码"),
      item("销售管理", "sales_list", "销售单据"),
      item("销售管理", "return_sales", "销售退货"),
      item("销售管理", "return_orders", "退货单据"),
    ],
  },
  {
    name: "客户CRM",
    items: [
      item("客户CRM", "crm", "客户池"),
      item("客户CRM", "customers", "客户列表"),
      item("客户CRM", "order_pool", "订单池", undefined, false, "primary"),
      item("客户CRM", "vendors", "同行列表", undefined, true),
      item("客户CRM", "aftersales", "售后维护"),
    ],
  },
  {
    name: "财务利润",
    items: [
      item("财务利润", "finance", "财务总览"),
      item("财务利润", "settlement_accounts", "资金账户"),
      item("财务利润", "settlement_ledger", "账户流水"),
      item("财务利润", "payment_in", "其他收支"),
      // 支出保留独立权限与路由，但由“其他收支”页内切换，不重复占用菜单。
      item("财务利润", "payment_out", "其他支出", undefined, true),
      item("财务利润", "finance_reports", "销售利润"),
      item("财务利润", "customer_funds", "往来账款"),
      item(
        "财务利润",
        "account_transfer",
        "资金调拨",
        undefined,
        false,
        "more",
      ),
      item("财务利润", "finance_closing", "财务核对", undefined, false, "more"),
      // 退货对账由“财务核对”内部切换，保留旧权限和旧地址。
      item("财务利润", "return_reconcile", "退货对账", undefined, true),
      item(
        "财务利润",
        "purchase_commission",
        "员工提成",
        undefined,
        false,
        "more",
      ),
      // 保留旧路由兼容历史工作区和权限配置；统一入口由员工提成页面内部切换。
      item("财务利润", "sales_commission", "销售提成", undefined, true),
    ],
  },
  {
    name: "系统设置",
    items: [
      item("系统设置", "permissions", "员工管理"),
      item("系统设置", "logs", "操作日志"),
      item("系统设置", "backup", "数据备份"),
    ],
  },
];

export const APP_MENU_ITEMS: AppMenuItem[] = APP_MENU_MODULES.flatMap(
  (module) => module.items,
);

export const APP_MENU_SECTIONS = APP_MENU_MODULES.map((module) => ({
  name: module.name,
}));

export const APP_MENU_GROUPS: AppMenuGroup[] = APP_MENU_SECTIONS.map(
  (section) => section.name,
);

export const APP_MENU_IDS = APP_MENU_ITEMS.map((item) => item.id);

export const getMenuGroupForId = (menuId: string) =>
  APP_MENU_ITEMS.find((item) => item.id === menuId)?.group;

export const ROLE_DEFAULT_MENU_IDS: Record<StoreRole, string[]> = {
  老板: ["all"],
  店员: [
    "dashboard",
    "products",
    "purchase_add",
    "purchase_list",
    "inspections",
    "inventory",
    "assembly",
    "sales_add",
    "sales_outbound",
    "sales_list",
    "return_sales",
    "return_purchase",
    "return_orders",
    "crm",
    "customers",
    "order_pool",
    "quotes",
    "payment_in",
  ],
  检测员: ["dashboard", "inventory", "inspections", "assembly", "order_pool"],
  财务: [
    "dashboard",
    "purchase_list",
    "inventory",
    "sales_outbound",
    "sales_list",
    "return_purchase",
    "return_orders",
    "return_reconcile",
    "settlement_accounts",
    "settlement_ledger",
    "payment_in",
    "payment_out",
    "account_transfer",
    "purchase_commission",
    "customer_funds",
    "sales_commission",
    "finance_reports",
    "finance",
    "finance_closing",
    "vendors",
    "order_pool",
  ],
};

const LEGACY_MENU_MAP: Record<string, string[]> = {
  purchase: ["purchase_add", "purchase_list"],
  sales: ["sales_add", "sales_outbound", "sales_list"],
  // 供应商欠款是历史入口，统一迁移到同时管理应收与应付的资金往来中心。
  supplier_payables: ["customer_funds"],
};

export function normalizeAllowedMenus(
  allowedMenus: string[] | undefined,
  role?: StoreRole,
) {
  // The server treats an empty/unknown permission payload as a request to use
  // the role defaults. Keep the same fail-safe behavior in the browser so a
  // partially populated /api/state response never throws or grants access.
  const roleDefaults = role ? ROLE_DEFAULT_MENU_IDS[role] : undefined;
  const source = allowedMenus?.length ? allowedMenus : roleDefaults || ["dashboard"];
  if (source.includes("all")) return ["all"];

  const normalized = new Set<string>();
  source.forEach((item) => {
    const mapped = LEGACY_MENU_MAP[item] || [item];
    mapped.forEach((menuId) => {
      if (APP_MENU_IDS.includes(menuId)) normalized.add(menuId);
    });
  });

  if (normalized.has("sales_add") || normalized.has("sales_list")) {
    normalized.add("sales_outbound");
  }
  if (normalized.has("inventory") || normalized.has("inspections")) {
    normalized.add("assembly");
  }
  // 客户与同行已经收拢到同一个“客户列表”入口；保留两个内部路由权限，
  // 以兼容开单页跳转到同行 / 核心采购方分类的既有流程。
  if (normalized.has("customers") || normalized.has("vendors")) {
    normalized.add("customers");
    normalized.add("vendors");
  }
  // “财务流水”升级为财务总览后，原先拥有该权限的账号仍可进入日结与异常页，
  // 防止老权限配置在菜单重构后丢失既有核对能力。
  if (normalized.has("finance")) {
    normalized.add("finance_closing");
  }
  if (normalized.size === 0) normalized.add("dashboard");

  return APP_MENU_IDS.filter((id) => normalized.has(id));
}

export function expandAllowedMenus(allowedMenus: string[] | undefined) {
  if (allowedMenus?.includes("all")) return APP_MENU_IDS;
  return normalizeAllowedMenus(allowedMenus);
}

export function isMenuAllowed(allowedMenus: string[], menuId: string) {
  const normalized = normalizeAllowedMenus(allowedMenus);
  return normalized.includes("all") || normalized.includes(menuId);
}

export function isAnyMenuAllowed(allowedMenus: string[], menuIds: readonly string[]) {
  return menuIds.some((menuId) => isMenuAllowed(allowedMenus, menuId));
}

export function filterMenuModulesByPermissions(allowedMenus: string[]) {
  return APP_MENU_MODULES.map((module) => ({
    ...module,
    items: module.items.filter(
      (item) =>
        !item.hiddenInNavigation && isMenuAllowed(allowedMenus, item.id),
    ),
  })).filter((module) => module.items.length > 0);
}
