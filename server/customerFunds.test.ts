import assert from "node:assert/strict";
import test from "node:test";
import { buildCustomerFundsSnapshot } from "./customerFunds.ts";
import { createInitialState } from "./store.ts";

test("customer funds projection uses archive balances and returns only page-ready data", () => {
  const state = createInitialState();
  state.customers = [{
    id: "KH-1",
    name: "往来客户",
    phone: "13800000001",
    wechat: "",
    source: "测试",
    type: "购买客户",
    lastDealTime: "2026-08-01",
    totalAmount: 1000,
    totalProfit: 100,
    buyCount: 1,
    recycleCount: 0,
    aftersalesCount: 0,
    tags: [],
    receivableBalance: 600,
    payableBalance: 0,
    debtBalance: 600,
  }];
  state.vendors = [{
    id: "GY-1",
    name: "往来同行",
    contactPerson: "张经理",
    phone: "13800000002",
    type: "上游供应商",
    totalBuyAmount: 2000,
    totalCount: 1,
    avgProfit: 0,
    aftersalesCount: 0,
    aftersalesRate: 0,
    lastDealTime: "2026-08-01",
    accountPayable: 800,
    accountReceivable: 300,
    accountPaid: 1200,
    returnCreditBalance: 200,
  }];
  state.purchaseInvoices = [];
  state.salesInvoices = [];
  state.paymentInRecords = [];
  state.paymentOutRecords = [];

  const snapshot = buildCustomerFundsSnapshot(state, {
    today: "2026-08-02",
    startDate: "2026-08-01",
    endDate: "2026-08-02",
    trendStartDate: "2026-08-01",
    trendEndDate: "2026-08-02",
  });

  assert.deepEqual(snapshot.currentBalance, { payable: 800, receivable: 1100, net: 300 });
  assert.equal(snapshot.rows.find((row) => row.partnerId === "GY-1")?.receivable, 500);
  assert.equal(snapshot.rows.some((row) => row.transactions.some((item) => item.label.startsWith("历史应"))), false);
  assert.equal(snapshot.trend.at(-1)?.net, 300);
  assert.equal("paymentInRecords" in snapshot, false);
  assert.equal("paymentOutRecords" in snapshot, false);
});
