import assert from "node:assert/strict";
import {test} from "node:test";
import {inferPaymentEntryMode, paymentAmountForMode, paymentEntryFeedback} from "./paymentEntry";

test("credit modes never guess half or forty percent", () => {
  assert.equal(paymentAmountForMode("none", 150, 150), 0);
  assert.equal(paymentAmountForMode("partial", 150, 150), 0);
  assert.equal(paymentAmountForMode("partial", 100, 100), 0);
  assert.equal(paymentAmountForMode("partial", 32, 100), 32);
  assert.equal(paymentAmountForMode("full", 32, 100), 100);
});
test("restored amounts infer intent without overwriting partial or excessive entries", () => {
  assert.equal(inferPaymentEntryMode(0, 0), "full");
  assert.equal(inferPaymentEntryMode(0, 150), "none");
  assert.equal(inferPaymentEntryMode(75, 150), "partial");
  assert.equal(inferPaymentEntryMode(150, 150), "full");
  assert.equal(inferPaymentEntryMode(160, 150), "partial");
});
test("partial payment needs an explicit amount, zero credit remains valid", () => {
  assert.equal(paymentEntryFeedback("partial", 0, 150, "收款").ready, false);
  assert.equal(paymentEntryFeedback("partial", 150, 150, "收款").ready, false);
  assert.equal(paymentEntryFeedback("partial", 75, 150, "收款").ready, true);
  assert.equal(paymentEntryFeedback("none", 0, 150, "付款").ready, true);
});
