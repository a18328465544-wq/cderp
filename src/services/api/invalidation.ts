import type {QueryClient} from "@tanstack/react-query";
import {queryKeys} from "./query-keys";

export type ErpQueryDomain = "state" | "inventory" | "purchase" | "sales" | "finance" | "customers" | "vendors" | "crm" | "products" | "returns" | "aftersales" | "quotes" | "assembly" | "orderPool" | "inspections" | "ai" | "settings";
type ErpRefetchType = "active" | "inactive" | "all" | "none";
type ErpInvalidationOptions = {refetchType?: ErpRefetchType};

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
  const uniqueDomains = [...new Set(domains)];
  await Promise.all(uniqueDomains.map((domain) => queryClient.invalidateQueries({queryKey: keyForDomain[domain](), ...options})));
}

/**
 * Refresh every cached business query after a new document is persisted.
 * `refetchType: "all"` also refreshes inactive tabs, so switching tabs never
 * exposes a pre-document snapshot.
 */
export function refreshErpAfterDocument(queryClient: QueryClient) {
  return invalidateErpDomains(queryClient, ERP_DOCUMENT_REFRESH_DOMAINS, {refetchType: "all"});
}
