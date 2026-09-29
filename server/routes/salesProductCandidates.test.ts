import assert from "node:assert/strict";
import test from "node:test";
import type {Express, Request, RequestHandler, Response} from "express";
import type {InventorySummaryRow} from "../../src/types.ts";
import {registerSalesProductCandidateRoutes} from "./salesProductCandidates.ts";

test("sales product candidates request sellable-only boolean filters", () => {
  let handlers: RequestHandler[] = [];
  let receivedQuery: unknown;
  let responseBody: any;
  const row: InventorySummaryRow = {
    key: "P-1",
    productId: "P-1",
    productName: "RTX 4080S 测试款",
    category: "显卡",
    brand: "测试品牌",
    model: "RTX 4080S",
    version: "标准版",
    vram: "16G",
    warehouseLocation: "A-01",
    warehouseLocations: ["A-01"],
    totalCount: 1,
    availableCount: 1,
    reservedCount: 0,
    availableForSalesCount: 1,
    pendingCount: 0,
    lockedCount: 0,
    soldCount: 0,
    repairCount: 0,
    totalCost: 10400,
    totalEstSell: 12000,
    avgCost: 10400,
    avgEstSell: 12000,
    lastEntryTime: "2026-08-20",
  };
  const app = {
    get(_path: string, ...registered: RequestHandler[]) {
      handlers = registered;
      return this;
    },
  } as unknown as Express;

  registerSalesProductCandidateRoutes(app, {
    requireMenu: () => (_req, _res, next) => next(),
    getInventorySummary: (_req: Request, query) => {
      receivedQuery = query;
      return [row];
    },
    permissionsForRequest: () => ({showCost: true}),
    storeDateDiffDays: () => 0,
  });

  const request = {query: {keyword: " RTX 4080S "}} as unknown as Request;
  const response = {json(payload: unknown) {responseBody = payload;}} as unknown as Response;
  handlers.at(-1)?.(request, response, () => undefined);

  assert.deepEqual(receivedQuery, {activeOnly: true, includeSold: false, sellableOnly: true});
  assert.equal(responseBody?.data?.[0]?.costPrice, 10400);
});

test("sales candidates match product identity, not the inventory card text, and rank exact models", () => {
  let handler: RequestHandler | undefined;
  let result: any;
  const base: InventorySummaryRow = {
    key: "P-4090", productId: "P-4090", productName: "华硕 RTX4090 猛禽 24G", category: "显卡", brand: "华硕", model: "RTX4090", version: "猛禽", vram: "24G",
    warehouseLocation: "A-01", warehouseLocations: ["A-01"], totalCount: 1, availableCount: 1, reservedCount: 0, availableForSalesCount: 1,
    pendingCount: 0, lockedCount: 0, soldCount: 0, repairCount: 0, totalCost: 1, totalEstSell: 2, avgCost: 1, avgEstSell: 2, lastEntryTime: "2026-09-01",
  };
  const rows = [
    {...base, key: "P-5090", productId: "P-5090", productName: "华硕 RTX5090 32G", model: "RTX5090", availableCount: 20, availableForSalesCount: 20},
    {...base, key: "P-4090D", productId: "P-4090D", productName: "华硕 RTX4090D 24G", model: "RTX4090D", availableCount: 10, availableForSalesCount: 10},
    base,
  ];
  registerSalesProductCandidateRoutes({get(_path: string, ...handlers: RequestHandler[]) {handler = handlers.at(-1); return this;}} as unknown as Express, {
    requireMenu: () => (_req, _res, next) => next(),
    getInventorySummary: () => rows,
    permissionsForRequest: () => ({showCost: false}),
    storeDateDiffDays: () => 0,
  });
  handler?.({query: {keyword: "华硕 4090"}} as unknown as Request, {json(payload: unknown) {result = payload;}} as unknown as Response, () => undefined);
  assert.deepEqual(result.data.map((item: {productId: string}) => item.productId), ["P-4090"]);
  assert.equal(result.data[0].costPrice, undefined);
  assert.equal(result.data[0].availableQuantity, 1);
});
