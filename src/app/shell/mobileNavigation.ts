import {isPathAllowed, navigationItems, type NavigationItem} from "@/src/config/navigation";

export type MobileDestination = "workbench" | "inventory" | "entry" | "documents" | "customers" | "more";
// Phone entry curation is presentation-only. Labels, routes and authorization
// still come from the existing navigation contract; desktop administration is
// not removed or silently granted by this list.
export function mobileNavigationItems(allowedMenus: string[], ids?: string[]): NavigationItem[] {
  return navigationItems.filter((item) => !item.hiddenInNavigation && (!ids || ids.includes(item.id)) && isPathAllowed(allowedMenus, item.path));
}

/** Every authorized destination remains discoverable. Curation belongs in
 * the entry hub, never in an extra mobile permission/visibility allowlist. */
export function mobileNavigationSections(allowedMenus: string[], keyword = "") {
  const query = keyword.trim().toLocaleLowerCase();
  const items = mobileNavigationItems(allowedMenus).filter((item) => `${item.mobileLabel || item.label} ${item.label} ${item.group}`.toLocaleLowerCase().includes(query));
  return Array.from(new Set(items.map((item) => item.group))).map((title) => ({title, items: items.filter((item) => item.group === title)}));
}

export function mobileDestinationForPath(pathname: string): MobileDestination {
  const path = (pathname.split(/[?#]/)[0] || "/").replace(/\/+$/, "") || "/";
  const within = (root: string) => path === root || path.startsWith(`${root}/`);
  if (path === "/" || ["/finance", "/quotes", "/ai-insights"].some(within)) return "workbench";
  if (path === "/sales/new" || path === "/purchase/new") return "entry";
  if (["/inventory", "/inspections", "/products", "/assembly", "/aftersales"].some(within)) return "inventory";
  if (["/customers", "/crm"].some(within)) return "customers";
  if (["/sales", "/purchase", "/order-pool"].some(within)) return "documents";
  return "more";
}

export function mobilePrimaryNavigationItem(allowedMenus: string[], destination: "workbench" | "inventory" | "customers") {
  const ids = destination === "workbench" ? ["dashboard", "finance"] : destination === "inventory" ? ["inventory", "inspections", "aftersales"] : ["customers", "crm", "vendors"];
  return ids.flatMap((id) => mobileNavigationItems(allowedMenus, [id]))[0];
}

/** Explicit creation routes avoid showing the return list as a new-order action. */
export function mobileCreationNavigationItems(allowedMenus: string[], ids: string[]) {
  return ids.flatMap((id) => mobileNavigationItems(allowedMenus, [id])).map((item) => item.id === "return_purchase" ? {...item, path: "/purchase/returns/new"} : item);
}
