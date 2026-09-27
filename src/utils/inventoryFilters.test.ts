import assert from "node:assert/strict";
import test from "node:test";
import type {CardInventory} from "../types";
import {cardStatusValues} from "../types/core";
import {inventoryStatuses} from "../types/inventory";
import {isInventorySellableStatus, matchesInventoryListFilters, normalizeInventoryListFilters} from "./inventoryFilters";

function card(status: CardInventory["status"]): CardInventory {
  return {
    id: `KC-${status}`,
    productId: "P-1",
    productName: "RTX 4080S 测试款",
    category: "显卡",
    model: "RTX 4080S",
    brand: "测试品牌",
    version: "标准版",
    vram: "16G",
    sn: "SN-1",
    sourceType: "门店自采",
    supplierName: "测试供应商",
    costPrice: 10000,
    estSellPrice: 12000,
    marketPrice: 12000,
    status,
    condition: "95新",
    inWarranty: false,
    repaired: false,
    gpuRisk: false,
    fullBox: true,
    warehouseLocation: "A-01",
    entryTime: "2026-08-01",
    storageDays: 0,
  };
}

test("inventory query filters normalize string booleans and numbers", () => {
  assert.deepEqual(normalizeInventoryListFilters({activeOnly: "true", includeSold: "false", sellableOnly: "1", minStorageDays: "7", keyword: " RTX 4080S "}), {
    activeOnly: true,
    includeSold: false,
    sellableOnly: true,
    minStorageDays: 7,
    keyword: "RTX 4080S",
  });
});

test("inventory filter options are the backend CardStatus contract", () => {
  assert.strictEqual(inventoryStatuses, cardStatusValues);
});

test("sellable-only filters exclude pending and sold stock from sales populations", () => {
  assert.equal(isInventorySellableStatus("已入库"), true);
  assert.equal(isInventorySellableStatus("已上架"), true);
  assert.equal(isInventorySellableStatus("待检测"), false);
  assert.equal(matchesInventoryListFilters(card("已售出"), {activeOnly: "true", includeSold: "false"}), false);
  assert.equal(matchesInventoryListFilters(card("待检测"), {sellableOnly: "true"}), false);
  assert.equal(matchesInventoryListFilters(card("已上架"), {sellableOnly: "true"}), true);
});
