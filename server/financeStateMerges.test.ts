import assert from "node:assert/strict";
import test from "node:test";
import type {AccountTransferRecord, PaymentInRecord, PaymentOutRecord} from "../src/types.ts";
import {accountTransferMerge, paymentInMerge, paymentOutMerge} from "./financeStateMerges.ts";
import {createInitialState} from "./store.ts";

test("paymentInMerge returns linked receipt rows and the related sales invoice", () => {
  const state = createInitialState();
  state.settlementAccounts = [
    {id: "account-main", name: "主账户", type: "银行卡", owner: "测试", platform: "银行", balance: 1200, availableBalance: 1200, frozenAmount: 0, enabled: true, allowNegative: false},
    {id: "account-other", name: "其他账户", type: "现金", owner: "测试", platform: "现金", balance: 0, availableBalance: 0, frozenAmount: 0, enabled: true, allowNegative: false},
  ];
  state.settlementLedger = [{
    id: "settlement-1",
    accountId: "account-main",
    accountName: "主账户",
    accountType: "银行卡",
    direction: "收入",
    incomeAmount: 200,
    expenseAmount: 0,
    changeAmount: 200,
    beforeBalance: 1000,
    afterBalance: 1200,
    businessType: "销售收款",
    handler: "测试",
    createdBy: "测试",
    relatedDocNo: "SO-001",
    time: "2026-09-04 10:00:00",
  }];
  state.financeLedger = [{
    id: "finance-1",
    type: "收入",
    amount: 200,
    paymentWay: "银行卡",
    operator: "测试",
    status: "已复核",
    settlementAccountId: "account-main",
    relatedId: "SO-001",
    time: "2026-09-04 10:00:00",
  }];
  state.salesInvoices = [{
    id: "SO-001",
    invoiceNo: "SO-001",
    customerId: "customer-1",
    customerName: "客户甲",
    date: "2026-09-04",
    status: "已完成",
    totalAmount: 200,
    paidAmount: 200,
    items: [],
  } as never];
  state.customers = [{id: "customer-1", name: "客户甲"} as never];

  const record = {
    id: "receipt-1",
    customerId: "customer-1",
    customerName: "客户甲",
    accountId: "account-main",
    accountName: "主账户",
    amount: 200,
    handler: "测试",
    paymentMethod: "银行卡",
    relatedDocNo: "SO-001",
    time: "2026-09-04 10:00:00",
  } as PaymentInRecord;
  const patch = paymentInMerge(state, record);

  assert.deepEqual(patch.paymentInRecords, [record]);
  assert.deepEqual(patch.settlementAccounts, [state.settlementAccounts[0]]);
  assert.deepEqual(patch.settlementLedger, state.settlementLedger);
  assert.deepEqual(patch.financeLedger, state.financeLedger);
  assert.deepEqual(patch.salesInvoices, state.salesInvoices);
  assert.deepEqual(patch.customers, state.customers);
});

test("paymentOutMerge resolves legacy supplier names when the id is absent", () => {
  const state = createInitialState();
  state.vendors = [{id: "vendor-1", name: "供应商甲"} as never];
  const record = {
    id: "payment-out-1",
    supplierName: " 供应商甲 ",
    customerName: "",
    accountId: "account-main",
    accountName: "主账户",
    amount: 80,
    handler: "测试",
    paymentMethod: "现金",
    businessType: "采购付款",
    time: "2026-09-04 11:00:00",
  } as PaymentOutRecord;

  const patch = paymentOutMerge(state, record);
  assert.deepEqual(patch.paymentOutRecords, [record]);
  assert.deepEqual(patch.vendors, state.vendors);
});

test("accountTransferMerge only returns the two accounts and linked ledger rows", () => {
  const state = createInitialState();
  state.settlementAccounts = [
    {id: "account-from", name: "转出", type: "银行卡", owner: "测试", platform: "银行", balance: 100, availableBalance: 100, frozenAmount: 0, enabled: true, allowNegative: false},
    {id: "account-to", name: "转入", type: "现金", owner: "测试", platform: "现金", balance: 10, availableBalance: 10, frozenAmount: 0, enabled: true, allowNegative: false},
    {id: "account-other", name: "其他", type: "现金", owner: "测试", platform: "现金", balance: 0, availableBalance: 0, frozenAmount: 0, enabled: true, allowNegative: false},
  ];
  state.settlementLedger = [
    {
      id: "transfer-ledger", accountId: "account-from", accountName: "转出", accountType: "银行卡", direction: "转出",
      incomeAmount: 0, expenseAmount: 50, changeAmount: -50, beforeBalance: 100, afterBalance: 50, businessType: "账户调拨",
      handler: "测试", createdBy: "测试", relatedDocNo: "transfer-1", time: "2026-09-04",
    },
    {
      id: "unrelated-ledger", accountId: "account-other", accountName: "其他", accountType: "现金", direction: "支出",
      incomeAmount: 0, expenseAmount: 1, changeAmount: -1, beforeBalance: 1, afterBalance: 0, businessType: "其他支出",
      handler: "测试", createdBy: "测试", relatedDocNo: "other", time: "2026-09-04",
    },
  ];
  state.financeLedger = [
    {id: "transfer-finance", type: "支出", amount: 50, paymentWay: "银行卡", operator: "测试", status: "已复核", settlementAccountId: "account-from", relatedId: "transfer-1", time: "2026-09-04"},
    {id: "unrelated-finance", type: "支出", amount: 1, paymentWay: "现金", operator: "测试", status: "已复核", settlementAccountId: "account-other", relatedId: "other", time: "2026-09-04"},
  ];
  const record = {
    id: "transfer-1",
    fromAccountId: "account-from",
    fromAccountName: "转出",
    toAccountId: "account-to",
    toAccountName: "转入",
    amount: 50,
    fee: 0,
    receivedAmount: 50,
    handler: "测试",
    time: "2026-09-04",
  } as AccountTransferRecord;

  const patch = accountTransferMerge(state, record);
  assert.deepEqual(patch.settlementAccounts, state.settlementAccounts.slice(0, 2));
  assert.deepEqual(patch.settlementLedger, [state.settlementLedger[0]]);
  assert.deepEqual(patch.financeLedger, [state.financeLedger[0]]);
});
