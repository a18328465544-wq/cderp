import type {AccountTransferRecord, PaymentInRecord, PaymentOutRecord} from "../src/types.ts";
import type {AppState} from "./store.ts";
import {compactStateMerge, type StateMergePatch} from "./statePatch.ts";

/**
 * Select records by their canonical ids while preserving the order of the
 * source collection. State merge responses use this helper so callers only
 * receive the rows affected by a finance mutation.
 */
function recordsByIds<T extends {id: string}>(items: T[], ids: Iterable<string | undefined>) {
  const idSet = new Set(Array.from(ids).filter(Boolean));
  if (!idSet.size) return [];
  return items.filter((item) => idSet.has(item.id));
}

function recordsByIdOrLegacyName<T extends {id: string; name: string}>(items: T[], id?: string, name?: string) {
  if (id) return items.filter((item) => item.id === id);
  const legacyName = name?.trim();
  if (!legacyName) return [];
  return items.filter((item) => item.name.trim() === legacyName);
}

function financeRowsByIdsOrDocNo(state: AppState, ids: Iterable<string | undefined>, docNos: Iterable<string | undefined>) {
  const idSet = new Set(Array.from(ids).filter(Boolean));
  const docNoSet = new Set(Array.from(docNos).filter(Boolean));
  return state.financeLedger.filter((item) =>
    idSet.has(item.id) || (item.relatedId ? docNoSet.has(item.relatedId) : false)
  );
}

function settlementRowsByIdsOrDocNo(state: AppState, ids: Iterable<string | undefined>, docNos: Iterable<string | undefined>) {
  const idSet = new Set(Array.from(ids).filter(Boolean));
  const docNoSet = new Set(Array.from(docNos).filter(Boolean));
  return state.settlementLedger.filter((item) =>
    idSet.has(item.id) || (item.relatedDocNo ? docNoSet.has(item.relatedDocNo) : false)
  );
}

/** Build the client state patch for a newly created or updated receipt. */
export function paymentInMerge(state: AppState, record: PaymentInRecord): StateMergePatch {
  const relatedDocNos = new Set([record.id, record.relatedDocNo].filter(Boolean));
  const settlementLedger = settlementRowsByIdsOrDocNo(state, [record.settlementLedgerId], relatedDocNos);
  const financeLedger = financeRowsByIdsOrDocNo(state, [record.financeLedgerId], relatedDocNos);
  const accountIds = new Set([
    record.accountId,
    ...settlementLedger.map((item) => item.accountId),
    ...financeLedger.map((item) => item.settlementAccountId),
  ].filter(Boolean));

  return compactStateMerge({
    paymentInRecords: [record],
    settlementAccounts: state.settlementAccounts.filter((item) => accountIds.has(item.id)),
    settlementLedger,
    financeLedger,
    salesInvoices: state.salesInvoices.filter((item) => item.id === record.relatedDocNo || item.invoiceNo === record.relatedDocNo),
    customers: recordsByIdOrLegacyName(state.customers, record.customerId, record.customerName),
    vendors: recordsByIdOrLegacyName(state.vendors, record.supplierId, record.supplierName),
    logs: state.logs.slice(0, 1),
  });
}

/** Build the client state patch for a newly created or updated disbursement. */
export function paymentOutMerge(state: AppState, record: PaymentOutRecord): StateMergePatch {
  const relatedDocNos = new Set([record.id, record.relatedDocNo].filter(Boolean));
  const settlementLedger = settlementRowsByIdsOrDocNo(state, [record.settlementLedgerId], relatedDocNos);
  const financeLedger = financeRowsByIdsOrDocNo(state, [record.financeLedgerId], relatedDocNos);
  const accountIds = new Set([
    record.accountId,
    ...settlementLedger.map((item) => item.accountId),
    ...financeLedger.map((item) => item.settlementAccountId),
  ].filter(Boolean));

  return compactStateMerge({
    paymentOutRecords: [record],
    settlementAccounts: state.settlementAccounts.filter((item) => accountIds.has(item.id)),
    settlementLedger,
    financeLedger,
    purchaseInvoices: state.purchaseInvoices.filter((item) => item.id === record.relatedDocNo || item.invoiceNo === record.relatedDocNo),
    vendors: recordsByIdOrLegacyName(state.vendors, record.supplierId, record.supplierName),
    customers: recordsByIdOrLegacyName(state.customers, record.customerId, record.customerName),
    logs: state.logs.slice(0, 1),
  });
}

/** Build the client state patch for an account transfer mutation. */
export function accountTransferMerge(state: AppState, record: AccountTransferRecord): StateMergePatch {
  return compactStateMerge({
    accountTransfers: [record],
    settlementAccounts: recordsByIds(state.settlementAccounts, [record.fromAccountId, record.toAccountId]),
    settlementLedger: state.settlementLedger.filter((item) => item.relatedDocNo === record.id),
    financeLedger: state.financeLedger.filter((item) => item.relatedId === record.id),
    logs: state.logs.slice(0, 1),
  });
}
