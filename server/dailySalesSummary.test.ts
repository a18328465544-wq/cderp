import assert from "node:assert/strict";
import test from "node:test";
import {createInitialState} from "./store.ts";
import {buildDailySalesSummary, buildRuleDailySalesNarrative, getDailySalesAiNarrative} from "./dailySalesSummary.ts";
import type {CardInventory, ReturnOrder, SalesInvoice} from "../src/types.ts";

function card(overrides: Partial<CardInventory> = {}): CardInventory {
  return {
    id: "I-1",
    productId: "P-1",
    productName: "影驰 RTX 4090 24G",
    category: "显卡",
    model: "RTX 4090",
    brand: "影驰",
    version: "",
    vram: "24G",
    sn: "SN-1",
    sourceType: "同行拿货",
    supplierName: "供应商",
    costPrice: 9000,
    estSellPrice: 11000,
    marketPrice: 11000,
    status: "已售出",
    condition: "99新",
    inWarranty: false,
    repaired: false,
    gpuRisk: false,
    fullBox: true,
    warehouseLocation: "发货区",
    entryTime: "2026-09-01",
    storageDays: 1,
    ...overrides,
  };
}

function invoice(overrides: Partial<SalesInvoice> = {}): SalesInvoice {
  return {
    id: "S-1",
    invoiceNo: "XS-1",
    date: "2026-09-03 10:00",
    customerName: "客户",
    contact: "",
    channel: "微信私域",
    paymentMethod: "微信",
    isPaid: true,
    paidAmount: 10000,
    unpaidAmount: 0,
    needInvoice: false,
    freeShipping: true,
    aftersalesTerms: "店保",
    handleBy: "销售",
    items: [],
    totalCount: 1,
    totalCost: 9000,
    totalAmount: 10000,
    totalProfit: 1000,
    outboundStatus: "已出库",
    outboundTime: "2026-09-03 10:00",
    ...overrides,
  };
}

function baseState() {
  return createInitialState({includeDemoData: false});
}

test("daily sales summary aggregates sold cards by product and exact unit price", () => {
  const state = baseState();
  state.inventory = [
    card({id: "I-1", sn: "SN-1", salesPrice: 10000, salesTime: "2026-09-03 10:00"}),
    card({id: "I-2", sn: "SN-2", salesPrice: 10000, salesTime: "2026-09-03T11:00:00"}),
    card({id: "I-3", sn: "SN-3", salesPrice: 10500, salesTime: "2026-09-03 12:00"}),
    card({id: "I-4", sn: "SN-4", salesPrice: 9900, salesTime: "2026-09-02 12:00"}),
    card({id: "I-5", sn: "SN-5", status: "已入库", salesPrice: 9999, salesTime: "2026-09-03 13:00"}),
  ];
  state.salesInvoices = [invoice({items: [
    {inventoryId: "I-1", productId: "P-1", productName: "影驰 RTX 4090 24G", sn: "SN-1", condition: "99新", costPrice: 9000, sellPrice: 10000, profit: 1000, aftersalesTerms: "店保"},
  ]})];
  const summary = buildDailySalesSummary(state, "2026-09-03", "20:00");
  assert.deepEqual(summary.today, {productCount: 1, quantity: 3, pricedQuantity: 3, amount: 30500, averageUnitPrice: 10166.67, grossProfit: 3500});
  assert.equal(summary.products[0]?.productName, "影驰 RTX 4090 24G");
  assert.deepEqual(summary.products[0]?.priceBreakdown, [
    {unitPrice: 10500, quantity: 1, amount: 10500},
    {unitPrice: 10000, quantity: 2, amount: 20000},
  ]);
  assert.equal(summary.yesterday.quantity, 1);
  assert.equal(summary.comparison.quantityDelta, 2);
  assert.equal(summary.comparison.amountDelta, 20600);
});

test("daily sales summary uses linked invoice data, flags missing prices, and keeps pending orders out of sold facts", () => {
  const state = baseState();
  state.inventory = [
    card({id: "I-1", sn: "SN-1", salesPrice: undefined, salesTime: ""}),
    card({id: "I-2", sn: "SN-2", salesPrice: undefined, salesTime: "2026-09-03 09:00"}),
  ];
  state.salesInvoices = [
    invoice({id: "S-1", invoiceNo: "XS-1", outboundStatus: "已出库", outboundTime: "2026-09-03 08:30", items: [{inventoryId: "I-1", productId: "P-1", productName: "影驰 RTX 4090 24G", sn: "SN-1", condition: "99新", costPrice: 9000, sellPrice: 10000, profit: 1000, aftersalesTerms: "店保"}]}),
    invoice({id: "S-2", invoiceNo: "XS-2", outboundStatus: "待出库", outboundTime: undefined}),
  ];
  const summary = buildDailySalesSummary(state, "2026-09-03", "20:00");
  assert.equal(summary.today.quantity, 2);
  assert.equal(summary.today.pricedQuantity, 1);
  assert.equal(summary.today.amount, 10000);
  assert.equal(summary.products[0]?.unknownPriceQuantity, 1);
  assert.equal(summary.pendingOutboundOrders, 1);
  assert.match(summary.dataQualityIssues.join("；"), /使用销售单出库时间补齐/);
  assert.match(summary.dataQualityIssues.join("；"), /缺少成交单价/);
});

test("daily sales summary includes completed sales returns and readable rule fallback", async () => {
  const state = baseState();
  state.inventory = [card({salesPrice: 10000, salesTime: "2026-09-03 10:00"})];
  const returnOrder: ReturnOrder = {
    id: "R-1", returnNo: "TH-1", type: "销售退货", status: "已完成", date: "2026-09-03 15:00", completedAt: "2026-09-03 15:30",
    relatedDocType: "销售单", relatedDocNo: "XS-1", amount: 10000, settlementMode: "原路退款", handler: "售后", reason: "客户退货", inventoryAction: "退回待检测",
    productName: "影驰 RTX 4090 24G", items: [{sourceInventoryId: "I-1", productName: "影驰 RTX 4090 24G", amount: 10000}],
  };
  state.returnOrders = [returnOrder];
  const summary = buildDailySalesSummary(state, "2026-09-03");
  assert.deepEqual(summary.returns, {orderCount: 1, quantity: 1, amount: 10000, products: [{productName: "影驰 RTX 4090 24G", quantity: 1, amount: 10000}]});
  const narrative = buildRuleDailySalesNarrative(summary, "2026-09-03T20:00:00.000Z");
  assert.equal(narrative.source, "rules");
  assert.match(narrative.headline, /已出库 1 张/);
  assert.match(narrative.attention.join("；"), /销售退货/);
  const resolved = await getDailySalesAiNarrative(summary, {useCache: false});
  assert.equal(resolved.source, "rules");
});
