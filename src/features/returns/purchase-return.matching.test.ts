import assert from "node:assert/strict";
import test from "node:test";
import {matchPurchaseCardsToLines} from "./purchase-return.matching";
import {createProductIdentityIndex} from "@/src/utils/productIdentity";
import type {CardInventory} from "@/src/types/core";
import type {PurchaseInvoice} from "@/src/types/purchase";

const invoice: PurchaseInvoice = {
  id: "purchase-1",
  invoiceNo: "JH-1",
  date: "2026-09-18",
  sourceType: "同行拿货",
  supplierName: "供应商",
  contact: "",
  paymentMethod: "现金",
  isPaid: true,
  paidAmount: 3200,
  unpaidAmount: 0,
  handleBy: "操作人",
  items: [
    {tempId: "line-1", productId: "SP-063", productName: "七彩虹 RTX5060Ti Ultra W OC 16G", brand: "七彩虹", model: "RTX5060Ti", version: "Ultra W OC", vram: "16G", buyPrice: 3200, estSellPrice: 3500, quantity: 1, sn: "", condition: "95新", inWarranty: false, repaired: false, gpuRisk: false, fullBox: false, warehouseLocation: "待检测区"},
    {tempId: "line-2", productId: "SP-063", productName: "七彩虹 RTX5060Ti Ultra W OC 16G", brand: "七彩虹", model: "RTX5060Ti", version: "Ultra W OC", vram: "16G", buyPrice: 3200, estSellPrice: 3500, quantity: 1, sn: "", condition: "95新", inWarranty: false, repaired: false, gpuRisk: false, fullBox: false, warehouseLocation: "待检测区"},
  ],
  totalCount: 2,
  totalCost: 6400,
  estTotalSell: 7000,
  estTotalProfit: 600,
};

function card(id: string, status: CardInventory["status"]): CardInventory {
  return {
    id,
    productId: "SP-063",
    productName: "七彩虹 RTX5060Ti Ultra W OC 16G",
    brand: "七彩虹",
    model: "RTX5060Ti",
    version: "Ultra W OC",
    vram: "16G",
    sn: "",
    category: "显卡",
    status,
    condition: "95新",
    costPrice: 3200,
    estSellPrice: 3500,
    marketPrice: 3500,
    sourceType: "同行拿货",
    supplierName: "供应商",
    inWarranty: false,
    repaired: false,
    gpuRisk: false,
    fullBox: false,
    warehouseLocation: "A区货架-01",
    entryTime: "2026-09-18",
    storageDays: 0,
    purchaseInvoiceNo: "JH-1",
    remarks: "",
  };
}

test("return matching prefers available duplicate cards over inactive cards", () => {
  const matches = matchPurchaseCardsToLines(invoice, [card("inactive", "已报废"), card("available", "已入库")], createProductIdentityIndex([{id: "SP-063", name: invoice.items[0]!.productName}]), new Set());
  assert.equal(matches[0]?.card?.id, "available");
  assert.equal(matches[0]?.eligible, true);
  assert.equal(matches[1]?.card?.id, "inactive");
  assert.equal(matches[1]?.eligible, false);
});

test("return matching treats an existing return reservation as unavailable", () => {
  const matches = matchPurchaseCardsToLines(invoice, [card("reserved", "已入库"), card("available", "已入库")], createProductIdentityIndex([{id: "SP-063", name: invoice.items[0]!.productName}]), new Set(["reserved"]));
  assert.equal(matches[0]?.card?.id, "available");
  assert.equal(matches[0]?.eligible, true);
  assert.equal(matches[1]?.card?.id, "reserved");
  assert.equal(matches[1]?.eligible, false);
});
