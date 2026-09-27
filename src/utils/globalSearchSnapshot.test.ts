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
