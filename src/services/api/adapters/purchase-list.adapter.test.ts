import assert from "node:assert/strict";
import test from "node:test";
import {adaptPurchaseListState} from "./purchase.adapter";

function response() {
  return {data: {
    purchaseInvoices: [{
      id: "PUR-1",
      invoiceNo: "JH-20260808-001",
      date: "2026-08-08",
      sourceType: "同行拿货",
      sourcePartnerId: "GY-1",
      sourcePartnerType: "vendor",
      supplierName: "测试供应商",
      isPaid: false,
      paidAmount: 500,
      unpaidAmount: 1500,
      settlementAccountId: "ACC-1",
      paymentStatus: "部分付款",
      handleBy: "采购员",
      images: ["/api/media/assets/IMG-1"],
      totalCount: 2,
      totalCost: 2000,
      estTotalSell: 2600,
      estTotalProfit: 600,
      items: [{tempId: "line-1", productId: "P-1", productName: "RTX 4090", category: "显卡", model: "RTX 4090", brand: "华硕", version: "ROG", vram: "24G", quantity: 2, buyPrice: 1000, estSellPrice: 1300}],
    }],
    inventory: [
      {id: "KC-1", purchaseInvoiceNo: "JH-20260808-001"},
      {id: "KC-2", remarks: "进货单:JH-20260808-001"},
      {id: "KC-X", purchaseInvoiceNo: "JH-X"},
    ],
  }};
}

test("purchase list adapter projects snapshot records into list domain items", () => {
  const result = adaptPurchaseListState(response(), {showCost: true, showProfit: true});
  assert.equal(result.source, "state-snapshot");
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.inventoryCount, 2);
  assert.equal(result.items[0]?.productSummary, "RTX 4090");
  assert.equal(result.items[0]?.hasImages, true);
  assert.equal(result.items[0]?.totalCost, 2000);
  assert.equal(result.items[0]?.estTotalProfit, 600);
  assert.equal(result.items[0]?.unpaidAmount, 1500);
  assert.equal(result.items[0]?.sourcePartnerId, "GY-1");
  assert.equal(result.items[0]?.sourcePartnerType, "vendor");
  assert.equal(result.items[0]?.settlementAccountId, "ACC-1");
});

test("purchase list adapter removes cost and profit fields before feature consumption", () => {
  const result = adaptPurchaseListState(response(), {showCost: false, showProfit: false});
  assert.equal(result.items[0]?.totalCost, undefined);
  assert.equal(result.items[0]?.estTotalSell, undefined);
  assert.equal(result.items[0]?.estTotalProfit, undefined);
  assert.equal(result.items[0]?.searchText.includes("2000"), false);
});
