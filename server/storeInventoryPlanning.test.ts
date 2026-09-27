import assert from "node:assert/strict";
import test from "node:test";
import {createInitialState} from "./store.ts";
import {
  buildPendingSalesNeedByProduct,
  buildSellableInventoryStats,
  expandPurchaseItems,
  expandSalesItems,
  lineQuantity,
} from "./storeInventoryPlanning.ts";
import {createProductIdentityIndex} from "../src/utils/productIdentity.ts";

test("lineQuantity normalizes invalid and fractional order quantities", () => {
  assert.equal(lineQuantity(undefined), 1);
  assert.equal(lineQuantity(0), 1);
  assert.equal(lineQuantity(-2), 1);
  assert.equal(lineQuantity(2.8), 2);
});

test("expandPurchaseItems expands physical units and protects SN binding", () => {
  const expanded = expandPurchaseItems([{productName: "RTX 4090", quantity: 2, sn: "", tempId: "line-1"} as never]);
  assert.equal(expanded.length, 2);
  assert.deepEqual(expanded.map((item) => item.tempId), ["line-1-1", "line-1-2"]);
  assert.throws(
    () => expandPurchaseItems([{productName: "RTX 4090", quantity: 2, sn: "SN-001"} as never]),
    /SN.*数量必须为 1/,
  );
});

test("expandSalesItems clears ambiguous stock bindings when quantity is expanded", () => {
  const expanded = expandSalesItems([{productName: "RTX 4090", quantity: 2, inventoryId: "", sn: ""} as never]);
  assert.equal(expanded.length, 2);
  assert.ok(expanded.every((item) => item.quantity === 1 && item.inventoryId === "" && item.sn === ""));
  assert.throws(
    () => expandSalesItems([{productName: "RTX 4090", quantity: 2, inventoryId: "inventory-1"} as never]),
    /库存卡.*数量必须为 1/,
  );
});

test("pending reservations exclude non-sellable cards and stats aggregate sellable cost", () => {
  const state = createInitialState({includeDemoData: false});
  state.products = [{id: "product-1", name: "RTX 4090", model: "RTX 4090", brand: "NVIDIA", version: "公版", vram: "24G"} as never];
  state.inventory = [
    {id: "card-1", productId: "product-1", productName: "RTX 4090", model: "RTX 4090", brand: "NVIDIA", version: "公版", vram: "24G", status: "已入库", costPrice: 9000} as never,
    {id: "card-2", productId: "product-1", productName: "RTX 4090", model: "RTX 4090", brand: "NVIDIA", version: "公版", vram: "24G", status: "已售出", costPrice: 8000} as never,
  ];
  state.salesInvoices = [{
    id: "sales-1",
    status: "待确认",
    outboundStatus: "待出库",
    items: [{productId: "product-1", productName: "RTX 4090", quantity: 1}],
  } as never];
  const identityIndex = createProductIdentityIndex(state.products);
  const pending = buildPendingSalesNeedByProduct(state, identityIndex);
  const stats = buildSellableInventoryStats(state.inventory, identityIndex);
  assert.equal([...pending.values()][0], 1);
  assert.deepEqual([...stats.values()][0], {count: 1, totalCost: 9000});
});
