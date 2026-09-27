import assert from "node:assert/strict";
import test from "node:test";
import {createInitialState, createStoreActions} from "./store.ts";

test("commission settlement records one role batch without creating cash movement", () => {
  const state = createInitialState();
  state.purchaseCommissions = [{
    id: "TC-SETTLE-001",
    inventoryId: "INV-001",
    sn: "SN-001",
    productId: "P-001",
    productName: "RTX 5090",
    purchaseInvoiceNo: "JH-001",
    salesInvoiceNo: "XS-001",
    purchaseHandler: "采购小王",
    salesHandler: "销售小李",
    costPrice: 18000,
    salesPrice: 22000,
    grossProfit: 4000,
    rate: 0.1,
    commissionAmount: 400,
    purchaseCommissionAmount: 360,
    salesCommissionAmount: 400,
    status: "待结算",
    createdAt: "2026-08-24 10:00:00",
  }];
  const accountBalances = state.settlementAccounts.map((account) => account.balance);
  const actions = createStoreActions(state, {role: "老板", actor: "老板"});

  const result = actions.settleCommissionRecords("sales", ["TC-SETTLE-001"], "月度销售提成");
  const record = state.purchaseCommissions[0];
  assert.equal(result.count, 1);
  assert.equal(record.salesStatus, "已结算");
  assert.equal(record.purchaseStatus, undefined);
  assert.ok(record.salesSettlementBatchId);
  assert.equal(state.paymentOutRecords.length, 0);
  assert.deepEqual(state.settlementAccounts.map((account) => account.balance), accountBalances);
  assert.equal(state.logs[0]?.module, "员工提成");
  assert.throws(() => actions.settleCommissionRecords("sales", ["TC-SETTLE-001"]), /已结算/);
});
