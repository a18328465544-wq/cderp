import assert from "node:assert/strict";
import test from "node:test";
import type {PurchaseListItem} from "@/src/types/purchase";
import {defaultPurchaseListFilters, parsePurchaseListFilters, purchaseListFiltersToSearch, selectPurchaseList} from "./purchase.filters";

const items: PurchaseListItem[] = [
  {id: "P-1", invoiceNo: "JH-20260808-001", date: "2026-08-08", supplierName: "华南同行", sourceType: "同行拿货", totalCount: 5, totalCost: 5000, estTotalSell: 6500, estTotalProfit: 1500, paymentStatus: "部分付款", handleBy: "采购甲", inventoryCount: 5, hasImages: true, productSummary: "RTX 4090", searchText: "jh-20260808-001 华南同行 同行拿货 采购甲 rtx 4090"},
  {id: "P-2", invoiceNo: "JH-20260807-001", date: "2026-08-07", supplierName: "张先生", sourceType: "个人回收", totalCount: 2, totalCost: 1200, estTotalSell: 1800, estTotalProfit: 600, paymentStatus: "已付款", handleBy: "采购乙", inventoryCount: 2, hasImages: false, productSummary: "RTX 3070", searchText: "jh-20260807-001 张先生 个人回收 采购乙 rtx 3070"},
  {id: "P-3", invoiceNo: "JH-20260806-001", date: "2026-08-06", supplierName: "北方同行", sourceType: "同行拿货", totalCount: 1, totalCost: 900, estTotalSell: 1100, estTotalProfit: 200, paymentStatus: "未付款", handleBy: "采购甲", inventoryCount: 0, hasImages: false, productSummary: "GTX 1660", searchText: "jh-20260806-001 北方同行 同行拿货 采购甲 gtx 1660"},
];

test("purchase list URL filters round-trip without serializing defaults", () => {
  const filters = {...defaultPurchaseListFilters, keyword: "4090", sourceType: "同行拿货" as const, paymentStatus: "部分付款" as const, dateStart: "2026-08-01", page: 2, pageSize: 50, sortKey: "totalCount" as const, sortDirection: "asc" as const};
  const search = purchaseListFiltersToSearch(filters).toString();
  assert.deepEqual(parsePurchaseListFilters(`?${search}`), filters);
  assert.equal(purchaseListFiltersToSearch(defaultPurchaseListFilters).toString(), "");
});

test("purchase list filters, sorts, paginates and summarizes the filtered domain items", () => {
  const selection = selectPurchaseList(items, {...defaultPurchaseListFilters, sourceType: "同行拿货", sortKey: "totalCount", sortDirection: "asc", pageSize: 1});
  assert.equal(selection.meta.total, 2);
  assert.equal(selection.data[0]?.id, "P-3");
  assert.equal(selection.summary.unitCount, 6);
  assert.equal(selection.summary.pendingPaymentCount, 2);
  assert.equal(selection.summary.totalCost, 5900);
  assert.equal(selection.summary.estimatedProfit, 1700);
});

test("purchase list keyword and date range use normalized searchable text", () => {
  const selection = selectPurchaseList(items, {...defaultPurchaseListFilters, keyword: "RTX 4090", dateStart: "2026-08-08", dateEnd: "2026-08-08"});
  assert.deepEqual(selection.data.map((item) => item.id), ["P-1"]);
});
