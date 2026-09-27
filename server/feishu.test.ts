import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFeishuMarketQuotePriceChangedMessage,
  buildFeishuSalesInvoiceMessage,
  notifyFeishuDailyReport,
  notifyFeishuMarketQuotePriceChanged,
  notifyFeishuSalesInvoiceCreated,
  splitFeishuDailyText,
} from "./feishu.ts";
import type { SalesInvoice } from "../src/types.ts";

const invoice: SalesInvoice = {
  id: "XS-1",
  invoiceNo: "XS-20260726-001",
  date: "2026-07-26 10:30",
  customerName: "测试客户",
  contact: "",
  channel: "微信私域",
  paymentMethod: "微信",
  isPaid: false,
  paidAmount: 1200,
  unpaidAmount: 800,
  needInvoice: false,
  freeShipping: false,
  aftersalesTerms: "店保三个月",
  handleBy: "销售小王",
  items: [
    { inventoryId: "", productId: "P-1", productName: "RTX 4070", sn: "", condition: "出库核验", costPrice: 3000, sellPrice: 4000, profit: 1000, aftersalesTerms: "店保三个月" },
    { inventoryId: "", productId: "P-1", productName: "RTX 4070", sn: "", condition: "出库核验", costPrice: 3000, sellPrice: 4000, profit: 1000, aftersalesTerms: "店保三个月" },
  ],
  totalCount: 2,
  totalCost: 6000,
  totalAmount: 8000,
  totalProfit: 2000,
};

const quotePriceChange = {
  quoteId: "MQ-1",
  productName: "华硕 RTX 4090",
  model: "RTX 4090",
  brand: "NVIDIA",
  previousBuyPrice: 18000,
  nextBuyPrice: 17500,
  previousSellPrice: 19500,
  nextSellPrice: 19200,
  updateTime: "2026-09-03 10:30",
};

test("sales invoice message includes the operational sales fields", () => {
  const message = buildFeishuSalesInvoiceMessage(invoice);
  assert.match(message, /销售单：XS-20260726-001/);
  assert.match(message, /商品：RTX 4070 ×2/);
  assert.match(message, /待收 ¥800\.00/);
});

test("market quote price change message contains both reference prices and direction", () => {
  const message = buildFeishuMarketQuotePriceChangedMessage(quotePriceChange);
  assert.match(message, /行情参考价格变更提醒/);
  assert.match(message, /RTX 4090（NVIDIA） · 下跌/);
  assert.match(message, /回收参考价：¥18,000\.00 → ¥17,500\.00（-¥500\.00）/);
  assert.match(message, /销售参考价：¥19,500\.00 → ¥19,200\.00（-¥300\.00）/);
});

test("sales invoice notification posts Feishu text", async () => {
  let request: { url: string; init?: RequestInit } | null = null;
  const result = await notifyFeishuSalesInvoiceCreated(invoice, {
    webhookUrl: "https://example.test/feishu",
    fetchImpl: async (url, init) => {
      request = { url, init };
      return new Response("{}", { status: 200 });
    },
  });
  assert.deepEqual(result, { sent: true });
  assert.equal(request?.url, "https://example.test/feishu");
  assert.equal(JSON.parse(String(request?.init?.body)).msg_type, "text");
});

test("sales invoice notification is skipped cleanly without a configured webhook", async () => {
  const result = await notifyFeishuSalesInvoiceCreated(invoice, { webhookUrl: "" });
  assert.deepEqual(result, { sent: false, reason: "not_configured" });
});

test("sales invoice notification treats a Feishu business error as a delivery failure", async () => {
  const result = await notifyFeishuSalesInvoiceCreated(invoice, {
    webhookUrl: "https://example.test/feishu",
    fetchImpl: async () => new Response(JSON.stringify({ code: 19022, msg: "webhook unavailable" }), { status: 200 }),
  });
  assert.deepEqual(result, { sent: false, reason: "delivery_failed" });
});

test("market quote price notification reuses the existing sales webhook", async () => {
  let request: { url: string; init?: RequestInit } | null = null;
  const result = await notifyFeishuMarketQuotePriceChanged(quotePriceChange, {
    webhookUrl: "https://example.test/feishu",
    fetchImpl: async (url, init) => {
      request = { url, init };
      return new Response("{}", { status: 200 });
    },
  });
  assert.deepEqual(result, { sent: true });
  assert.equal(request?.url, "https://example.test/feishu");
  const body = JSON.parse(String(request?.init?.body));
  assert.equal(body.msg_type, "text");
  assert.match(body.content.text, /价格发生变化/);
});

test("market quote price notification does not send an empty batch", async () => {
  let called = false;
  const result = await notifyFeishuMarketQuotePriceChanged([], {
    webhookUrl: "https://example.test/feishu",
    fetchImpl: async () => {
      called = true;
      return new Response("{}", { status: 200 });
    },
  });
  assert.deepEqual(result, { sent: false, reason: "no_changes" });
  assert.equal(called, false);
});

test("daily report posts to its own webhook", async () => {
  let request: { url: string; init?: RequestInit } | null = null;
  const result = await notifyFeishuDailyReport("日报正文", {
    webhookUrl: "https://example.test/daily-report",
    fetchImpl: async (url, init) => {
      request = { url, init };
      return new Response("{}", { status: 200 });
    },
  });
  assert.deepEqual(result, { sent: true });
  assert.equal(request?.url, "https://example.test/daily-report");
  assert.equal(JSON.parse(String(request?.init?.body)).content.text, "日报正文");
});

test("daily report splitter preserves lines and bounds each Feishu chunk", () => {
  const chunks = splitFeishuDailyText(["标题", "商品明细", "A".repeat(8), "B".repeat(8)].join("\n"), 12);
  assert.deepEqual(chunks, ["标题\n商品明细", "AAAAAAAA", "BBBBBBBB"]);
  assert.ok(chunks.every((chunk) => chunk.length <= 12));
});
