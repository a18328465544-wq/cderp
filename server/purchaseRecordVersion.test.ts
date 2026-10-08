import assert from "node:assert/strict";
import test from "node:test";
import {createInitialState} from "./store.ts";
import {advancePurchaseVersionsForInventory, purchaseInvoicesForInventory} from "./purchaseRecordVersion.ts";

function fixture() {
  const state = createInitialState({includeDemoData: true});
  assert.ok(state.purchaseInvoices[0]); assert.ok(state.inventory[0]);
  const invoice = {...state.purchaseInvoices[0], id: "PUR-EXACT", invoiceNo: "JH-EXACT", recordVersion: 4};
  const other = {...invoice, id: "PUR-OTHER", invoiceNo: "JH-EXACT9", recordVersion: 8};
  const card = {...state.inventory[0], id: "KC-EXACT", purchaseInvoiceNo: invoice.invoiceNo, remarks: "进货单:JH-EXACT9"};
  return {invoice, other, card};
}

test("purchase revision relations prefer explicit ownership over stale remark text", () => {
  const {invoice, other, card} = fixture();
  assert.deepEqual(purchaseInvoicesForInventory([invoice, other], [card]).map((item) => item.id), [invoice.id]);
  assert.deepEqual(purchaseInvoicesForInventory([invoice, other], [{...card, purchaseInvoiceNo: "UNKNOWN"}]), []);
  assert.deepEqual(purchaseInvoicesForInventory([invoice, other], [{...card, purchaseInvoiceNo: invoice.id}]).map((item) => item.id), [invoice.id]);
});

test("legacy purchase references use exact full document numbers rather than prefixes", () => {
  const {invoice, other, card} = fixture();
  assert.deepEqual(purchaseInvoicesForInventory([invoice, other], [{...card, purchaseInvoiceNo: undefined, remarks: "进货单：JH-EXACT9；旧记录"}]).map((item) => item.id), [other.id]);
  assert.deepEqual(purchaseInvoicesForInventory([invoice, other], [{...card, purchaseInvoiceNo: undefined, remarks: "没有采购归属"}]), []);
});

test("a multi-card command advances each linked purchase once and never creates ghost parents", () => {
  const {invoice, other, card} = fixture();
  const state = {purchaseInvoices: [invoice, other]};
  advancePurchaseVersionsForInventory(state, [card, {...card, id: "KC-SECOND"}, {...card, id: "KC-ORPHAN", purchaseInvoiceNo: "UNKNOWN"}]);
  assert.equal(state.purchaseInvoices[0]!.recordVersion, 5);
  assert.equal(state.purchaseInvoices[1], other);
  const after = state.purchaseInvoices;
  advancePurchaseVersionsForInventory(state, []);
  advancePurchaseVersionsForInventory(state, [{...card, purchaseInvoiceNo: "UNKNOWN"}]);
  assert.equal(state.purchaseInvoices, after);
  assert.equal(invoice.recordVersion, 4, "input snapshots remain unchanged");
});
