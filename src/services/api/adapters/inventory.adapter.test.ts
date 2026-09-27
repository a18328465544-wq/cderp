import assert from "node:assert/strict";
import test from "node:test";
import {adaptInventoryItem, adaptInventoryJourney, adaptInventoryModelSummaries, adaptInventoryPage, adaptInventorySummary} from "./inventory.adapter";
import {storeDateAfterDays} from "@/src/utils/storeTime";

test("inventory adapter respects cost and profit permissions", () => {
  const row = adaptInventoryItem({id: "KC-1", productName: "RTX 4090", sn: "SN-1", status: "已入库", costPrice: 100, estSellPrice: 150, storageDays: 8}, {showCost: false, showProfit: true});
  assert.equal(row.serialNumber, "SN-1");
  assert.equal(row.costPrice, undefined);
  assert.equal(row.estimatedProfit, undefined);
  assert.equal(row.inventoryStatus, "已入库");
});

test("inventory adapter derives age from entry date instead of a stale snapshot", () => {
  const row = adaptInventoryItem({id: "KC-AGE", productName: "RTX 4090", status: "已入库", entryTime: storeDateAfterDays(-7), storageDays: 0}, {showCost: true, showProfit: true});
  assert.equal(row.inventoryDays, 7);
});

test("inventory page adapter preserves server pagination metadata", () => {
  const page = adaptInventoryPage({data: [{id: "KC-1", productName: "RTX 4090", status: "待检测"}], meta: {page: 2, pageSize: 20, total: 41}}, {showCost: true, showProfit: true});
  assert.equal(page.data.length, 1);
  assert.deepEqual(page.meta, {page: 2, pageSize: 20, total: 41});
});

test("inventory journey adapter preserves sold outcome and drops malformed records", () => {
  const journey = adaptInventoryJourney({data: {
    card: {id: "KC-1", productName: "RTX 4070", sn: "SN-1", status: "已售出", salesPrice: 3100, actualProfit: 300},
    sale: {documentNo: "XS-1", customerName: "晴天", sellPrice: 3100, grossProfit: 300, grossMargin: 9.68},
    inspections: [{id: "I-1", resultStatus: "通过"}, null, {resultStatus: "缺少 ID"}],
    events: [{id: "sale-1", type: "sale", title: "销售出库", occurredAt: "2026-08-28 15:04", partyName: "晴天"}, {id: "bad", type: "unknown", title: "库存", occurredAt: "2026-08-27"}],
    dataQuality: {complete: true, missing: [], legacy: false},
    generatedAt: "2026-08-28 15:05:00",
  }}, {showCost: true, showProfit: true});

  assert.equal(journey.card.inventoryStatus, "已售出");
  assert.equal(journey.card.actualProfit, 300);
  assert.equal(journey.sale?.customerName, "晴天");
  assert.equal(journey.inspections.length, 1);
  assert.deepEqual(journey.events.map((event) => event.type), ["inventory", "sale"]);
});

test("inventory summary adapter aggregates server rows", () => {
  const summary = adaptInventorySummary({data: [{totalCount: 2, availableCount: 1, pendingCount: 1, lockedCount: 0, soldCount: 0, totalCost: 300, totalEstSell: 400}, {totalCount: 1, availableCount: 1, pendingCount: 0, lockedCount: 1, soldCount: 0, totalCost: 200, totalEstSell: 260}]}, {showCost: true, showProfit: true});
  assert.deepEqual(summary, {totalCount: 3, availableCount: 2, pendingCount: 1, lockedCount: 1, soldCount: 0, totalCost: 500, totalEstSell: 660});
});

test("inventory model adapter preserves grouping and redacts cost/profit", () => {
  const rows = adaptInventoryModelSummaries({data: [{key: "显卡::RTX 4090", productName: "华硕 RTX 4090", category: "显卡", brand: "华硕", model: "RTX 4090", version: "猛禽", vram: "24G", warehouseLocation: "A区-01、B区-02", warehouseLocations: ["A区-01", "B区-02"], totalCount: 5, availableCount: 4, pendingCount: 1, lockedCount: 0, soldCount: 0, repairCount: 0, totalCost: 50000, totalEstSell: 60000, avgCost: 10000, avgEstSell: 12000, lastEntryTime: "2026-08-16T10:00:00.000Z"}]}, {showCost: false, showProfit: true});
  const row = rows[0];
  assert.ok(row);
  assert.equal(rows.length, 1);
  assert.equal(row.key, "显卡::RTX 4090");
  assert.equal(row.totalCount, 5);
  assert.equal(row.warehouseLocations.length, 2);
  assert.equal(row.totalCost, undefined);
  assert.equal(row.avgCost, undefined);
  assert.equal(row.estimatedProfit, undefined);
  assert.equal(row.totalEstSell, 60000);
});
