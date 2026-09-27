import assert from "node:assert/strict";
import test from "node:test";
import {createSettlementLedgerHelpers} from "./storeSettlementLedger.ts";
import type {FinanceLedger, PaymentInRecord, SettlementAccount, SettlementLedger} from "../src/types.ts";

function account(overrides: Partial<SettlementAccount> = {}): SettlementAccount {
  return {
    id: "SA-1",
    name: "现金",
    type: "现金",
    owner: "门店",
    platform: "线下现金",
    balance: 100,
    availableBalance: 100,
    frozenAmount: 0,
    enabled: true,
    allowNegative: true,
    lastChangeTime: "2026-08-01 09:00",
    ...overrides,
  };
}

function state() {
  return {
    settlementAccounts: [account()],
    settlementLedger: [] as SettlementLedger[],
    financeLedger: [] as FinanceLedger[],
    paymentInRecords: [] as PaymentInRecord[],
    paymentOutRecords: [],
  };
}

test("settlement movements update account balance and rebuild running balances", () => {
  const snapshot = state();
  let sequence = 0;
  const helpers = createSettlementLedgerHelpers({
    state: snapshot,
    nowStamp: () => "2026-08-01 10:00",
    genId: (prefix) => `${prefix}-${++sequence}`,
    positiveAmount: (value) => Number(value),
    getActiveRole: () => "老板",
  });

  const income = helpers.recordSettlementMovement({accountId: "SA-1", direction: "收入", amount: 20, businessType: "销售收款", handler: "老板", time: "2026-08-01 10:00"});
  const expense = helpers.recordSettlementMovement({accountId: "SA-1", direction: "支出", amount: 5, businessType: "采购付款", handler: "老板", time: "2026-08-01 11:00"});
  assert.equal(snapshot.settlementAccounts[0].balance, 115);
  assert.equal(income.beforeBalance, 100);
  assert.equal(expense.beforeBalance, 120);
  assert.equal(snapshot.settlementLedger.find((item) => item.id === income.id)?.afterBalance, 120);
  assert.equal(snapshot.settlementLedger.find((item) => item.id === expense.id)?.afterBalance, 115);
});

test("account lookup and finance ledger creation keep the existing validation boundary", () => {
  const snapshot = state();
  const helpers = createSettlementLedgerHelpers({
    state: snapshot,
    nowStamp: () => "2026-08-01 10:00",
    genId: (prefix) => `${prefix}-1`,
    positiveAmount: (value) => Number(value),
    getActiveRole: () => "老板",
  });
  assert.equal(helpers.findSettlementAccount("SA-1").name, "现金");
  assert.throws(() => helpers.findSettlementAccount("missing"), /结算账户不存在/);
  snapshot.settlementAccounts[0].enabled = false;
  assert.throws(() => helpers.findSettlementAccount("SA-1"), /结算账户已停用/);
  const ledger = helpers.createFinanceLedgerForSettlement({type: "销售收入", paymentWay: "微信", amount: 20, operator: "老板", settlementAccountId: "SA-1", settlementAccountName: "现金"});
  assert.equal(ledger.id, "LS-1");
  assert.equal(snapshot.financeLedger[0], ledger);
});

test("payment ledger lookups prefer explicit links and only fall back to unique matches", () => {
  const snapshot = state();
  snapshot.settlementLedger = [{
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
  } as SettlementLedger];
  snapshot.financeLedger = [{
    id: "LS-1",
    time: "2026-08-01 10:00",
    relatedId: "XS-1",
    type: "销售收入",
    paymentWay: "微信",
    amount: 20,
    operator: "老板",
    status: "已复核",
    settlementAccountId: "SA-1",
    settlementAccountName: "现金",
    handler: "老板",
  }];
  const helpers = createSettlementLedgerHelpers({
    state: snapshot,
    nowStamp: () => "2026-08-01 10:00",
    genId: (prefix) => `${prefix}-new`,
    positiveAmount: (value) => Number(value),
    getActiveRole: () => "老板",
  });
  const record = {id: "SK-1", accountId: "SA-1", accountName: "现金", amount: 20, handler: "老板", time: "2026-08-01 10:00", relatedDocNo: "XS-1"} as PaymentInRecord;
  assert.equal(helpers.findPaymentInSettlementLedgerId(record), "SL-1");
  assert.equal(helpers.findPaymentInFinanceLedgerId(record), "LS-1");
  assert.equal(helpers.findPaymentInSettlementLedgerId({...record, settlementLedgerId: "SL-1"}), "SL-1");
  assert.equal(helpers.findPaymentInFinanceLedgerId({...record, financeLedgerId: "LS-1"}), "LS-1");
});
