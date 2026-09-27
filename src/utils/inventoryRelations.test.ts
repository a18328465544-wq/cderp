import assert from "node:assert/strict";
import test from "node:test";
import {
  getLegacyPurchaseInvoiceNo,
  isInventoryLinkedToPurchase,
  isInventoryLinkedToSales,
} from "./inventoryRelations";

test("inventory purchase relation prefers stable fields and parses legacy remarks exactly", () => {
  const document = { id: "purchase-1", invoiceNo: "JH-20260710-001" };
  assert.equal(isInventoryLinkedToPurchase({ purchaseInvoiceNo: document.invoiceNo }, document), true);
  assert.equal(isInventoryLinkedToPurchase({ purchaseInvoiceNo: document.id }, document), true);
  assert.equal(isInventoryLinkedToPurchase({ remarks: `进货单:${document.invoiceNo}；待检测` }, document), true);
  assert.equal(isInventoryLinkedToPurchase({ remarks: `进货单:${document.invoiceNo}001；待检测` }, document), false);
  assert.equal(getLegacyPurchaseInvoiceNo(`说明；进货单：${document.invoiceNo}；待检测`), document.invoiceNo);
});

test("inventory sales relation does not match document-number prefixes", () => {
  const document = { id: "sales-1", invoiceNo: "XS-20260710-001" };
  assert.equal(isInventoryLinkedToSales({ salesInvoiceId: document.invoiceNo }, document), true);
  assert.equal(isInventoryLinkedToSales({ remarks: `销售单:${document.invoiceNo}` }, document), true);
  assert.equal(isInventoryLinkedToSales({ remarks: `销售单:${document.invoiceNo}9` }, document), false);
});
