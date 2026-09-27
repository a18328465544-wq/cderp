import assert from "node:assert/strict";
import test from "node:test";
import {adaptFinanceAccountLedgerPage} from "@/src/services/api/adapters/finance-account.adapter";
import {summarizeFinanceLedgerPage} from "./finance-ledger.summary";

test("ledger summary explicitly summarizes the loaded page", () => {
  const page = adaptFinanceAccountLedgerPage({data: [
    {id: "I", accountId: "A", accountName: "现金", direction: "收入", businessType: "销售收款", incomeAmount: 100, expenseAmount: 0, changeAmount: 100, beforeBalance: 0, afterBalance: 100, relatedDocNo: "XS-1", handler: "郭鑫"},
    {id: "O", accountId: "B", accountName: "微信", direction: "支出", businessType: "其他支出", incomeAmount: 0, expenseAmount: 30, changeAmount: -30, beforeBalance: 20, afterBalance: -10, handler: "未记录"},
  ], meta: {total: 99}});
  assert.deepEqual(summarizeFinanceLedgerPage(page.items), {income: 100, expense: 30, net: 70, accountCount: 2, anomalyCount: 1});
  assert.equal(page.total, 99);
});
