import assert from "node:assert/strict";
import test from "node:test";
import {createInitialState, createStoreActions, type AppState} from "./store.ts";
import {accountTransferMerge, paymentInMerge, paymentOutMerge} from "./financeStateMerges.ts";
import {captureFinanceFacts, completeFinancePatch} from "./financeMutationPatch.ts";
import type {StateCommandPatch} from "./stateCommand.ts";

const keys = ["settlementAccounts", "settlementLedger", "financeLedger"] as const;
function fixture() {
  const state = createInitialState();
  const template = state.settlementAccounts.find((account) => account.enabled)!;
  Object.assign(state, {paymentInRecords: [], paymentOutRecords: [], accountTransfers: [], settlementLedger: [], financeLedger: [], logs: []});
  state.settlementAccounts = ["A", "B", "C"].map((id) => ({...template, id, name: id, balance: 1000, availableBalance: 1000, frozenAmount: 0}));
  return {state, actions: createStoreActions(state)};
}
function facts(state: AppState) {
  return Object.fromEntries(keys.map((key) => [key, structuredClone(state[key]).sort((a, b) => a.id.localeCompare(b.id))]));
}
function apply(before: AppState, patch: StateCommandPatch) {
  const restored = structuredClone(before);
  for (const key of keys) {
    const rows = new Map<string, unknown>(restored[key].map((row) => [row.id, row] as const));
    for (const row of patch.stateMerge[key] || []) {
      assert.ok(row && typeof row === "object" && "id" in row && typeof row.id === "string");
      rows.set(row.id, structuredClone(row));
    }
    for (const id of patch.stateDelete?.[key] || []) rows.delete(id);
    Object.assign(restored, {[key]: [...rows.values()]});
  }
  return facts(restored);
}

for (const receipt of [true, false]) {
  const label = receipt ? "receipt" : "disbursement";
  test(`${label} backdated creation persists later running balances, not just the new payment`, () => {
    const {state, actions} = fixture();
    const create = (time: string, amount: number) => receipt
      ? actions.createPaymentIn({accountId: "A", customerName: "LOCAL", businessType: "返点收入", amount, handler: "LOCAL", paymentMethod: "现金", time})
      : actions.createPaymentOut({accountId: "A", supplierName: "LOCAL", businessType: "办公费用", amount, handler: "LOCAL", paymentMethod: "现金", time});
    create("2026-10-04 11:00:00", 100);
    const before = structuredClone(state); const snapshot = captureFinanceFacts(state);
    const record = create("2026-10-04 09:00:00", 20);
    const base = receipt ? paymentInMerge(state, record as Parameters<typeof paymentInMerge>[1]) : paymentOutMerge(state, record as Parameters<typeof paymentOutMerge>[1]);
    assert.notDeepEqual(apply(before, {stateMerge: base}), facts(state), "the old linked-only patch loses a later balance");
    assert.deepEqual(apply(before, completeFinancePatch(state, snapshot, {stateMerge: base})), facts(state));
  });
  test(`${label} account edits persist both old and new accounts and both running ledgers`, () => {
    const {state, actions} = fixture();
    const record = receipt
      ? actions.createPaymentIn({accountId: "A", customerName: "LOCAL", businessType: "返点收入", amount: 100, handler: "LOCAL", paymentMethod: "现金", time: "2026-10-04 09:00:00"})
      : actions.createPaymentOut({accountId: "A", supplierName: "LOCAL", businessType: "办公费用", amount: 100, handler: "LOCAL", paymentMethod: "现金", time: "2026-10-04 09:00:00"});
    for (const accountId of ["A", "B"]) actions.createPaymentIn({accountId, customerName: "LOCAL-LATER", businessType: "返点收入", amount: 10, handler: "LOCAL", paymentMethod: "现金", time: "2026-10-04 11:00:00"});
    const before = structuredClone(state); const snapshot = captureFinanceFacts(state);
    const updated = receipt ? actions.updatePaymentIn(record.id, {accountId: "B", amount: 80, time: "2026-10-04 10:00:00"}) : actions.updatePaymentOut(record.id, {accountId: "B", amount: 80, time: "2026-10-04 10:00:00"});
    const base = receipt ? paymentInMerge(state, updated as Parameters<typeof paymentInMerge>[1]) : paymentOutMerge(state, updated as Parameters<typeof paymentOutMerge>[1]);
    assert.notDeepEqual(apply(before, {stateMerge: base}), facts(state));
    const patch = completeFinancePatch(state, snapshot, {stateMerge: base});
    assert.deepEqual(apply(before, patch), facts(state));
    assert.deepEqual(patch.stateMerge.settlementAccounts?.map((row) => (row as {id: string}).id).sort(), ["A", "B"]);
  });
  test(`${label} reversal removes the exact ledger IDs and persists later balances`, () => {
    const {state, actions} = fixture();
    const record = receipt
      ? actions.createPaymentIn({accountId: "A", customerName: "LOCAL", businessType: "返点收入", amount: 100, handler: "LOCAL", paymentMethod: "现金", time: "2026-10-04 09:00:00"})
      : actions.createPaymentOut({accountId: "A", supplierName: "LOCAL", businessType: "办公费用", amount: 100, handler: "LOCAL", paymentMethod: "现金", time: "2026-10-04 09:00:00"});
    actions.createPaymentIn({accountId: "A", customerName: "LOCAL-LATER", businessType: "返点收入", amount: 10, handler: "LOCAL", paymentMethod: "现金", time: "2026-10-04 11:00:00"});
    const before = structuredClone(state); const snapshot = captureFinanceFacts(state);
    if (receipt) actions.reversePaymentIn(record.id); else actions.reversePaymentOut(record.id);
    const patch = completeFinancePatch(state, snapshot, {stateMerge: {}});
    assert.ok(patch.stateDelete?.settlementLedger?.includes(record.settlementLedgerId!));
    assert.deepEqual(apply(before, patch), facts(state));
  });
}

