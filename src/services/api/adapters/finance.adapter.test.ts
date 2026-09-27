import assert from "node:assert/strict";
import test from "node:test";
import {adaptFinanceDashboardDataset, buildFinanceDashboard} from "./finance.adapter";
import type {FinanceDashboardAccess} from "@/src/types/finance";

const fullAccess: FinanceDashboardAccess = {showCost: true, showProfit: true, canViewAccounts: true, canViewSettlementLedger: true, canViewReturns: true};

const response = {data: {
  settlementAccounts: [{id: "A-1", name: "主账户", type: "银行", balance: 100000, availableBalance: 90000, actualBalance: 89500, enabled: true}],
  settlementLedger: [
    {id: "L-1", time: "2026-08-10 09:00", accountName: "主账户", businessType: "销售收款", incomeAmount: 30000, expenseAmount: 0, changeAmount: 30000},
    {id: "L-2", time: "2026-08-10 10:00", accountName: "主账户", businessType: "采购付款", incomeAmount: 0, expenseAmount: 12000, changeAmount: -12000},
    {id: "L-0", time: "2026-08-09 09:00", accountName: "主账户", businessType: "销售收款", incomeAmount: 10000, expenseAmount: 0, changeAmount: 10000},
  ],
  financeLedger: [{status: "待复核"}],
  salesInvoices: [{date: "2026-08-10", outboundTime: "2026-08-10 12:00", outboundStatus: "已出库", totalCost: 20000, totalProfit: 4000, unpaidAmount: 5000}],
  purchaseInvoices: [{date: "2026-08-10", totalCost: 12000, unpaidAmount: 3000}],
  returnOrders: [{date: "2026-08-10", status: "待处理", type: "销售退货", sourceSalesItemSnapshot: {costPrice: 1000}}],
  inventory: [{status: "已入库", costPrice: 20000, entryTime: "2026-08-01"}, {status: "已售出", costPrice: 20000, entryTime: "2026-08-01", salesTime: "2026-08-10"}],
}};

test("finance adapter projects only authorized domain fields", () => {
  const hidden = adaptFinanceDashboardDataset(response, {showCost: false, showProfit: false, canViewAccounts: false, canViewSettlementLedger: false, canViewReturns: false});
  assert.deepEqual(hidden.accounts, []);
  assert.deepEqual(hidden.flows, []);
  assert.deepEqual(hidden.returns, []);
  assert.equal(hidden.sales[0]?.totalCost, undefined);
  assert.equal(hidden.sales[0]?.totalProfit, undefined);
  assert.equal(hidden.inventory[0]?.cost, undefined);
  assert.equal("settlementAccounts" in hidden, false);
});

test("finance view preserves zero versus unavailable and calculates real metrics", () => {
  const dataset = adaptFinanceDashboardDataset(response, fullAccess);
  const view = buildFinanceDashboard(dataset, {startDate: "2026-08-04", endDate: "2026-08-10"}, "2026-08-10");
  assert.equal(view.availableCash, 90000);
  assert.equal(view.todayIncome, 30000);
  assert.equal(view.todayExpense, 12000);
  assert.equal(view.yesterdayIncome, 10000);
  assert.equal(view.receivable, 5000);
  assert.equal(view.payable, 3000);
  assert.equal(view.unreviewed, 1);
  assert.equal(view.accountDifferences, 1);
  assert.equal(view.accountDifferenceAmount, 10500);
  assert.equal(view.pendingReturns, 1);
  assert.equal(view.pendingReturnAmount, 0);
  assert.equal(view.currentPeriod.net, 28000);
  assert.ok(view.exceptions.some((item) => item.id === "unreviewed"));
  assert.ok(view.turnover?.turnover && view.turnover.turnover > 0);
});

test("finance view never presents inaccessible account data as zero", () => {
  const dataset = adaptFinanceDashboardDataset(response, {...fullAccess, canViewAccounts: false, canViewSettlementLedger: false});
  const view = buildFinanceDashboard(dataset, {startDate: "2026-08-10", endDate: "2026-08-10"}, "2026-08-10");
  assert.equal(view.availableCash, undefined);
  assert.equal(view.todayIncome, undefined);
  assert.equal(view.todayExpense, undefined);
  assert.equal(view.healthScore, undefined);
});

test("finance health never reports a healthy score when cash coverage is negative", () => {
  const dataset = adaptFinanceDashboardDataset(response, fullAccess);
  dataset.accounts[0]!.availableBalance = -437376;
  const view = buildFinanceDashboard(dataset, {startDate: "2026-08-04", endDate: "2026-08-10"}, "2026-08-10");
  assert.ok(view.healthScore !== undefined && view.healthScore < 60);
  assert.equal(view.healthRisk, "high");
});
