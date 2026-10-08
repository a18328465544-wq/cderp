import assert from "node:assert/strict";
import test from "node:test";
import type {SalesOutboundInventoryItem, SalesOutboundInvoice} from "@/src/types/sales";
import {inventorySellableStatusValues, inventoryStatuses} from "@/src/types/inventory";
import {canConfirmScannedOutbound, clampOutboundPage, countManualOutboundAvailability, parseOutboundCodes, resolveOutboundInvoice, verifySalesOutbound} from "./sales.outbound";

const inventory: SalesOutboundInventoryItem[] = [
  {id: "KC-1", serialNumber: "SN-1", productId: "P-1", productName: "RTX 4090", productIdentityKey: "P-1", status: "已入库", condition: "99新", warehouse: "A区"},
  {id: "KC-2", serialNumber: "SN-2", productId: "P-1", productName: "RTX 4090", productIdentityKey: "P-1", status: "已上架", condition: "95新", warehouse: "A区"},
];
const invoice: SalesOutboundInvoice = {id: "S-1", invoiceNo: "XS-1", date: "2026-08-09", customerName: "客户", contact: "", totalCount: 2, totalAmount: 20000, freeShipping: true, expressCompany: "", expressNo: "", remarks: "", searchText: "xs-1 客户", lines: [
  {id: "L-1", productId: "P-1", productName: "RTX 4090", productIdentityKey: "P-1", inventoryId: "", serialNumber: "", sellPrice: 10000},
  {id: "L-2", productId: "P-1", productName: "RTX 4090", productIdentityKey: "P-1", inventoryId: "", serialNumber: "", sellPrice: 10000},
]};

test("outbound codes are normalized and duplicates remain visible", () => {
  assert.deepEqual(parseOutboundCodes("KC-1\nSN-2，kc-1"), {codes: ["KC-1", "SN-2"], duplicateCodes: ["kc-1"]});
});

test("scan verification binds each physical inventory card at most once", () => {
  const result = verifySalesOutbound(invoice, inventory, "KC-1\nSN-2");
  assert.equal(result.ready, true);
  assert.equal(result.verifiedCount, 2);
  assert.deepEqual(result.rows.map((row) => row.matchedInventory?.id), ["KC-1", "KC-2"]);
});

test("scanner confirmation requires all matches and no server preflight blockers", () => {
  assert.equal(canConfirmScannedOutbound(verifySalesOutbound(invoice, inventory, "KC-1 SN-2")), true);
  assert.equal(canConfirmScannedOutbound(verifySalesOutbound(invoice, inventory, "KC-1")), false);
  const duplicated = verifySalesOutbound(invoice, inventory, "KC-1 SN-2 kc-1");
  assert.equal(duplicated.verifiedCount, 2);
  assert.equal(canConfirmScannedOutbound(duplicated), false);
  const unknown = verifySalesOutbound(invoice, inventory, "KC-1 SN-2 WRONG-SN");
  assert.equal(unknown.verifiedCount, 2);
  assert.equal(canConfirmScannedOutbound(unknown), false);
});

test("unknown scan codes do not satisfy outbound lines", () => {
  const result = verifySalesOutbound(invoice, inventory, "KC-1\nUNKNOWN");
  assert.equal(result.ready, false);
  assert.equal(result.verifiedCount, 1);
  assert.deepEqual(result.unknownCodes, ["UNKNOWN"]);
});

test("manual availability mirrors inventory sufficiency without creating fake bindings", () => {
  assert.deepEqual(countManualOutboundAvailability(invoice, inventory), {available: 2, expected: 2, ready: true});
  assert.deepEqual(countManualOutboundAvailability(invoice, inventory.slice(0, 1)), {available: 1, expected: 2, ready: false});
});

test("outbound local verification rejects non-sellable stock for bound and model-only lines", () => {
  for (const status of inventoryStatuses.filter((value) => !inventorySellableStatusValues.some((sellable) => sellable === value))) {
    for (const bound of [false, true]) {
      const single = {...invoice, lines: [{...invoice.lines[0]!, inventoryId: bound ? "KC-1" : "", serialNumber: bound ? "SN-1" : ""}]};
      const cards = [{...inventory[0]!, status}];
      assert.equal(verifySalesOutbound(single, cards, "SN-1").verifiedCount, 0, `${status}, bound=${bound}`);
      assert.deepEqual(countManualOutboundAvailability(single, cards), {available: 0, expected: 1, ready: false});
    }
  }
});

test("local legacy binding checks product identity and never reuses a card", () => {
  const boundLine = {...invoice.lines[0]!, inventoryId: "KC-1", serialNumber: "SN-1"};
  const single = {...invoice, lines: [boundLine]};
  const changed = [{...inventory[0]!, productIdentityKey: "P-OTHER"}];
  assert.equal(verifySalesOutbound(single, changed, "SN-1").verifiedCount, 0);
  assert.equal(countManualOutboundAvailability(single, changed).ready, false);
  const duplicate = {...invoice, lines: [boundLine, {...boundLine, id: "L-2"}]};
  const result = verifySalesOutbound(duplicate, inventory, "SN-1");
  assert.equal(result.ready, false);
  assert.equal(result.verifiedCount, 1);
  assert.equal(countManualOutboundAvailability(duplicate, inventory).ready, false);
});

test("local legacy binding accepts the current SN but not a stale invoice SN", () => {
  const single = {...invoice, lines: [{...invoice.lines[0]!, inventoryId: "KC-1", serialNumber: "OLD-SN"}]};
  assert.equal(verifySalesOutbound(single, inventory, "SN-1").ready, true);
  assert.equal(verifySalesOutbound(single, inventory, "KC-1").ready, true);
  assert.equal(verifySalesOutbound(single, inventory, "OLD-SN").verifiedCount, 0);
});

test("stale outbound URL selection never falls back to a different invoice", () => {
  assert.equal(resolveOutboundInvoice([invoice], "missing-invoice"), null);
  assert.equal(resolveOutboundInvoice([invoice], null)?.id, "S-1");
  assert.equal(resolveOutboundInvoice([invoice], "XS-1")?.id, "S-1");
});

test("outbound page is clamped after the pending pool shrinks", () => {
  assert.equal(clampOutboundPage(3, 2), 2);
  assert.equal(clampOutboundPage(0, 0), 1);
});
