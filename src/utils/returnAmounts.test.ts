import assert from "node:assert/strict";
import test from "node:test";
import {isValidReturnAmount, resolveReturnSourceAmount} from "./returnAmounts.ts";

test("return prices preserve explicit zero and use legacy cost only for nullish prices", () => {
  assert.equal(resolveReturnSourceAmount(0, 100), 0);
  assert.equal(resolveReturnSourceAmount(150, 100), 150);
  assert.equal(resolveReturnSourceAmount(undefined, 100), 100);
  assert.equal(resolveReturnSourceAmount(null, 100), 100);
  assert.equal(resolveReturnSourceAmount(undefined), 0);
  assert.equal(resolveReturnSourceAmount(-5, 100), -5);
  assert.ok(Number.isNaN(resolveReturnSourceAmount(Number.NaN, 100)));
});

test("return amount validation rejects zero, negative and non-finite amounts rather than substituting money", () => {
  for (const amount of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.equal(isValidReturnAmount(amount), false);
  }
  for (const amount of [0.01, 100, 150.25]) assert.equal(isValidReturnAmount(amount), true);
});
