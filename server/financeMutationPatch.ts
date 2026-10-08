import type {AppState} from "./store.ts";
import {runStateCommand, type StateCommandPatch, type StateCommandPrepare, type StateCommandTransactionHook} from "./stateCommand.ts";
import type {StateDeletePatch, StateMergePatch} from "./statePatch.ts";

const financialKeys = ["settlementAccounts", "settlementLedger", "financeLedger"] as const;
export type FinanceFactsSnapshot = Record<typeof financialKeys[number], Map<string, string>>;

/** Capture values, not references: ledger rebuilding can change existing rows,
 * including rows outside the command's immediate source-document links. */
export function captureFinanceFacts(state: AppState): FinanceFactsSnapshot {
  return Object.fromEntries(financialKeys.map((key) => [key, new Map(state[key].map((row) => [row.id, JSON.stringify(row)] as const))])) as FinanceFactsSnapshot;
}

/** Complete an existing business patch without a whole-collection overwrite.
 * Account moves persist both sides; backdated/removed movements persist all
 * changed running balances; transfer reversals retain pre-removal ledger IDs. */
export function completeFinancePatch(state: AppState, before: FinanceFactsSnapshot, patch: StateCommandPatch): StateCommandPatch {
  const stateMerge: StateMergePatch = {...patch.stateMerge};
  const stateDelete: StateDeletePatch = {...patch.stateDelete};
  for (const key of financialKeys) {
    const currentIds = new Set(state[key].map((row) => row.id));
    const removed = [...before[key].keys()].filter((id) => !currentIds.has(id));
    const deletedIds = new Set([...(stateDelete[key] || []), ...removed]);
    const changed = state[key].filter((row) => before[key].get(row.id) !== JSON.stringify(row));
    const explicitRows = (stateMerge[key] || []).filter((row): row is {id: string} => row !== null && typeof row === "object" && "id" in row && typeof row.id === "string");
    const rows = new Map(explicitRows.filter((row) => !deletedIds.has(row.id)).map((row) => [row.id, row]));
    for (const row of changed) if (!deletedIds.has(row.id)) rows.set(row.id, row);
    if (rows.size) stateMerge[key] = [...rows.values()];
    else delete stateMerge[key];
    if (deletedIds.size) stateDelete[key] = [...deletedIds];
    else delete stateDelete[key];
  }
  return {stateMerge, stateDelete};
}

/** Keep invoice/return/aftersales writes on the same incremental transaction
 * pipeline as ordinary payments. Call only after the existing write lock has
 * loaded the command's scoped facts; projections belong at the HTTP boundary. */
export function runFinanceStateCommand<T>(
  state: AppState,
  command: () => T | Promise<T>,
  patchFor: (data: T) => StateCommandPatch | StateMergePatch,
  prepare?: StateCommandPrepare<T>,
  transactionHook?: StateCommandTransactionHook<T>,
) {
  const before = captureFinanceFacts(state);
  return runStateCommand(command, (data) => {
    const patch = patchFor(data);
    return completeFinancePatch(state, before, "stateMerge" in patch ? patch : {stateMerge: patch});
  }, prepare, transactionHook);
}
