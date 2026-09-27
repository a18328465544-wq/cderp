import assert from "node:assert/strict";
import test from "node:test";
import {adaptFinanceAccount, adaptFinanceAccountLedgerPage, adaptFinanceAccountPage, mergeFinanceAccountPages, toFinanceAccountCreateRequest, toFinanceAccountReconcileRequest} from "./finance-account.adapter";
import {summarizeFinanceAccounts} from "@/src/features/finance/finance-account.summary";

test("finance account adapter projects the dedicated account contract", () => {
  const account = adaptFinanceAccount({id: "SA-1", name: "主银行卡", type: "银行卡", owner: "门店", platform: "建行", balance: -300, availableBalance: -350, frozenAmount: 50, enabled: true, allowNegative: true, actualBalance: -280, lastReconciledAt: "2026-08-10 20:00", internalSecret: "hidden"});
  assert.equal(account.name, "主银行卡");
  assert.equal(account.balance, -300);
  assert.equal(account.difference, 20);
  assert.equal("internalSecret" in account, false);
});

test("finance account pages merge without duplicate account ids", () => {
  const first = adaptFinanceAccountPage({data: [{id: "SA-1", name: "现金", type: "现金"}], meta: {total: 2}});
  const second = adaptFinanceAccountPage({data: [{id: "SA-2", name: "微信", type: "微信"}], meta: {total: 2}});
  const merged = mergeFinanceAccountPages([first, second]);
  assert.equal(merged.accounts.length, 2);
  assert.equal(merged.total, 2);
  assert.equal(merged.source, "settlement-accounts-api");
});

test("finance account summary keeps book, available, frozen and reconciliation differences separate", () => {
  const accounts = [
    adaptFinanceAccount({id: "A", name: "A", type: "现金", balance: 100, availableBalance: 80, frozenAmount: 20, actualBalance: 90, enabled: true}),
    adaptFinanceAccount({id: "B", name: "B", type: "微信", balance: -50, availableBalance: -50, frozenAmount: 0, enabled: false}),
  ];
  const summary = summarizeFinanceAccounts(accounts);
  assert.deepEqual(summary, {bookBalance: 50, availableBalance: 30, frozenAmount: 20, enabledCount: 1, disabledCount: 1, reconciledCount: 1, differenceCount: 1, differenceAmount: -10});
});

test("create request preserves V1 zero-balance and negative-balance account semantics", () => {
  assert.deepEqual(toFinanceAccountCreateRequest({name: "  新账户  ", type: "支付宝"}), {name: "新账户", type: "支付宝", owner: "门店", platform: "新账户", balance: 0, availableBalance: 0, frozenAmount: 0, enabled: true, allowNegative: true});
  assert.deepEqual(toFinanceAccountReconcileRequest({actualBalance: -125.5}), {actualBalance: -125.5});
});

test("ledger adapter exposes formal ledger fields without leaking unknown DTO values", () => {
  const page = adaptFinanceAccountLedgerPage({data: [{id: "L-1", accountId: "A", accountName: "现金", accountType: "现金", direction: "收入", businessType: "销售收款", incomeAmount: 800, expenseAmount: 0, changeAmount: 800, beforeBalance: 100, afterBalance: 900, relatedDocType: "销售单", relatedDocNo: "XS-1", customerName: "张先生", handler: "郭鑫", createdBy: "系统", time: "2026-08-10 10:00", internalSecret: "hidden"}], meta: {page: 1, pageSize: 20, total: 1}});
  assert.equal(page.items[0]?.party, "张先生");
  assert.equal(page.items[0]?.incomeAmount, 800);
  assert.equal(page.items[0]?.relatedDocType, "销售单");
  assert.equal(page.items[0]?.changeAmount, 800);
  assert.equal("internalSecret" in (page.items[0] || {}), false);
  assert.equal(page.total, 1);
});
