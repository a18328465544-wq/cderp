import {
  BarChart3,
  Boxes,
  ClipboardList,
  FileText,
  Landmark,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  APP_MENU_MODULES,
  APP_MENU_ITEMS,
  isAnyMenuAllowed,
  type AppMenuGroup,
  type AppMenuItem,
} from "@/src/utils/menu";

export interface NavigationItem {
  id: string;
  label: string;
  icon: LucideIcon;
  path: string;
  group: AppMenuGroup;
  badge?: string;
  hiddenInNavigation?: boolean;
  navigationSection?: "primary" | "more";
  /** 一个可见入口可以承接多个历史子路由。 */
  activePaths?: string[];
  exactMatch?: boolean;
}

const groupIcons: Record<AppMenuGroup, LucideIcon> = {
  经营看板: BarChart3,
  商品库存: Boxes,
  采购回收: FileText,
  销售管理: ClipboardList,
  客户CRM: Users,
  财务利润: Landmark,
  系统设置: Settings,
};

const pathById: Record<string, string> = {
  dashboard: "/",
  ai_insights: "/ai-insights",
  quotes: "/quotes",
  inventory: "/inventory",
  products: "/products",
  assembly: "/assembly",
  purchase_add: "/purchase/new",
  purchase_list: "/purchase",
  inspections: "/inspections",
  return_purchase: "/purchase/returns",
  sales_add: "/sales/new",
  sales_outbound: "/sales/outbound",
  sales_list: "/sales",
  return_sales: "/sales/returns/new",
  return_orders: "/sales/returns",
  crm: "/crm",
  customers: "/crm/customers",
  order_pool: "/order-pool",
  vendors: "/crm/vendors",
  aftersales: "/aftersales",
  finance: "/finance",
  settlement_accounts: "/finance/accounts",
  settlement_ledger: "/finance/ledger",
  payment_in: "/finance/income",
  payment_out: "/finance/expense",
  account_transfer: "/finance/transfers",
  finance_reports: "/finance/profit",
  finance_closing: "/finance/closing",
  return_reconcile: "/finance/return-reconcile",
  purchase_commission: "/finance/purchase-commission",
  customer_funds: "/finance/customer-funds",
  sales_commission: "/finance/sales-commission",
  permissions: "/settings/users",
  logs: "/settings/logs",
  backup: "/settings/backup",
};

const activePathsById: Partial<Record<string, string[]>> = {
  payment_in: ["/finance/income", "/finance/expense"],
  finance_closing: ["/finance/closing", "/finance/return-reconcile"],
  purchase_commission: [
    "/finance/purchase-commission",
    "/finance/sales-commission",
  ],
};

const exactMatchIds = new Set(["finance", "purchase_list", "sales_list", "crm"]);

const toNavigationItem = (item: AppMenuItem): NavigationItem => ({
  id: item.id,
  label: item.name,
  icon: groupIcons[item.group],
  path: pathById[item.id] || `/${item.id}`,
  group: item.group,
  badge: item.badge,
  hiddenInNavigation: item.hiddenInNavigation,
  navigationSection: item.navigationSection,
  activePaths: activePathsById[item.id],
  exactMatch: exactMatchIds.has(item.id),
});

/**
 * V1 的菜单 ID 是权限和历史工作区的稳定契约；V2 只把它映射为 TanStack Router 路径，
 * 不重新维护第二份菜单名称或权限清单。
 */
export const navigationItems: NavigationItem[] =
  APP_MENU_ITEMS.map(toNavigationItem);

export const navigationModules = APP_MENU_MODULES.map((module) => ({
  id: module.name,
  label: module.name,
  icon: groupIcons[module.name],
  items: module.items.map(toNavigationItem),
}));

export function navigationItemById(id: string) {
  return navigationItems.find((item) => item.id === id);
}

export function navigationPathById(id: string) {
  return pathById[id] || `/${id}`;
}

export function isNavigationItemActive(item: NavigationItem, pathname: string) {
  const paths = item.activePaths?.length ? item.activePaths : [item.path];
  return paths.some((path) =>
    path === "/" || item.exactMatch
      ? pathname === path
      : pathname === path || pathname.startsWith(`${path}/`),
  );
}

/**
 * A visible navigation item is not always a one-to-one server permission:
 * some pages combine two backend endpoints (income/expense, return types),
 * while others retain a legacy client-only menu id. Keep those exceptions in
 * the route contract instead of teaching every page a different rule.
 */
export function requiredMenuIdsForPath(pathname: string): string[] | undefined {
  if (pathname === "/order-pool" || pathname.startsWith("/order-pool/")) return ["order_pool"];
  if (pathname === "/ai-insights" || pathname.startsWith("/ai-insights/")) {
    return ["dashboard", "ai_insights"];
  }
  if (pathname === "/purchase/returns" || pathname.startsWith("/purchase/returns/")) {
    return ["return_purchase", "return_orders"];
  }
  if (pathname === "/sales/returns" || pathname.startsWith("/sales/returns/")) {
    return ["return_sales", "return_orders"];
  }
  if (pathname === "/crm/customers/new") {
    return ["crm"];
  }
  if (pathname === "/finance/income") return ["payment_in"];
  if (pathname === "/finance/expense") return ["payment_out"];
  if (pathname === "/finance/closing") return ["finance"];
  if (pathname === "/finance/return-reconcile") {
    return ["return_purchase", "return_sales", "return_orders"];
  }
  if (pathname === "/finance/purchase-commission") return ["purchase_commission"];
  if (pathname === "/finance/sales-commission") return ["sales_commission"];
  return undefined;
}

export function isPathAllowed(allowedMenus: string[], pathname: string) {
  const required = requiredMenuIdsForPath(pathname);
  if (required) return isAnyMenuAllowed(allowedMenus, required);
  const activeItem = navigationItems.find((item) => isNavigationItemActive(item, pathname));
  return !activeItem || isAnyMenuAllowed(allowedMenus, [activeItem.id]);
}
