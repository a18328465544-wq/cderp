import type {ErpStateSnapshot} from "@/src/services/api/adapters/state.adapter";
import type {GlobalSearchResult, GlobalSearchResultKind} from "@/src/types/global-search";
import {matchesKeyword} from "@/src/utils/search";

type SearchEntry = {
  kind: GlobalSearchResultKind;
  menus: readonly string[];
  id: string;
  title: string;
  subtitle?: string;
  reference: string;
  route: string;
  values: unknown[];
};

function text(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim()) === undefined
    ? ""
    : String(values.find((value) => value !== undefined && value !== null && String(value).trim())).trim();
}

function hasMenu(allowedMenus: readonly string[], menus: readonly string[]) {
  return allowedMenus.includes("all") || menus.some((menu) => allowedMenus.includes(menu));
}

function entry(
  kind: GlobalSearchResultKind,
  menus: readonly string[],
  route: string,
  id: unknown,
  title: unknown,
  reference: unknown,
  subtitle: unknown,
  values: unknown[],
): SearchEntry | null {
  const normalizedId = text(id);
  const normalizedTitle = text(title) || normalizedId;
  if (!normalizedId || !normalizedTitle) return null;
  const normalizedSubtitle = text(subtitle);
  return {
    kind,
    menus,
    id: normalizedId,
    title: normalizedTitle,
    ...(normalizedSubtitle ? {subtitle: normalizedSubtitle} : {}),
    reference: text(reference) || normalizedId,
    route,
    values,
  };
}

function invoiceItemValues(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    return [record.productName, record.model, record.brand, record.sn, record.productId];
  });
}

function toResult(item: SearchEntry): GlobalSearchResult {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    ...(item.subtitle ? {subtitle: item.subtitle} : {}),
    route: item.route,
    reference: item.reference,
  };
}

function snapshotEntries(snapshot: ErpStateSnapshot, allowedMenus: readonly string[]) {
  const items: SearchEntry[] = [];
  const add = (value: SearchEntry | null) => {
    if (value && hasMenu(allowedMenus, value.menus)) items.push(value);
  };

  for (const item of snapshot.products) {
    add(entry("product", ["products"], "/products", item.id, item.name || text(item.brand, item.model, item.version, item.vram), item.model, [item.category, item.brand, item.model, item.version, item.vram].filter(Boolean).join(" · "), [item.id, item.name, item.category, item.brand, item.model, item.version, item.vram, item.remarks]));
  }
  for (const item of snapshot.inventory) {
    add(entry("inventory", ["inventory"], "/inventory", item.id, item.productName || item.model, item.sn, [item.sn, item.status, item.warehouseLocation].filter(Boolean).join(" · "), [item.id, item.productId, item.productName, item.category, item.brand, item.model, item.version, item.vram, item.sn, item.expressNo, item.supplierName, item.warehouseLocation, item.remarks]));
  }
  for (const item of snapshot.inspections) {
    add(entry("inspection", ["inspections"], "/inspections", item.id, item.sn || item.inventoryId, item.inventoryId, [item.resultStatus, item.inspector, item.inspectTime].filter(Boolean).join(" · "), [item.id, item.inventoryId, item.sn, item.inspector, item.resultStatus, item.remarks]));
  }
  for (const item of snapshot.customers) {
    add(entry("customer", ["customers"], "/crm/customers", item.id, item.name, item.id, [item.company, item.level].filter(Boolean).join(" · "), [item.id, item.name, item.phone, item.contact, item.wechat, item.qq, item.company, item.owner, item.remarks, ...(item.tags || [])]));
  }
  for (const item of snapshot.vendors) {
    add(entry("vendor", ["vendors"], "/crm/vendors", item.id, item.name, item.id, [item.type, item.level].filter(Boolean).join(" · "), [item.id, item.name, item.contact, item.contactPerson, item.phone, item.type, item.level, item.remarks, item.riskReason]));
  }
  for (const item of snapshot.purchaseInvoices) {
    add(entry("purchase", ["purchase_list"], "/purchase", item.id, item.invoiceNo || item.id, item.invoiceNo, [item.date, item.sourceType, item.supplierName, item.paymentStatus].filter(Boolean).join(" · "), [item.id, item.invoiceNo, item.date, item.sourceType, item.supplierName, item.contact, item.expressNo, item.handleBy, item.remarks, ...invoiceItemValues(item.items)]));
  }
  for (const item of snapshot.salesInvoices) {
    add(entry("sales", ["sales_list"], "/sales", item.id, item.invoiceNo || item.id, item.invoiceNo, [item.date, item.customerName, item.paymentStatus, item.outboundStatus].filter(Boolean).join(" · "), [item.id, item.invoiceNo, item.date, item.customerName, item.contact, item.channel, item.handleBy, item.remarks, ...invoiceItemValues(item.items)]));
  }
  for (const item of snapshot.marketQuotes) {
    add(entry("quote", ["quotes"], "/quotes", item.id, item.productName || item.model || item.id, item.model, [item.brand, item.model, item.version, item.updateTime || item.date].filter(Boolean).join(" · "), [item.id, item.productId, item.productName, item.model, item.brand, item.version, item.remarks]));
  }
  for (const item of snapshot.returnOrders) {
    const route = item.type === "进货退货" ? "/purchase/returns" : "/sales/returns";
    add(entry("return", ["return_purchase", "return_sales", "return_orders", "return_reconcile"], route, item.id, item.returnNo || item.id, item.returnNo, [item.type, item.relatedDocNo, item.status, item.partyName].filter(Boolean).join(" · "), [item.id, item.returnNo, item.relatedDocNo, item.sourceInventoryId, item.productName, item.sn, item.partyName, item.reason, item.remarks]));
  }
  for (const item of snapshot.aftersales) {
    add(entry("aftersales", ["aftersales"], "/aftersales", item.id, item.productName || item.salesInvoiceNo || item.id, item.salesInvoiceNo || item.inventoryNo, [item.salesInvoiceNo, item.customerName, item.sn, item.status].filter(Boolean).join(" · "), [item.id, item.salesInvoiceNo, item.customerName, item.contact, item.inventoryNo, item.productName, item.model, item.sn, item.desc, item.remarks, item.handler]));
  }

  return items;
}

/**
 * Search the already-authorized initial snapshot without exposing fields that
 * are not part of the global-search result contract. This is deliberately a
 * fallback for transient search API failures, not a replacement for the
 * server-side, tenant-scoped search.
 */
export function searchGlobalSnapshot(
  snapshot: ErpStateSnapshot | undefined,
  query: string,
  allowedMenus: readonly string[],
  limit = 48,
) {
  if (!snapshot || !query.trim()) return [];
  return snapshotEntries(snapshot, allowedMenus)
    .filter((item) => matchesKeyword(item.values, query))
    .slice(0, Math.max(1, Math.min(60, Math.floor(limit))))
    .map(toResult);
}