test("transfer account changes and reversal round-trip every account, ledger and deleted ID", () => {
  const {state, actions} = fixture();
  const transfer = actions.createAccountTransfer({fromAccountId: "A", toAccountId: "B", amount: 100, fee: 5, receivedAmount: 95, handler: "LOCAL", time: "2026-10-04 09:00:00"});
  for (const accountId of ["A", "B", "C"]) actions.createPaymentIn({accountId, customerName: "LOCAL-LATER", businessType: "返点收入", amount: 10, handler: "LOCAL", paymentMethod: "现金", time: "2026-10-04 11:00:00"});
  let before = structuredClone(state); let snapshot = captureFinanceFacts(state);
  const updated = actions.updateAccountTransfer(transfer.id, {fromAccountId: "B", toAccountId: "C", amount: 60, fee: 2, receivedAmount: 58});
  const base = accountTransferMerge(state, updated);
  assert.notDeepEqual(apply(before, {stateMerge: base}), facts(state));
  assert.deepEqual(apply(before, completeFinancePatch(state, snapshot, {stateMerge: base})), facts(state));
  before = structuredClone(state); snapshot = captureFinanceFacts(state);
  const ledgerIds = state.settlementLedger.filter((row) => row.relatedDocNo === transfer.id).map((row) => row.id).sort();
  const financeIds = state.financeLedger.filter((row) => row.relatedId === transfer.id).map((row) => row.id).sort();
  const reversed = actions.reverseAccountTransfer(transfer.id);
  const patch = completeFinancePatch(state, snapshot, {stateMerge: accountTransferMerge(state, reversed)});
  assert.deepEqual(patch.stateDelete?.settlementLedger?.sort(), ledgerIds);
  assert.deepEqual(patch.stateDelete?.financeLedger?.sort(), financeIds);
  assert.deepEqual(apply(before, patch), facts(state));
});
