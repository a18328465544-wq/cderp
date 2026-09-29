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

test("inventory summary matches a brand and model typed without spaces", () => {
  const item = {...card("已入库"), brand: "技嘉", model: "RTX4090", productName: "技嘉 RTX 4090 魔鹰 24G"};
  assert.equal(matchesInventoryListFilters(item, {category: "显卡", keyword: "技嘉RTX4090"}), true);
  assert.equal(matchesInventoryListFilters(item, {category: "显卡", keyword: "RTX4090 技嘉"}), true);
  assert.equal(matchesInventoryListFilters(item, {category: "显卡", keyword: "华硕RTX4090"}), false);
});

test("inventory keyword uses product identity and keeps GPU model variants distinct", () => {
  const matching = {...card("已入库"), productName: "微星 RTX4090 魔龙 24G", model: "RTX4090", supplierName: "供货商"};
  const otherModel = {...matching, id: "KC-5090", productName: "微星 RTX5090 魔龙 32G", model: "RTX5090", supplierName: "4090 显卡供货商", remarks: "曾询价 4090"};
  const suffixModel = {...matching, id: "KC-4090D", productName: "微星 RTX4090D 魔龙 24G", model: "RTX4090D"};
  assert.equal(matchesInventoryListFilters(matching, {keyword: "4090"}), true);
  assert.equal(matchesInventoryListFilters(otherModel, {keyword: "4090"}), false);
  assert.equal(matchesInventoryListFilters(suffixModel, {keyword: "4090"}), false);
  assert.equal(matchesInventoryListFilters(suffixModel, {keyword: "4090D"}), true);
  assert.equal(matchesInventoryListFilters(otherModel, {supplierName: "4090"}), true);
});

test("inventory identifiers remain searchable without matching unrelated metadata", () => {
  const item = {...card("已入库"), id: "KC-20260929-001", sn: "T4Y4090ABC", expressNo: "SF123456", remarks: "历史型号 4090"};
  assert.equal(matchesInventoryListFilters(item, {keyword: "T4Y4090ABC"}), true);
  assert.equal(matchesInventoryListFilters(item, {keyword: "KC-20260929-001"}), true);
  assert.equal(matchesInventoryListFilters(item, {keyword: "SF123456"}), true);
  assert.equal(matchesInventoryListFilters(item, {keyword: "SF123"}), true);
  assert.equal(matchesInventoryListFilters(item, {keyword: "4090"}), false);
});
