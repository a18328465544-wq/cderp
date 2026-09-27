import assert from "node:assert/strict";
import test from "node:test";
import type {Express, RequestHandler} from "express";
import {storeDateDiffDays} from "../../src/utils/storeTime.ts";
import {registerOpenApiRoutes, openInventoryItem} from "./openApi.ts";

test("open API routes mount inventory and price routers behind token middleware", () => {
  const mounted: string[] = [];
  const app = {
    use(path: string, ..._handlers: RequestHandler[]) {
      mounted.push(path);
      return this;
    },
  } as unknown as Express;

  registerOpenApiRoutes(app, {
    openApiRateLimiter: (_req, _res, next) => next(),
    requireOpenApiToken: (_req, _res, next) => next(),
    asyncRoute: (handler) => handler,
    reloadStateCollections: async () => undefined,
    getState: () => ({marketQuotes: [], inventory: []}) as never,
    actions: () => ({}) as never,
    notifyMarketQuotePriceChanged: async () => undefined,
    sendApiError: () => undefined,
    paginated: (items) => ({data: items}),
    defaultTenantId: "tenant-default",
    defaultStoreId: "store-default",
  });

  assert.deepEqual(mounted, ["/api/open/inventory", "/api/open/prices"]);
});

test("openInventoryItem returns a stable public inventory projection", () => {
  const row = openInventoryItem({
    id: "inventory-1",
    productId: "product-1",
    productName: "RTX 4090",
    model: "RTX 4090",
    brand: "NVIDIA",
    version: "公版",
    vram: "24G",
    sn: "SN-001",
    sourceType: "门店自采",
    supplierName: "供应商",
    costPrice: 9000,
    estSellPrice: 12000,
    marketPrice: 11800,
    status: "已入库",
    condition: "全新",
    inWarranty: true,
    repaired: false,
    gpuRisk: false,
    fullBox: true,
    warehouseLocation: "A-01",
    entryTime: "2026-09-04",
    storageDays: 0,
  });

  assert.equal(row.id, "inventory-1");
  assert.equal(row.storageDays, storeDateDiffDays("2026-09-04"));
  assert.equal(row.productName, "RTX 4090");
});
