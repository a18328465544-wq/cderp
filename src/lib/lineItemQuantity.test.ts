import assert from "node:assert/strict";
import test from "node:test";
import {editableQuantityValue, quantityFromInput, stepQuantity} from "./lineItemQuantity";

test("quantity editing permits clearing before replacing a number", () => {
  assert.equal(editableQuantityValue(1), 1);
  assert.equal(quantityFromInput(""), 0);
  assert.equal(editableQuantityValue(0), "");
  assert.equal(quantityFromInput("4"), 4);
});

test("quantity parsing keeps drafts bounded without silently reinserting one", () => {
  for (const raw of [" ", "abc", "-1", "Infinity"]) assert.equal(quantityFromInput(raw), 0);
  assert.equal(quantityFromInput("4.8", {integer: true}), 4);
  assert.equal(quantityFromInput("14", {integer: true, max: 4}), 4);
});

test("plus after clearing starts at one and stepping retains stock bounds", () => {
  assert.equal(stepQuantity(0, 1), 1);
  assert.equal(stepQuantity(1, -1), 1);
  assert.equal(stepQuantity(9, 1, 9), 9);
  assert.equal(stepQuantity(3, 1, 9), 4);
  assert.equal(stepQuantity(Number.NaN, 1), 1);
});
