import assert from "node:assert/strict";
import test from "node:test";
import { createInitialState } from "./store.ts";
import { beforeCutoff, buildDailyBusinessReport, buildFeishuDailyAiSummaryMessage, buildFeishuDailyBusinessReportMessage } from "./dailyReport.ts";
import { buildDailySalesSummary, buildRuleDailySalesNarrative } from "./dailySalesSummary.ts";

test("daily report separates sales orders from actual outbound profit and respects cutoff", () => {
  const state = createInitialState();
  state.purchaseInvoices = [{ id: "P1", invoiceNo: "JH-1", date: "2026-07-28", sourceType: "个人回收", supplierName: "卖家", contact: "", paymentMethod: "现金", isPaid: true, paidAmount: 2000, unpaidAmount: 0, handleBy: "采购", items: [], totalCount: 1, totalCost: 2000, estTotalSell: 2500, estTotalProfit: 500 }];
  state.salesInvoices = [{ id: "S1", invoiceNo: "XS-1", date: "2026-07-28 19:00", customerName: "客户", contact: "", channel: "到店", paymentMethod: "现金", isPaid: true, paidAmount: 3000, unpaidAmount: 0, needInvoice: false, freeShipping: true, aftersalesTerms: "店保", handleBy: "销售", outboundStatus: "待出库", items: [], totalCount: 1, totalCost: 2000, totalAmount: 3000, totalProfit: 1000 }];
  state.inventory = [{ id: "I1", productId: "P1", productName: "RTX", category: "显卡", model: "RTX", brand: "", version: "", vram: "", sn: "SN1", sourceType: "个人回收", supplierName: "卖家", purchaseInvoiceNo: "JH-1", entryTime: "2026-07-28", storageDays: 0, status: "已售出", condition: "99新", inWarranty: false, repaired: false, gpuRisk: false, fullBox: false, costPrice: 2000, estSellPrice: 2500, marketPrice: 2500, warehouseLocation: "A", salesPrice: 3200, salesTime: "2026-07-28 19:30" }];
  state.settlementLedger = [{ id: "L1", time: "2026-07-28 19:30", accountId: "A", accountName: "现金", accountType: "现金", direction: "收入", incomeAmount: 3200, expenseAmount: 0, changeAmount: 3200, beforeBalance: 0, afterBalance: 3200, businessType: "销售收款", handler: "销售", createdBy: "销售" }];
  const report = buildDailyBusinessReport(state, "2026-07-28", "20:00");
  assert.equal(report.salesOrderAmount, 3000);
  assert.equal(report.outboundAmount, 3200);
  assert.equal(report.realizedGrossProfit, 1200);
  assert.equal(report.cashIncome, 3200);
  assert.match(buildFeishuDailyBusinessReportMessage(report), /截至 20:00/);
});

test("daily report appends read-only AI suggestions with their evidence", () => {
  const report = buildDailyBusinessReport({
    purchaseInvoices: [], salesInvoices: [], inventory: [], settlementLedger: [], settlementAccounts: [], returnOrders: [],
  } as any, "2026-07-29", "20:00");
  const text = buildFeishuDailyAiSummaryMessage(report, {
    source: "ai",
    generatedAt: "2026-07-29T20:00:00.000Z",
    expiresAt: "2026-07-29T20:15:00.000Z",
    model: "deepseek-v4-flash",
    insights: [{ id: "ai-1", label: "库存积压", title: "RTX 3090 已压货 47 天", detail: "建议降价 ¥300 出货", severity: "high", actionLabel: "去处理", actionTab: "inventory", evidence: ["库龄 47 天"], confidence: 90 }],
  });
  assert.match(text, /AI 经营总结/);
  assert.match(text, /RTX 3090 已压货 47 天/);
  assert.match(text, /建议仅供经营决策参考/);
});

test("daily report includes the server-computed product and unit-price summary", () => {
  const state = createInitialState({includeDemoData: false});
  state.inventory = [{
    id: "I-1", productId: "P-1", productName: "RTX 4090", category: "显卡", model: "RTX 4090", brand: "", version: "", vram: "24G", sn: "SN-1",
    sourceType: "同行拿货", supplierName: "供应商", costPrice: 9000, estSellPrice: 11000, marketPrice: 11000, status: "已售出", condition: "99新", inWarranty: false,
    repaired: false, gpuRisk: false, fullBox: true, warehouseLocation: "发货区", entryTime: "2026-09-03", storageDays: 0, salesPrice: 10000, salesTime: "2026-09-03 10:00",
  }];
  const report = buildDailyBusinessReport(state, "2026-09-03");
  const summary = buildDailySalesSummary(state, "2026-09-03");
  const text = buildFeishuDailyAiSummaryMessage(report, {source: "rules", generatedAt: "2026-09-03T20:00:00.000Z", expiresAt: "2026-09-03T20:15:00.000Z", insights: []}, {summary, narrative: buildRuleDailySalesNarrative(summary, "2026-09-03T20:00:00.000Z")});
  assert.match(text, /今日销售总结/);
  assert.match(text, /RTX 4090/);
  assert.match(text, /¥10,000 ×1/);
});

test("daily report cutoff accepts unpadded local hours and rejects invalid timestamps", () => {
  assert.equal(beforeCutoff("2026-09-03 9:05", "2026-09-03", "20:00"), true);
  assert.equal(beforeCutoff("2026-09-03 20:01", "2026-09-03", "20:00"), false);
  assert.equal(beforeCutoff("2026-09-03 25:00", "2026-09-03", "20:00"), false);
});
