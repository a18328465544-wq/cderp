import assert from "node:assert/strict";
import test from "node:test";
import {createInitialState, type AppState} from "./store.ts";
import {inspectFinanceReconciliation} from "./financeReconciliation.ts";

function cleanState(): AppState {
  const state = createInitialState({includeDemoData: false, includeCrmDemoData: false});
  state.products = [];
  state.inventory = [];
  state.inspections = [];
  state.purchaseInvoices = [];
  state.salesInvoices = [];
  state.purchaseCommissions = [];
  state.marketQuotes = [];
  state.aftersales = [];
  state.customers = [];
  state.crmFollowUps = [];
  state.crmRequirements = [];
  state.crmQuotes = [];
  state.vendors = [];
  state.logs = [];
  state.accountTransfers = [];
  state.assemblyOperations = [];
  state.returnOrders = [];
  state.customerOrders = [];
  state.settlementAccounts = [{
    id: "SA-1",
    name: "现金",
    type: "现金",
    owner: "门店",
    platform: "线下现金",
    balance: 115,
    availableBalance: 115,
    frozenAmount: 0,
    enabled: true,
    allowNegative: true,
  }];
  state.settlementLedger = [
    {
      id: "SL-2",
      accountId: "SA-1",
      accountName: "现金",
      accountType: "现金",
      direction: "支出",
      incomeAmount: 0,
      expenseAmount: 5,
      changeAmount: -5,
      beforeBalance: 120,
      afterBalance: 115,
      businessType: "采购付款",
      relatedDocNo: "JH-1",
      handler: "老板",
      createdBy: "老板",
      time: "2026-08-01 11:00",
    },
    {
      id: "SL-1",
      accountId: "SA-1",
      accountName: "现金",
      accountType: "现金",
      direction: "收入",
      incomeAmount: 20,
      expenseAmount: 0,
      changeAmount: 20,
      beforeBalance: 100,
      afterBalance: 120,
      businessType: "销售收款",
      relatedDocNo: "XS-1",
      handler: "老板",
      createdBy: "老板",
      time: "2026-08-01 10:00",
    },
  ];
  state.financeLedger = [
    {
      id: "FL-2",
      time: "2026-08-01 11:00",
      relatedId: "JH-1",
      type: "采购付款",
      paymentWay: "微信",
      amount: -5,
      operator: "老板",
      handler: "老板",
      status: "已复核",
      settlementAccountId: "SA-1",
      settlementAccountName: "现金",
      relatedDocType: "采购单",
    },
    {
      id: "FL-1",
      time: "2026-08-01 10:00",
      relatedId: "XS-1",
      type: "销售收入",
      paymentWay: "微信",
      amount: 20,
      operator: "老板",
      handler: "老板",
      status: "已复核",
      settlementAccountId: "SA-1",
      settlementAccountName: "现金",
      relatedDocType: "销售单",
    },
  ];
  state.paymentInRecords = [{
    id: "SK-1",
    customerName: "客户A",
    accountId: "SA-1",
    accountName: "现金",
    amount: 20,
    handler: "老板",
    paymentMethod: "微信",
    businessType: "销售收款",
    settlementLedgerId: "SL-1",
    financeLedgerId: "FL-1",
    relatedDocType: "销售单",
    relatedDocNo: "XS-1",
    time: "2026-08-01 10:00",
  }];
  state.paymentOutRecords = [{
    id: "FK-1",
    supplierName: "供应商A",
    accountId: "SA-1",
    accountName: "现金",
    amount: 5,
    handler: "老板",
    paymentMethod: "微信",
    businessType: "采购付款",
    settlementLedgerId: "SL-2",
    financeLedgerId: "FL-2",
    relatedDocType: "采购单",
    relatedDocNo: "JH-1",
    time: "2026-08-01 11:00",
  }];
  return state;
}

test("clean accounting chains produce a healthy reconciliation report", () => {
  const report = inspectFinanceReconciliation(cleanState(), {now: "2026-08-02T00:00:00.000Z"});
  assert.equal(report.healthy, true);
  assert.equal(report.summary.errorCount, 0);
  assert.equal(report.summary.warningCount, 0);
  assert.equal(report.checks.accountBalanceChains, 1);
  assert.equal(report.checks.paymentLedgerLinks, 2);
  assert.deepEqual(report.issues, []);
});

test("reconciliation exposes payment links, account chains and non-operating leaks", () => {
  const state = cleanState();
  state.paymentInRecords = [{...state.paymentInRecords[0], financeLedgerId: "FL-1", businessType: "其他收入", relatedDocType: "销售单"}];
  state.paymentOutRecords = [{...state.paymentOutRecords[0], financeLedgerId: "missing"}];
  state.financeLedger = state.financeLedger.map((item) => item.id === "FL-1" ? {...item, amount: 999} : item);
  state.settlementLedger = state.settlementLedger.map((item) => item.id === "SL-1" ? {...item, afterBalance: 999} : item);
  const report = inspectFinanceReconciliation(state);
  assert.equal(report.healthy, false);
  assert.ok(report.issues.some((issue) => issue.code === "PAYMENT_FINANCE_LINK_MISSING"));
  assert.ok(report.issues.some((issue) => issue.code === "PAYMENT_NON_OPERATING_DOCUMENT_LINK"));
  assert.ok(report.issues.some((issue) => issue.code === "SETTLEMENT_LEDGER_AFTER_BALANCE_DRIFT"));
  assert.ok(report.issues.some((issue) => issue.code === "PAYMENT_FINANCE_LINK_MISMATCH"));
});

test("return invariants are part of the same report instead of a separate silent path", () => {
  const state = cleanState();
  state.returnOrders = [{
    id: "TH-1",
    returnNo: "JHTH-1",
    type: "进货退货",
    status: "已完成",
    settlementMode: "原路退款",
    paymentRecordId: "SK-RETURN-1",
    refundPaymentRecordIds: ["SK-RETURN-1"],
    cashReleasedAmount: 100,
  } as AppState["returnOrders"][number]];
  state.paymentInRecords.push({
    id: "SK-RETURN-1",
    customerName: "供应商A",
    accountId: "SA-1",
    accountName: "现金",
    amount: 100,
    handler: "老板",
    paymentMethod: "微信",
    businessType: "其他收入",
    relatedDocType: "退货单",
    relatedDocNo: "JHTH-1",
    time: "2026-08-01 12:00",
  });
  const report = inspectFinanceReconciliation(state);
  assert.ok(report.issues.some((issue) => issue.domain === "returns" && issue.code === "RETURN_LINKED_PAYMENT_WRONG_TYPE"));
});

test("voided payment documents are excluded from reconciliation counts and invoice linkage", () => {
  const state = cleanState();
  state.paymentInRecords = [{...state.paymentInRecords[0], accountingStatus: "作废"}];
  const report = inspectFinanceReconciliation(state);
  assert.equal(report.summary.paymentCount, 1);
  assert.equal(report.checks.paymentLedgerLinks, 1);
  assert.equal(report.healthy, true);
});

test("audit persistence can receive the complete issue set while the UI remains bounded", () => {
  const state = cleanState();
  state.paymentInRecords = [{...state.paymentInRecords[0], amount: 0}, {...state.paymentInRecords[0], id: "SK-2", amount: -1}];
  const report = inspectFinanceReconciliation(state, {limit: 1, includeAllIssues: true});
  assert.equal(report.truncated, true);
  assert.equal(report.issues.length, 1);
  assert.ok((report.allIssues?.length || 0) > report.issues.length);
});
