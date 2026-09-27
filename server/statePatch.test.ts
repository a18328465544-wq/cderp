import assert from "node:assert/strict";
import test from "node:test";
import { replacedLinkedPaymentDeletePatch } from "./statePatch.ts";

test("invoice payment replacement deletes the old payment and its linked ledgers", () => {
  const patch = replacedLinkedPaymentDeletePatch(
    "paymentOutRecords",
    [{ id: "FK-old", settlementLedgerId: "SL-old", financeLedgerId: "LS-old" }],
    [{ id: "FK-new", settlementLedgerId: "SL-new", financeLedgerId: "LS-new" }],
  );

  assert.deepEqual(patch, {
    paymentOutRecords: ["FK-old"],
    settlementLedger: ["SL-old"],
    financeLedger: ["LS-old"],
  });
});

test("unchanged invoice payments do not create a deletion patch", () => {
  const payment = { id: "FK-keep", settlementLedgerId: "SL-keep", financeLedgerId: "LS-keep" };
  assert.deepEqual(replacedLinkedPaymentDeletePatch("paymentInRecords", [payment], [payment]), {});
});

test("invoice edits also persist deletion of a removed legacy accrual ledger", () => {
  const patch = replacedLinkedPaymentDeletePatch(
    "paymentOutRecords",
    [],
    [],
    [{ id: "LS-legacy-accrual" }],
    [],
  );

  assert.deepEqual(patch, { financeLedger: ["LS-legacy-accrual"] });
});
