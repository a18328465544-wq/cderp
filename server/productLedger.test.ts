import assert from "node:assert/strict";
import test from "node:test";
import "../src/utils/inventoryRelations.test.ts";
import type { CardInventory, ProductLedgerRow } from "../src/types.ts";
import { createProductIdentityIndex } from "../src/utils/productIdentity.ts";
import {
  aggregateProductLedgerRows,
  isInventoryCardLinkedToPurchase,
  ledgerItemMatchesSelectedInventoryCards,
} from "./productLedger.ts";

const ledgerRow = (overrides: Partial<ProductLedgerRow> = {}): ProductLedgerRow => ({
  id: "purchase-1-0",
  storeName: "主门店",
  operatedAt: "2026-06-16",
  documentType: "采购入库",
  documentNo: "JH-20260616-001",
  operationType: "增加",
  customerName: "",
  supplierName: "测试供应商",
  quantity: 1,
  unitPrice: 8500,
  amount: 8500,
  createdBy: "测试员工",
  productRemarks: "第一张卡",
  documentRemarks: "整单备注",
  ...overrides,
});

test("同一单据内同一商品的多行库存变动应聚合为一条单据记录", () => {
  const result = aggregateProductLedgerRows([
    ledgerRow(),
    ledgerRow({ id: "purchase-1-1", productRemarks: "第二张卡" }),
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].quantity, 2);
  assert.equal(result[0].unitPrice, 8500);
  assert.equal(result[0].amount, 17000);
  assert.equal(result[0].productRemarks, "第一张卡；第二张卡");
  assert.equal(result[0].documentRemarks, "整单备注");
});

test("不同单据不能被库存明细聚合", () => {
  const result = aggregateProductLedgerRows([
    ledgerRow(),
    ledgerRow({ id: "purchase-2-0", documentNo: "JH-20260616-002" }),
  ]);

  assert.equal(result.length, 2);
});

test("旧库存卡备注中的进货单号应视为已关联采购单", () => {
  const knownInvoiceNos = new Set(["JH-20260616-001"]);

  assert.equal(isInventoryCardLinkedToPurchase({
    purchaseInvoiceNo: "",
    remarks: "进货单:JH-20260616-001；快递单号:自提；显卡待检测入库",
  }, knownInvoiceNos), true);
  assert.equal(isInventoryCardLinkedToPurchase({
    purchaseInvoiceNo: "",
    remarks: "手工新增库存",
  }, knownInvoiceNos), false);
});

const inventoryCard = (overrides: Partial<CardInventory> = {}): CardInventory => ({
  id: "KC-20260616-001001",
  productId: "SP-4090-GIGABYTE",
  productName: "技嘉 RTX4090 Gaming OC 魔鹰 24G",
  category: "显卡",
  model: "RTX4090",
  brand: "技嘉",
  version: "Gaming OC 魔鹰",
  vram: "24G",
  sn: "SN4090",
  sourceType: "同行拿货",
  supplierName: "测试供应商",
  purchaseInvoiceNo: "JH-20260616-001",
  costPrice: 18000,
  estSellPrice: 19500,
  marketPrice: 19000,
  status: "已入库",
  condition: "99新",
  inWarranty: true,
  repaired: false,
  gpuRisk: false,
  fullBox: true,
  warehouseLocation: "A区货架-01",
  entryTime: "2026-06-16",
  storageDays: 0,
  ...overrides,
});

test("库存进出明细不能仅凭同名商品匹配其他单据", () => {
  const matchedCards = [inventoryCard()];

  assert.equal(ledgerItemMatchesSelectedInventoryCards({
    productName: "技嘉 RTX4090 Gaming OC 魔鹰 24G",
  }, matchedCards, "JH-20260616-001"), true);

  assert.equal(ledgerItemMatchesSelectedInventoryCards({
    productName: "技嘉 RTX4090 Gaming OC 魔鹰 24G",
  }, matchedCards, "JH-20260618-003"), false);
});

test("库存进出明细遇到库存 ID / SN 时必须按强身份匹配，不能退回名称兜底", () => {
  const matchedCards = [inventoryCard()];

  assert.equal(ledgerItemMatchesSelectedInventoryCards({
    productId: "SP-OTHER",
    productName: "技嘉 RTX4090 Gaming OC 魔鹰 24G",
  }, matchedCards, "JH-20260616-001"), false);

  assert.equal(ledgerItemMatchesSelectedInventoryCards({
    inventoryId: "KC-20260616-001001",
    productName: "其他名称",
  }, matchedCards, "JH-20260618-003"), true);

  assert.equal(ledgerItemMatchesSelectedInventoryCards({
    sn: "SN4090",
    productName: "其他名称",
  }, matchedCards, "JH-20260618-003"), true);
});

test("库存进出明细的商品 ID 只能在同一关联单据内匹配", () => {
  const matchedCards = [inventoryCard()];

  assert.equal(ledgerItemMatchesSelectedInventoryCards({
    productId: "SP-4090-GIGABYTE",
  }, matchedCards, "JH-20260616-001"), true);

  assert.equal(ledgerItemMatchesSelectedInventoryCards({
    productId: "SP-4090-GIGABYTE",
  }, matchedCards, "JH-20260618-003"), false);

  assert.equal(ledgerItemMatchesSelectedInventoryCards({
    productId: "SP-4090-GIGABYTE",
    productName: "其他名称",
  }, matchedCards, "JH-20260616-001"), false);
});

test("库存进出明细应通过商品模板索引识别 AD OC 与 ADOC 别名", () => {
  const productIdentityIndex = createProductIdentityIndex([
    {
      id: "SP-ADOC",
      name: "七彩虹 RTX4090 iGame Advanced OC 24G",
      category: "显卡",
      model: "RTX4090",
      brand: "七彩虹",
      version: "iGame Advanced OC",
      vram: "24G",
    } as any,
  ]);
  const matchedCards = [
    inventoryCard({
      productId: "SP-OLD-ADOC",
      productName: "七彩虹 RTX4090 AD OC 24G",
      brand: "七彩虹",
      model: "RTX4090",
      version: "AD OC",
      vram: "24G",
      purchaseInvoiceNo: "JH-20260716-001",
    }),
  ];

  assert.equal(ledgerItemMatchesSelectedInventoryCards({
    productId: "SP-ADOC",
    productName: "七彩虹 RTX4090 ADOC 24G",
    brand: "七彩虹",
    model: "RTX4090",
    version: "ADOC",
    vram: "24G",
  }, matchedCards, "JH-20260716-001", productIdentityIndex), true);

  assert.equal(ledgerItemMatchesSelectedInventoryCards({
    productId: "SP-ADOC",
    productName: "七彩虹 RTX4090 ADOC 24G",
    brand: "七彩虹",
    model: "RTX4090",
    version: "ADOC",
    vram: "24G",
  }, matchedCards, "JH-20260717-001", productIdentityIndex), false);
});
