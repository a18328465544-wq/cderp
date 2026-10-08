import assert from "node:assert/strict";
import test from "node:test";
import {matchesReturnReconcileType} from "./finance-return-reconcile.filters";

test("default All includes both purchase and sales returns", () => {
  assert.equal(matchesReturnReconcileType("all", "进货退货"), true);
  assert.equal(matchesReturnReconcileType("all", "销售退货"), true);
  assert.equal(matchesReturnReconcileType(undefined, "进货退货"), true);
});
test("an explicit type never changes or conflates the underlying returns", () => {
  assert.equal(matchesReturnReconcileType("进货退货", "进货退货"), true);
  assert.equal(matchesReturnReconcileType("进货退货", "销售退货"), false);
});
