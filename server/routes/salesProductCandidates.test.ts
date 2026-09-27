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

  assert.deepEqual(receivedQuery, {keyword: "RTX 4080S", activeOnly: true, includeSold: false, sellableOnly: true});
  assert.equal(responseBody?.data?.[0]?.costPrice, 10400);
});
