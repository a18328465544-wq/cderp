import assert from "node:assert/strict";
import test from "node:test";
import {quotesApi} from "./quotes";

test("quote list reads the dedicated market quote snapshot", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.equal(input, "/api/market-quotes");
    return new Response(JSON.stringify({
      data: {
        marketQuotes: [{
          id: "MQ-1",
          productId: "SP-1",
          model: "RTX 4090",
          brand: "NVIDIA",
          refBuyPrice: 18000,
          refSellPrice: 19500,
          trend: "stable",
          updateTime: "2026-08-31",
        }],
        inventory: [],
      },
    }), {status: 200, headers: {"Content-Type": "application/json"}});
  };
  try {
    const result = await quotesApi.list({showCost: true, showProfit: true});
    assert.equal(result.quotes.length, 1);
    assert.equal(result.quotes[0]?.id, "MQ-1");
    assert.equal(result.quotes[0]?.sellPrice, 19500);
  } finally {globalThis.fetch = previousFetch;}
});

test("quote update uses the existing PATCH contract and never sends fake history", async () => {
  const previousFetch = globalThis.fetch;
  let body = "";
  globalThis.fetch = async (input, init) => {
    assert.equal(input, "/api/market-quotes/MQ-1");
    assert.equal(init?.method, "PATCH");
    body = String(init?.body || "");
    return new Response(JSON.stringify({data: {id: "MQ-1", model: "RTX 4090", brand: "NVIDIA", todayBuyPrice: 18000, todaySellPrice: 19500}}), {status: 200, headers: {"Content-Type": "application/json"}});
  };
  try {
    await quotesApi.update("MQ-1", {model: "RTX 4090", brand: "NVIDIA", buyPrice: 18000, sellPrice: 19500, trend: "up", note: "上涨"}, {showCost: true, showProfit: true});
    assert.deepEqual(JSON.parse(body), {todayBuyPrice: 18000, todaySellPrice: 19500, remarks: "上涨"});
    assert.equal(JSON.parse(body).history, undefined);
  } finally {globalThis.fetch = previousFetch;}
});

test("quote import keeps the real array envelope", async () => {
  const previousFetch = globalThis.fetch;
  let body = "";
  globalThis.fetch = async (input, init) => {assert.equal(input, "/api/market-quotes/import"); body = String(init?.body || ""); return new Response(JSON.stringify({data: {created: 1, updated: 0, skipped: 0}}), {status: 201, headers: {"Content-Type": "application/json"}});};
  try {
    const result = await quotesApi.importRows([{model: "RTX 4090", brand: "NVIDIA", buyPrice: 18000, sellPrice: 19500, trend: "stable", note: "", sourceLine: 1}]);
    assert.equal(JSON.parse(body).quotes.length, 1);
    assert.equal(JSON.parse(body).quotes[0].history, undefined);
    assert.equal(result.created, 1);
  } finally {globalThis.fetch = previousFetch;}
});
