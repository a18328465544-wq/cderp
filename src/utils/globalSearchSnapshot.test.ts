import assert from "node:assert/strict";
import test from "node:test";
import {searchGlobalSnapshot} from "./globalSearchSnapshot";

test("snapshot search finds authorized business records without returning sensitive fields", () => {
  const results = searchGlobalSnapshot({
    products: [{id: "P-1", name: "RTX 4090", category: "显卡", model: "RTX 4090", brand: "华硕", version: "猛禽", vram: "24G", refBuyPrice: 1, refSellPrice: 2, currentStock: 1}],
    inventory: [], inspections: [], purchaseInvoices: [], salesInvoices: [], purchaseCommissions: [], marketQuotes: [], aftersales: [],
    customers: [], vendors: [], crmFollowUps: [], crmRequirements: [], crmQuotes: [], financeLedger: [], settlementAccounts: [], settlementLedger: [],
    paymentInRecords: [], paymentOutRecords: [], accountTransfers: [], assemblyOperations: [], returnOrders: [], returnReservations: [], systemUsers: [], logs: [], currentRole: "店员",
  }, "4090", ["products"]);

  assert.deepEqual(results, [{id: "P-1", kind: "product", title: "RTX 4090", subtitle: "显卡 · 华硕 · RTX 4090 · 猛禽 · 24G", route: "/products", reference: "RTX 4090"}]);
  assert.equal("refBuyPrice" in results[0]!, false);
});

test("snapshot search respects menu permissions", () => {
  const results = searchGlobalSnapshot({
    products: [], inventory: [], inspections: [], purchaseInvoices: [], salesInvoices: [], purchaseCommissions: [], marketQuotes: [], aftersales: [],
    customers: [{id: "C-1", name: "客户 4090", phone: "", wechat: "", source: "", type: "购买客户", lastDealTime: "", totalAmount: 0, totalProfit: 0, buyCount: 0, recycleCount: 0, aftersalesCount: 0, tags: []}],
    vendors: [], crmFollowUps: [], crmRequirements: [], crmQuotes: [], financeLedger: [], settlementAccounts: [], settlementLedger: [], paymentInRecords: [], paymentOutRecords: [],
    accountTransfers: [], assemblyOperations: [], returnOrders: [], returnReservations: [], systemUsers: [], logs: [], currentRole: "店员",
  }, "4090", ["inventory"]);
  assert.deepEqual(results, []);
});

test("snapshot fallback does not turn supplier metadata or a different GPU variant into an inventory hit", () => {
  const snapshot = {
    products: [], inspections: [], purchaseInvoices: [], salesInvoices: [], purchaseCommissions: [], marketQuotes: [], aftersales: [],
    customers: [], vendors: [], crmFollowUps: [], crmRequirements: [], crmQuotes: [], financeLedger: [], settlementAccounts: [], settlementLedger: [],
    paymentInRecords: [], paymentOutRecords: [], accountTransfers: [], assemblyOperations: [], returnOrders: [], returnReservations: [], systemUsers: [], logs: [], currentRole: "店员",
    inventory: [
      {id: "KC-1", productId: "P-5090", productName: "微星 RTX5090 魔龙", model: "RTX5090", supplierName: "4090 供货商", remarks: "曾询价 4090", sn: "SN-5090"},
      {id: "KC-2", productId: "P-4090D", productName: "微星 RTX4090D 魔龙", model: "RTX4090D", sn: "SN-4090D"},
      {id: "KC-3", productId: "P-4090", productName: "微星 RTX4090 魔龙", model: "RTX4090", sn: "SN-4090"},
    ],
  } as Parameters<typeof searchGlobalSnapshot>[0];
  assert.deepEqual(searchGlobalSnapshot(snapshot, "4090", ["inventory"]).map((item) => item.id), ["KC-3"]);
  assert.deepEqual(searchGlobalSnapshot(snapshot, "SN-5090", ["inventory"]).map((item) => item.id), ["KC-1"]);
});
