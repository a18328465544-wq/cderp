import assert from "node:assert/strict";
import test from "node:test";
import type {CardInventory, ProductTemplate, SystemUserAccount} from "../src/types.ts";
import {storeDateDiffDays} from "../src/utils/storeTime.ts";
import {createInitialState} from "./store.ts";
import {productPriceSyncMerge, productTemplateMerge, sanitizeInventoryRowsForUser} from "./productStateMerges.ts";

const product = {
  id: "product-1",
  name: "RTX 4090",
  category: "显卡",
  model: "RTX 4090",
  brand: "NVIDIA",
  version: "公版",
  vram: "24G",
  refBuyPrice: 10000,
  refSellPrice: 12000,
  currentStock: 1,
} as ProductTemplate;

const inventory = {
  id: "inventory-1",
  productId: product.id,
  productName: product.name,
  category: "显卡",
  model: product.model,
  brand: product.brand,
  version: product.version,
  vram: product.vram,
  sn: "SN-001",
  sourceType: "门店自采",
  supplierName: "供应商",
  costPrice: 9000,
  estSellPrice: 12000,
  marketPrice: 11800,
  status: "已售出",
  condition: "全新",
  inWarranty: true,
  repaired: false,
  gpuRisk: false,
  fullBox: true,
  warehouseLocation: "A-01",
  entryTime: "2026-09-01",
  storageDays: 0,
  salesPrice: 11000,
} as CardInventory;

test("productPriceSyncMerge scopes products, inventory and quotes to one product", () => {
  const state = createInitialState();
  state.products = [product, {...product, id: "product-2", name: "RTX 4080"}];
  state.inventory = [inventory, {...inventory, id: "inventory-2", productId: "product-2"}];
  state.marketQuotes = [
    {id: "quote-1", productId: product.id, model: product.model, productName: product.name, brand: product.brand, refSellPrice: 12000} as never,
    {id: "quote-2", productId: "product-2", model: "RTX 4080", productName: "RTX 4080", brand: "NVIDIA", refSellPrice: 8000} as never,
  ];

  const patch = productPriceSyncMerge(state, product.id);
  assert.deepEqual(patch.products, [product]);
  assert.deepEqual(patch.inventory, [inventory]);
  assert.deepEqual((patch.marketQuotes as Array<{id: string}>).map((quote) => quote.id), ["quote-1"]);
});

test("productTemplateMerge includes only changed products and their sanitized inventory", () => {
  const state = createInitialState();
  state.inventory = [inventory];
  state.marketQuotes = [{id: "quote-1", productId: product.id, model: product.model, productName: product.name, brand: product.brand} as never];
  const user = {id: "staff-1", role: "检测员", enabled: true} as SystemUserAccount;

  const patch = productTemplateMerge(state, product, user);
  assert.deepEqual(patch.products, [product]);
  assert.equal((patch.inventory as CardInventory[])[0]?.storageDays, storeDateDiffDays(inventory.entryTime));
  assert.equal((patch.inventory as CardInventory[])[0]?.costPrice, 0);
  assert.equal((patch.inventory as Array<CardInventory & {actualProfit?: number}>)[0]?.actualProfit, undefined);
  assert.deepEqual(patch.marketQuotes, state.marketQuotes);
});

test("sanitizeInventoryRowsForUser exposes profit only when both cost and profit permissions are present", () => {
  const state = createInitialState();
  const owner = {id: "owner", role: "老板", enabled: true} as SystemUserAccount;
  const [row] = sanitizeInventoryRowsForUser(state, [inventory], owner);
  assert.equal(row?.costPrice, inventory.costPrice);
  assert.equal(row?.actualProfit, 2000);
});
