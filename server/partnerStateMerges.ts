import type {Vendor} from "../src/types.ts";
import type {StateCollectionKey} from "./db.ts";
import {compactStateMerge, type StateMergePatch} from "./statePatch.ts";
import type {AppState} from "./store.ts";

function recordsByIds<T extends {id: string}>(items: T[], ids: Iterable<string | undefined>) {
  const idSet = new Set(Array.from(ids).filter(Boolean));
  if (!idSet.size) return [];
  return items.filter((item) => idSet.has(item.id));
}

/** Shared log-only patch used by deletes across product, partner and quote routes. */
export function deleteStateMerge(state: AppState): StateMergePatch {
  return compactStateMerge({logs: state.logs.slice(0, 1)});
}

/** Return a minimal patch for a newly created top-level record. */
export function simpleRecordCreateMerge(state: AppState, key: StateCollectionKey, record: {id: string}): StateMergePatch {
  return compactStateMerge({
    [key]: [record],
    logs: state.logs.slice(0, 1),
  } as StateMergePatch);
}

/**
 * Vendor updates can affect legacy name-based inventory and settlement rows in
 * addition to canonical partner-linked documents. Keep that compatibility
 * projection in one domain helper until the legacy fields are migrated away.
 */
export function vendorRecordMerge(state: AppState, vendor: Vendor | null): StateMergePatch {
  if (!vendor) return deleteStateMerge(state);
  const legacyNameIsUnique = state.vendors.filter((item) => item.name.trim() === vendor.name.trim()).length === 1;
  return compactStateMerge({
    vendors: recordsByIds(state.vendors, [vendor.id]),
    purchaseInvoices: state.purchaseInvoices.filter((invoice) => invoice.sourcePartnerId === vendor.id && (invoice.sourcePartnerType || "vendor") === "vendor"),
    salesInvoices: state.salesInvoices.filter((invoice) => invoice.customerId === vendor.id && invoice.customerPartnerType === "vendor"),
    inventory: legacyNameIsUnique ? state.inventory.filter((card) => card.supplierName === vendor.name) : [],
    paymentOutRecords: state.paymentOutRecords.filter((item) => item.supplierId === vendor.id),
    settlementLedger: legacyNameIsUnique ? state.settlementLedger.filter((item) => item.supplierName === vendor.name) : [],
    logs: state.logs.slice(0, 1),
  });
}
