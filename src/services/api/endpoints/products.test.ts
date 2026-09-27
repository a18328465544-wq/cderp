import assert from "node:assert/strict";
import test from "node:test";
import {ApiError} from "../errors";
import {productsApi} from "./products";

test("product quick-create returns an adapted template and preserves strict DTO fields", async () => {
  const previousFetch = globalThis.fetch;
  let body = "";
  globalThis.fetch = async (input, init) => {
    assert.equal(input, "/api/products");
    body = String(init?.body || "");
    return new Response(JSON.stringify({data: {id: "SP-1", name: "华硕 RTX 4090", category: "显卡", brand: "华硕", model: "RTX 4090", version: "-", vram: "24G", refBuyPrice: 1000, refSellPrice: 1300}}), {status: 201, headers: {"Content-Type": "application/json"}});
  };
  try {
    const result = await productsApi.createTemplate({category: "显卡", brand: "华硕", model: "RTX 4090", version: "", vram: "24G", refBuyPrice: 1000, refSellPrice: 1300, remarks: ""}, true);
    assert.equal(result.id, "SP-1");
    assert.equal(result.category, "显卡");
    assert.deepEqual(JSON.parse(body), {name: "华硕 RTX 4090 24G", category: "显卡", brand: "华硕", model: "RTX 4090", version: "-", vram: "24G", refBuyPrice: 1000, refSellPrice: 1300});
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("product quick-create keeps 403 as an ApiError", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({error: {code: "FORBIDDEN", message: "无商品权限"}}), {status: 403, headers: {"Content-Type": "application/json"}});
  try {
    await assert.rejects(() => productsApi.createTemplate({category: "显卡", brand: "华硕", model: "RTX 4090", version: "", vram: "", refBuyPrice: 0, refSellPrice: 0, remarks: ""}, false), (error: unknown) => error instanceof ApiError && error.status === 403);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("product quick-create redacts reference prices when the account cannot view cost or profit", async () => {
  const previousFetch = globalThis.fetch;
  let body = "";
  globalThis.fetch = async (_input, init) => {
    body = String(init?.body || "");
    return new Response(JSON.stringify({data: {id: "SP-2", name: "华硕 RTX 4090", category: "显卡", brand: "华硕", model: "RTX 4090", version: "-", vram: "24G", refBuyPrice: 1000, refSellPrice: 1300}}), {status: 201, headers: {"Content-Type": "application/json"}});
  };
  try {
    const result = await productsApi.createTemplate({category: "显卡", brand: "华硕", model: "RTX 4090", version: "", vram: "24G", refBuyPrice: 1000, refSellPrice: 1300, remarks: ""}, false, false);
    assert.deepEqual(JSON.parse(body), {name: "华硕 RTX 4090 24G", category: "显卡", brand: "华硕", model: "RTX 4090", version: "-", vram: "24G", refBuyPrice: 0, refSellPrice: 0});
    assert.equal(result.refBuyPrice, undefined);
    assert.equal(result.refSellPrice, undefined);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("product library list consumes the server-paged /api/products projection", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.equal(input, "/api/products?page=1&pageSize=20&category=%E6%98%BE%E5%8D%A1");
    assert.equal(init?.method, undefined);
    return new Response(JSON.stringify({data: {products: [{id: "SP-LIST", name: "微星 RTX 5090", category: "显卡", brand: "微星", model: "RTX 5090", version: "魔龙", vram: "32G", refBuyPrice: 20000, refSellPrice: 23000, currentStock: 3}]}, meta: {page: 1, pageSize: 20, total: 1, summary: {stockedTemplates: 1, stockUnits: 3}, facets: {categories: ["显卡"], brands: ["微星"]}}}), {status: 200, headers: {"Content-Type": "application/json"}});
  };
  try {
    const result = await productsApi.list({keyword: "", category: "显卡", brand: "all", page: 1, pageSize: 20}, [], {showCost: true, showProfit: false});
    assert.equal(result.products[0]?.id, "SP-LIST");
    assert.equal(result.products[0]?.refBuyPrice, 20000);
    assert.equal(result.products[0]?.refSellPrice, undefined);
    assert.equal(result.meta?.summary.stockUnits, 3);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("product library update sends media URLs through the existing request contract", async () => {
  const previousFetch = globalThis.fetch;
  let body = "";
  globalThis.fetch = async (input, init) => {
    assert.equal(input, "/api/products/SP-1");
    assert.equal(init?.method, "PUT");
    body = String(init?.body || "");
    return new Response(JSON.stringify({data: {id: "SP-1", ...JSON.parse(body), currentStock: 1}}), {status: 200, headers: {"Content-Type": "application/json"}});
  };
  try {
    const result = await productsApi.update("SP-1", {category: "显卡", brand: "华硕", model: "RTX 4090", version: "猛禽", vram: "24G", refBuyPrice: 10000, refSellPrice: 12000, remarks: "", imageUrls: ["/api/media/assets/asset-1"]}, {showCost: true, showProfit: true});
    assert.deepEqual(JSON.parse(body).imageUrls, ["/api/media/assets/asset-1"]);
    assert.equal(result.imageUrls[0], "/api/media/assets/asset-1");
  } finally {
    globalThis.fetch = previousFetch;
  }
});
