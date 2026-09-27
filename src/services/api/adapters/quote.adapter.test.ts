import assert from "node:assert/strict";
import test from "node:test";
import {adaptMarketQuoteSnapshot, toMarketQuoteCreateRequest, toMarketQuoteUpdateRequest} from "./quote.adapter";

const response = {data: {marketQuotes: [{id: "MQ-1", productId: "SP-1", productName: "华硕 RTX 4090", model: "RTX 4090", brand: "NVIDIA", refBuyPrice: 18000, refSellPrice: 19500, yestBuyPrice: 17500, changeAmount: 500, changeRatio: 2.86, trend: "up", history: [{date: "08-08", buyPrice: 17500, sellPrice: 19000}, {date: "08-09", buyPrice: 18000, sellPrice: 19500}]}], inventory: [{id: "KC-1", productId: "SP-1", status: "已入库", costPrice: 17000}, {id: "KC-2", productId: "SP-1", status: "已售出", costPrice: 16000}]}};

test("quote adapter maps the product snapshot and active inventory only", () => {
  const result = adaptMarketQuoteSnapshot(response, {showCost: true, showProfit: true});
  assert.equal(result.quotes[0]?.buyPrice, 18000);
  assert.equal(result.quotes[0]?.stockCount, 1);
  assert.equal(result.quotes[0]?.averageStockCost, 17000);
  assert.equal(result.quotes[0]?.history.length, 2);
});

test("quote adapter removes price and history values without permissions", () => {
  const item = adaptMarketQuoteSnapshot(response, {showCost: false, showProfit: false}).quotes[0];
  assert.equal(item?.buyPrice, undefined);
  assert.equal(item?.sellPrice, undefined);
  assert.equal(item?.averageStockCost, undefined);
  assert.equal(item?.history[0]?.buyPrice, undefined);
  assert.equal(item?.history[0]?.sellPrice, undefined);
});

test("quote request adapters do not invent history or product ids", () => {
  const values = {model: " RTX 4090 ", brand: " NVIDIA ", buyPrice: 18000, sellPrice: 19500, trend: "stable" as const, note: " 正常收售 "};
  assert.deepEqual(toMarketQuoteCreateRequest(values, "2026-08-09"), {model: "RTX 4090", brand: "NVIDIA", refBuyPrice: 18000, refSellPrice: 19500, trend: "stable", fluctuation: "正常收售", updateTime: "2026-08-09"});
  assert.deepEqual(toMarketQuoteUpdateRequest(values), {todayBuyPrice: 18000, todaySellPrice: 19500, remarks: "正常收售"});
});
