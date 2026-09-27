import assert from "node:assert/strict";
import test from "node:test";
import { createInitialState, createStoreActions } from "./store";

test("non-operating payment actions create independent ledger movements and preserve references", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const account = state.settlementAccounts.find(item => item.enabled);
  assert.ok(account);
  const beforeBalance = account.balance;

  const income = actions.createPaymentIn({
    customerName: "平台返款",
    accountId: account.id,
    amount: 520,
    handler: "财务",
    paymentMethod: "微信",
    businessType: "返点收入",
    referenceNo: "PLATFORM-20260802-001",
    images: ["/api/media/assets/IMG-demo"],
    time: "2026-08-02 10:00",
  });
  assert.equal(income.businessType, "返点收入");
  assert.equal(income.referenceNo, "PLATFORM-20260802-001");
  assert.deepEqual(income.images, ["/api/media/assets/IMG-demo"]);
  assert.equal(state.settlementLedger.find(item => item.id === income.settlementLedgerId)?.businessType, "返点收入");
  assert.equal(state.financeLedger.find(item => item.id === income.financeLedgerId)?.type, "返点收入");
  assert.equal(state.settlementAccounts.find(item => item.id === account.id)?.balance, beforeBalance + 520);

  const expense = actions.createPaymentOut({
    supplierName: "京东物流",
    accountId: account.id,
    amount: 80,
    handler: "财务",
    paymentMethod: "微信",
    businessType: "运费支出",
    referenceNo: "LOGISTICS-20260802-001",
    time: "2026-08-02 11:00",
  });
  assert.equal(expense.businessType, "运费支出");
  assert.equal(state.settlementAccounts.find(item => item.id === account.id)?.balance, beforeBalance + 440);
});

test("non-operating categories cannot be attached to business documents", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const account = state.settlementAccounts.find(item => item.enabled);
  assert.ok(account);

  assert.throws(() => actions.createPaymentIn({
    customerName: "错误关联",
    accountId: account.id,
    amount: 100,
    handler: "财务",
    paymentMethod: "微信",
    businessType: "赔偿收入",
    relatedDocNo: "XS-20260802-001",
    time: "2026-08-02 12:00",
  }), /非经营收入不能绑定/);

  assert.throws(() => actions.createPaymentOut({
    supplierName: "错误关联",
    accountId: account.id,
    amount: 100,
    handler: "财务",
    paymentMethod: "微信",
    businessType: "办公费用",
    relatedDocNo: "JH-20260802-001",
    time: "2026-08-02 12:00",
  }), /非经营支出不能绑定/);

  assert.throws(() => actions.createPaymentIn({
    customerName: "手工采购退款",
    supplierName: "错误关联供应商",
    accountId: account.id,
    amount: 100,
    handler: "财务",
    paymentMethod: "微信",
    businessType: "采购退款",
    relatedDocType: "退货单",
    relatedDocNo: "JHTH-20260802-001",
    time: "2026-08-02 12:00",
  }), /采购退款只能由进货退货流程生成/);
});
