import type { StateCollectionKey, StateRecordSave } from "./db.ts";

export type StateMergePatch = Partial<Record<StateCollectionKey, unknown[]>>;
export type StateDeletePatch = Partial<Record<StateCollectionKey, string[]>>;
type LinkedPaymentRecord = {
  id: string;
  settlementLedgerId?: string;
  financeLedgerId?: string;
};
type IdentifiedRecord = { id: string };

export function compactStateMerge(merge: StateMergePatch) {
  return Object.fromEntries(
    Object.entries(merge).filter(([, items]) => Array.isArray(items) && items.length > 0),
  ) as StateMergePatch;
}

export function compactStateDelete(stateDelete: StateDeletePatch) {
  return Object.fromEntries(
    Object.entries(stateDelete).filter(([, ids]) => Array.isArray(ids) && ids.length > 0),
  ) as StateDeletePatch;
}

export function stateMergeRecords(merge: StateMergePatch): StateRecordSave[] {
  return Object.entries(merge)
    .filter(([, items]) => Array.isArray(items) && items.length > 0)
    .map(([key, items]) => ({ key: key as StateCollectionKey, items: items as unknown[] }));
}

export function stateDeleteRecords(stateDelete: StateDeletePatch): StateRecordSave[] {
  return Object.entries(stateDelete)
    .filter(([, ids]) => Array.isArray(ids) && ids.length > 0)
    .map(([key, ids]) => ({ key: key as StateCollectionKey, items: [], deleteIds: ids as string[] }));
}

// Invoice edits can replace an auto-generated linked payment. Persisting only the replacement
// leaves the original payment and its two ledger rows in PostgreSQL, even though the in-memory
// aggregate removed them. Derive the exact deleted record ids from the before/after payment sets.
export function replacedLinkedPaymentDeletePatch(
  collection: "paymentInRecords" | "paymentOutRecords",
  previous: LinkedPaymentRecord[],
  current: LinkedPaymentRecord[],
  previousFinanceLedger: IdentifiedRecord[] = [],
  currentFinanceLedger: IdentifiedRecord[] = [],
): StateDeletePatch {
  const currentIds = new Set(current.map((item) => item.id));
  const removed = previous.filter((item) => !currentIds.has(item.id));
  const currentFinanceIds = new Set(currentFinanceLedger.map((item) => item.id));
  const deletedFinanceIds = new Set([
    ...removed.map((item) => item.financeLedgerId).filter((id): id is string => Boolean(id)),
    ...previousFinanceLedger.filter((item) => !currentFinanceIds.has(item.id)).map((item) => item.id),
  ]);
  return compactStateDelete({
    [collection]: removed.map((item) => item.id),
    settlementLedger: removed.map((item) => item.settlementLedgerId).filter((id): id is string => Boolean(id)),
    financeLedger: Array.from(deletedFinanceIds),
  });
}

export function statePatchResponse(data: unknown, stateMerge: StateMergePatch, stateDelete: StateDeletePatch = {}) {
  return { data, stateMerge: compactStateMerge(stateMerge), stateDelete: compactStateDelete(stateDelete) };
}
