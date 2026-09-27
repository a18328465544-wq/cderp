import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReturnFinanceRepairPlan,
  inspectReturnFinancialConsistency,
  type ReturnFinanceStateLike,
} from "./returnFinanceInvariants.ts";

function purchaseReturnState(paymentBusinessType = "采购退款"): ReturnFinanceStateLike {
  const order = {
    id: "TH-1",
    returnNo: "JHTH-20260828-001",
    type: "进货退货",
    status: "已完成",
    settlementMode: "原路退款",
    paymentRecordId: "SK-1",
    refundPaymentRecordIds: ["SK-1"],
    cashReleasedAmount: 1000,
  };
  return {
    returnOrders: [order],
    paymentInRecords: [{
      id: "SK-1",
      accountId: "ACC-1",
      amount: 1000,
      handler: "财务",
      businessType: paymentBusinessType,
      settlementLedgerId: "SL-1",
      financeLedgerId: "FL-1",
      relatedDocType: "退货单",
      relatedDocNo: order.returnNo,
      time: "2026-08-28 10:00:00",
    }],
    paymentOutRecords: [],
    settlementLedger: [{
      id: "SL-1",
      accountId: "ACC-1",
      direction: "收入",
      incomeAmount: 1000,
      expenseAmount: 0,
      changeAmount: 1000,
      businessType: paymentBusinessType,
      relatedDocNo: order.returnNo,
      handler: "财务",
      time: "2026-08-28 10:00:00",
    }],
    financeLedger: [{
      id: "FL-1",
      relatedId: order.returnNo,
      type: paymentBusinessType,
      amount: 1000,
      settlementAccountId: "ACC-1",
      relatedDocType: "退货单",
      handler: "财务",
      time: "2026-08-28 10:00:00",
    }],
  };
}

test("completed purchase return passes the one-to-one finance invariant", () => {
  const issues = inspectReturnFinancialConsistency(purchaseReturnState());
  assert.deepEqual(issues, []);
});

test("legacy purchase return income is reported and only an exact repair is planned", () => {
  const state = purchaseReturnState("其他收入");
  const issues = inspectReturnFinancialConsistency(state);
  assert.ok(issues.some((item) => item.code === "RETURN_LINKED_PAYMENT_WRONG_TYPE"));
  assert.ok(issues.some((item) => item.code === "RETURN_NON_OPERATING_INCOME_LEAK" || item.code === "RETURN_REFUND_MISSING"));

  const repairs = buildReturnFinanceRepairPlan(state);
  assert.deepEqual(repairs, [{
    paymentInId: "SK-1",
    settlementLedgerId: "SL-1",
    financeLedgerId: "FL-1",
    returnId: "TH-1",
    returnNo: "JHTH-20260828-001",
    amount: 1000,
    fromBusinessType: "其他收入",
    toBusinessType: "采购退款",
  }]);

  const unsafe = purchaseReturnState("其他收入");
  unsafe.paymentInRecords = [{...unsafe.paymentInRecords[0], amount: 900}];
  assert.deepEqual(buildReturnFinanceRepairPlan(unsafe), []);

  const mixed = purchaseReturnState("其他收入");
  mixed.returnOrders = [{...mixed.returnOrders[0], cashReleasedAmount: 1900}];
  mixed.paymentInRecords = [
    mixed.paymentInRecords[0],
    {id: "SK-2", accountId: "ACC-1", amount: 900, businessType: "其他收入", relatedDocType: "退货单", relatedDocNo: "JHTH-20260828-001", time: "2026-08-28 10:00:00"},
  ];
  assert.deepEqual(buildReturnFinanceRepairPlan(mixed), []);
});

test("orphaned return refunds are surfaced instead of being silently counted as income", () => {
  const state = purchaseReturnState();
  state.returnOrders = [];
  const issues = inspectReturnFinancialConsistency(state);
  assert.ok(issues.some((item) => item.code === "RETURN_ORPHAN_PAYMENT"));
  assert.ok(issues.some((item) => item.code === "RETURN_ORPHAN_LEDGER"));
});
