import type {QueryClient} from "@tanstack/react-query";
import {queryKeys} from "./query-keys";

export type ErpQueryDomain = "state" | "inventory" | "purchase" | "sales" | "finance" | "customers" | "vendors" | "crm" | "products" | "returns" | "aftersales" | "quotes" | "assembly" | "orderPool" | "inspections" | "ai" | "settings";
type ErpRefetchType = "active" | "inactive" | "all" | "none";
type ErpInvalidationOptions = {refetchType?: ErpRefetchType};

/** Dependencies of derived read models, not only the collection being written. */
const dependentDomains: Partial<Record<ErpQueryDomain, readonly ErpQueryDomain[]>> = {
  inventory: ["products", "inspections", "purchase", "finance"],
  inspections: ["inventory", "purchase"],
  purchase: ["finance", "ai"], sales: ["finance", "ai"],
  returns: ["inventory", "purchase", "sales", "finance", "inspections"],
  assembly: ["inventory"], aftersales: ["inventory"],
  customers: ["crm", "purchase", "sales"], vendors: ["crm", "purchase", "sales"],
};

/** Central mutation invalidation map. Keep domain effects here instead of copying Promise.all blocks into pages. */
const keyForDomain: Record<ErpQueryDomain, () => readonly unknown[]> = {
  state: () => queryKeys.state.all(),
  inventory: () => queryKeys.inventory.all(),
  purchase: () => queryKeys.purchase.all(),
  sales: () => queryKeys.sales.all(),
  finance: () => queryKeys.finance.all(),
  customers: () => queryKeys.customers.all(),
  vendors: () => queryKeys.vendors.all(),
  crm: () => queryKeys.crm.all(),
  products: () => queryKeys.products.all(),
  returns: () => queryKeys.returns.all(),
  aftersales: () => queryKeys.aftersales.all(),
  quotes: () => queryKeys.quotes.all(),
  assembly: () => queryKeys.assembly.all(),
  orderPool: () => queryKeys.orderPool.all(),
  inspections: () => queryKeys.inspections.all(),
  ai: () => queryKeys.ai.all(),
  settings: () => queryKeys.settings.all(),
};

/** Domains that can be affected by a newly-created business document. */
export const ERP_DOCUMENT_REFRESH_DOMAINS = [
  "state",
  "inventory",
  "purchase",
  "sales",
  "finance",
  "customers",
  "vendors",
  "crm",
  "products",
  "returns",
  "aftersales",
  "quotes",
  "assembly",
  "orderPool",
  "inspections",
  "ai",
  "settings",
] as const satisfies readonly ErpQueryDomain[];

export async function invalidateErpDomains(queryClient: QueryClient, domains: readonly ErpQueryDomain[], options: ErpInvalidationOptions = {}) {
  const affected = new Set(domains);
  for (const domain of affected) for (const dependency of dependentDomains[domain] || []) affected.add(dependency);
  const keys: readonly unknown[][] = [...affected].map((domain) => [...keyForDomain[domain]()]);
  const derived: unknown[][] = [];
  if (affected.has("inventory") || affected.has("products")) derived.push(["sales", "inventory-candidates"], ["sales", "product-candidates"], ["assembly", "reference-data"], ["returns", "reference"], ["purchase", "reference-data"]);
  if (affected.has("customers") || affected.has("vendors")) derived.push(["sales", "customers"], ["purchase", "reference-data"], ["returns", "reference"]);
  if (affected.has("finance")) derived.push(["sales", "settlement-accounts"], ["purchase", "reference-data"]);
  const targets = [...keys];
  for (const key of derived) if (!targets.some((existing) => existing.every((part, index) => part === key[index]))) targets.push(key);
  // Entity changes also invalidate previously empty/old global search results.
  targets.push(["global-search"]);
  await Promise.all(targets.map((queryKey) => queryClient.invalidateQueries({queryKey, refetchType: "active", ...options})));
}

/**
 * Refresh affected visible queries only. Inactive filters/tabs stay stale and
 * refresh on activation instead of creating a post-submit request storm.
 */
export function refreshErpAfterDocument(queryClient: QueryClient, domains: readonly ErpQueryDomain[] = ERP_DOCUMENT_REFRESH_DOMAINS) {
  return invalidateErpDomains(queryClient, domains);
}
