import assert from "node:assert/strict";
import test from "node:test";
import {hashFinanceSnapshot} from "./dbFinanceControls.ts";

test("finance snapshot hashes are independent of object key order", () => {
  assert.equal(hashFinanceSnapshot({income: 10, expense: 2}), hashFinanceSnapshot({expense: 2, income: 10}));
  assert.notEqual(hashFinanceSnapshot({income: 10, expense: 2}), hashFinanceSnapshot({income: 11, expense: 2}));
});
