import assert from "node:assert/strict";
import test from "node:test";
import {
  findPurchaseReturnLine,
  findSalesReturnLine,
  insertAtOriginalIndex,
  makePurchaseReturnLineId,
  makeSalesReturnLineId,
  removeReturnRemark,
  sameReturnAmount,
} from "./storeReturnPlanning.ts";
import type {CardInventory, ProductTemplate, PurchaseInvoice, SalesInvoice} from "../src/types.ts";

const product: ProductTemplate = {
  id: "SP-1",
  name: "华硕 RTX 4090 猛禽 24G",
  category: "显卡",
  model: "RTX 4090",
  brand: "华硕",
  version: "猛禽",
  vram: "24G",
  refBuyPrice: 18000,
  refSellPrice: 19500,
  currentStock: 1,
};

const card: CardInventory = {
  id: "KC-1",
  productId: "SP-1",
  productName: product.name,
  category: "显卡",
  model: product.model,
  brand: product.brand,
  version: product.version,
  vram: product.vram,
  sn: "SN-1",
  sourceType: "个人回收",
  supplierName: "客户甲",
  costPrice: 18000,
  estSellPrice: 19500,
  marketPrice: 19000,
  status: "已入库",
  condition: "99新",
  inWarranty: true,
  repaired: false,
  gpuRisk: false,
  fullBox: true,
  warehouseLocation: "A-01",
} as CardInventory;

function salesInvoice(): SalesInvoice {
  return {
    id: "XS-1",
    invoiceNo: "XS-1",
    date: "2026-08-01",
    customerName: "客户甲",
    contact: "13800000000",
    channel: "闲鱼",
    paymentMethod: "微信",
    isPaid: true,
    paidAmount: 19500,
    unpaidAmount: 0,
    needInvoice: false,
    freeShipping: false,
    aftersalesTerms: "",
    handleBy: "老板",
    items: [{
      inventoryId: "KC-1",
      productId: "SP-1",
      productName: product.name,
      sn: "SN-1",
      condition: "99新",
      costPrice: 18000,
      sellPrice: 19500,
      profit: 1500,
      aftersalesTerms: "",
    }],
    totalCount: 1,
    totalCost: 18000,
    totalAmount: 19500,
    totalProfit: 1500,
  };
}

function purchaseInvoice(): PurchaseInvoice {
  return {
    id: "CG-1",
    invoiceNo: "CG-1",
    date: "2026-08-01",
    sourceType: "个人回收",
    supplierName: "客户甲",
    contact: "13800000000",
    paymentMethod: "微信",
    isPaid: true,
    paidAmount: 18000,
    unpaidAmount: 0,
    handleBy: "老板",
    items: [{
      tempId: "line-1",
      productId: "SP-1",
      productName: product.name,
      category: "显卡",
      model: product.model,
      brand: product.brand,
      version: product.version,
      vram: product.vram,
      sn: "SN-1",
      condition: "99新",
      inWarranty: true,
      repaired: false,
      gpuRisk: false,
      fullBox: true,
      buyPrice: 18000,
      estSellPrice: 19500,
      warehouseLocation: "A-01",
    }],
    totalCount: 1,
    totalCost: 18000,
    estTotalSell: 19500,
    estTotalProfit: 1500,
  };
}

test("return line ids prefer physical identity and keep a deterministic legacy fallback", () => {
  assert.equal(makeSalesReturnLineId(salesInvoice().items[0], 0), "inventory:KC-1");
  assert.equal(makePurchaseReturnLineId(purchaseInvoice().items[0], 0), "temp:line-1");
  assert.equal(sameReturnAmount(1.005, 1.009), true);
  assert.equal(sameReturnAmount(1, 1.02), false);
});

test("sales and purchase return line resolution follows id, index, SN and identity fallbacks", () => {
  const sale = salesInvoice();
  const purchase = purchaseInvoice();
  assert.equal(findSalesReturnLine(sale, {sourceSalesItemId: "inventory:KC-1", sourceSalesItemIndex: undefined, sourceInventoryId: undefined, sn: "", amount: 0})?.index, 0);
  assert.equal(findPurchaseReturnLine(purchase, {sourcePurchaseItemId: "", sourcePurchaseItemIndex: undefined, sourceInventoryId: "", sn: "SN-1", amount: 0}, undefined, [product])?.index, 0);
  assert.equal(findPurchaseReturnLine(purchase, {sourcePurchaseItemId: "", sourcePurchaseItemIndex: undefined, sourceInventoryId: "", sn: "", amount: 18000}, card, [product])?.index, 0);
  assert.equal(findSalesReturnLine(sale, {sourceSalesItemId: "", sourceSalesItemIndex: 0, sourceInventoryId: "", sn: "", amount: 19000}), undefined);
});

test("return restoration helpers preserve order and remove only the matching return remark", () => {
  assert.deepEqual(insertAtOriginalIndex(["a", "c"], "b", 1), ["a", "b", "c"]);
  assert.deepEqual(insertAtOriginalIndex(["a"], "b", 99), ["a", "b"]);
  assert.equal(removeReturnRemark("原备注；销售退货，退货单：TH-1；保修", "TH-1"), "原备注；保修");
});
