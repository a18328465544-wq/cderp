import assert from "node:assert/strict";
import test from "node:test";
import {createInitialState} from "./store.ts";
import {deleteStateMerge, simpleRecordCreateMerge, vendorRecordMerge} from "./partnerStateMerges.ts";

test("deleteStateMerge only returns the latest audit row", () => {
  const state = createInitialState();
  state.logs = [
    {id: "log-1", action: "删除", module: "商品", operator: "测试", time: "2026-09-04"} as never,
    {id: "log-2", action: "创建", module: "商品", operator: "测试", time: "2026-09-03"} as never,
  ];
  assert.deepEqual(deleteStateMerge(state).logs, [state.logs[0]]);
});

test("simpleRecordCreateMerge scopes a create patch to the requested collection", () => {
  const state = createInitialState();
  const record = {id: "customer-1", name: "客户甲"};
  assert.deepEqual(simpleRecordCreateMerge(state, "customers", record).customers, [record]);
});

test("vendorRecordMerge keeps canonical and unique legacy vendor-linked rows", () => {
  const state = createInitialState();
  state.vendors = [{id: "vendor-1", name: "供应商甲"} as never];
  state.inventory = [{id: "inventory-1", supplierName: "供应商甲"} as never];
  state.paymentOutRecords = [{id: "payment-1", supplierId: "vendor-1"} as never];
  state.settlementLedger = [{id: "ledger-1", supplierName: "供应商甲"} as never];
  const vendor = {id: "vendor-1", name: "供应商甲"} as never;
  const patch = vendorRecordMerge(state, vendor);
  assert.deepEqual(patch.vendors, state.vendors);
  assert.deepEqual(patch.inventory, state.inventory);
  assert.deepEqual(patch.paymentOutRecords, state.paymentOutRecords);
  assert.deepEqual(patch.settlementLedger, state.settlementLedger);
});
