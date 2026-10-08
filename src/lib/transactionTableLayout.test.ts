import assert from "node:assert/strict";
import test from "node:test";
import {transactionTableLayout} from "./transactionTableLayout";

test("entry tables keep price, quantity and profit before the fixed action edge", () => {
  const {purchase, sales, minWidth} = transactionTableLayout;
  for (const widths of [purchase, sales]) assert.equal(widths.reduce<number>((sum, width) => sum + width, 0), 100);
  assert.ok(minWidth <= 760);
  assert.ok(purchase.slice(0, 5).reduce<number>((sum, width) => sum + width, 0) <= 100 - purchase[6]);
  assert.ok(sales.slice(0, 4).reduce<number>((sum, width) => sum + width, 0) <= 100 - sales[5]);
  assert.ok(minWidth * purchase[6] / 100 >= 64);
  assert.ok(minWidth * sales[5] / 100 >= 64);
});
