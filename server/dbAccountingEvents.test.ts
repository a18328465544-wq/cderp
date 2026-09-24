import assert from "node:assert/strict";
import test from "node:test";
import {accountingEventLineId, projectAccountingRecord} from "./dbAccountingEvents.ts";

test("accounting event lines use one deterministic event-level identity", () => {
  assert.equal(accountingEventLineId("AE-1", "total"), "AEL-AE-1-total");
  assert.equal(accountingEventLineId("AE-1", "total"), accountingEventLineId("AE-1", "total"));
  assert.notEqual(accountingEventLineId("AE-1", "total"), accountingEventLineId("AE-2", "total"));
});

test("accounting projection is stable and strips non-accounting payloads", () => {
  const projection = projectAccountingRecord("salesInvoices", {
    id: "XS-1",
    invoiceNo: "XS-20260921-001",
    accountingEventId: "AE-XS-1",
    accountingStatus: "已入账",
    date: "2026-09-21",
    totalAmount: 21900,
    customerId: "CUS-1",
    images: ["should-not-be-copied"],
  });
  assert.ok(projection);
  assert.equal(projection.event.id, "AE-XS-1");
  assert.equal(projection.event.totalAmount, 21900);
  assert.equal(projection.event.sourceNo, "XS-20260921-001");
  assert.equal(projection.line.direction, "income");
  assert.equal("images" in projection.event.payload, false);
});

test("legacy accounting records receive deterministic event ids and posted status", () => {
  const projection = projectAccountingRecord("paymentOutRecords", {
    id: "FK-1",
    amount: "¥ 1,200",
    time: "2026-09-20 12:00:00",
  });
  assert.ok(projection);
  assert.equal(projection.event.id, "AE-legacy-paymentOutRecords-FK-1");
  assert.equal(projection.event.status, "已入账");
  assert.equal(projection.event.totalAmount, 1200);
  assert.equal(projection.event.effectiveDate, "2026-09-20");
});

test("unknown collections do not create accounting events", () => {
  assert.equal(projectAccountingRecord("products", {id: "P-1", totalAmount: 1}), null);
});
