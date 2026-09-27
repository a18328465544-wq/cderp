import assert from "node:assert/strict";
import test from "node:test";
import {purchaseInvoiceSearchOption} from "./purchase-return.search";
import type {PurchaseInvoice} from "@/src/types/purchase";

test("purchase return order search includes product and document identifiers", () => {
  const option = purchaseInvoiceSearchOption({
    id: "purchase-1",
    invoiceNo: "JH-20260918-001",
    date: "2026-09-18",
    sourceType: "同行拿货",
    supplierName: "成都供应商",
    contact: "13800000000",
    paymentMethod: "现金",
    isPaid: false,
    paidAmount: 0,
    unpaidAmount: 12000,
    handleBy: "郭鑫",
    items: [{productName: "技嘉 RTX 5090", brand: "技嘉", model: "RTX 5090", version: "魔鹰 OC", sn: "SN-4090", buyPrice: 12000} as PurchaseInvoice["items"][number]],
    totalCount: 1,
    totalCost: 12000,
    estTotalSell: 13000,
    estTotalProfit: 1000,
  });

  assert.equal(option.value, "JH-20260918-001");
  assert.match(String(option.label), /成都供应商/);
  assert.match(String(option.description), /技嘉 RTX 5090/);
  assert.match(String(option.searchText), /SN-4090/);
  assert.match(String(option.searchText), /13800000000/);
});
