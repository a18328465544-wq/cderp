import assert from "node:assert/strict";
import test from "node:test";
import type {ColumnDef} from "@tanstack/react-table";
import {createInventoryColumns} from "./inventory/inventory.columns";
import {createPurchaseListColumns} from "./purchase/purchase.columns";
import {createSalesListColumns} from "./sales/sales.columns";
import {createPurchaseReturnColumns} from "./returns/purchase-return.columns";
import {createSalesReturnColumns} from "./returns/sales-return.columns";

const ids = <T,>(columns: ColumnDef<T, unknown>[]) => columns.map((column) => column.id || ("accessorKey" in column ? String(column.accessorKey) : ""));

test("inventory columns prioritize status and prices without adding restricted facts", () => {
  const options = {onDetail: () => undefined};
  const full = ids(createInventoryColumns({...options, showCost: true, showProfit: true}));
  assert.ok(full.indexOf("costPrice") < full.indexOf("brand"));
  assert.ok(full.indexOf("status") < full.indexOf("model"));
  const restricted = ids(createInventoryColumns({...options, showCost: false, showProfit: false}));
  assert.ok(!restricted.includes("costPrice"));
  assert.ok(!restricted.includes("estimatedProfit"));
});

test("sales and purchase lists expose amounts and settlement status before secondary metadata", () => {
  const callbacks = {onDetail: () => undefined, onDelete: () => undefined, canDelete: false};
  const sales = ids(createSalesListColumns({...callbacks, showProfit: true}));
  assert.ok(sales.indexOf("totalAmount") < sales.indexOf("channel"));
  assert.ok(sales.indexOf("paymentStatus") < sales.indexOf("date"));
  const purchase = ids(createPurchaseListColumns({...callbacks, showCost: true, showProfit: true}));
  assert.deepEqual(purchase.slice(0, 4), ["invoiceNo", "supplierName", "totalCost", "paymentStatus"]);
  assert.ok(!ids(createPurchaseListColumns({...callbacks, showCost: false, showProfit: false})).includes("totalCost"));
});

test("return lists prioritize lifecycle and settlement without changing action permissions", () => {
  const callbacks = {onDetail: () => undefined, onComplete: () => undefined, canDelete: false, canEdit: false};
  for (const columns of [createPurchaseReturnColumns(callbacks), createSalesReturnColumns(callbacks)]) {
    assert.deepEqual(ids(columns).slice(0, 4), ["returnNo", "status", "amount", "settlementMode"]);
    assert.equal(ids(columns).at(-1), "actions");
  }
});
