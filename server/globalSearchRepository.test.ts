import assert from "node:assert/strict";
import test from "node:test";
import {buildGlobalSearchQuery, searchableGlobalSearchKinds} from "./globalSearchRepository.ts";

test("global search selects only entities backed by the current account menus", () => {
  assert.deepEqual(searchableGlobalSearchKinds(["products", "inventory", "sales_list"]), ["product", "inventory", "sales"]);
  assert.deepEqual(searchableGlobalSearchKinds(["dashboard"]), []);
  assert.deepEqual(searchableGlobalSearchKinds(["all"]), ["product", "inventory", "inspection", "customer", "vendor", "purchase", "sales", "quote", "return", "order", "aftersales"]);
});

test("global search query is tenant/store scoped, bounded, and returns no sensitive fields", () => {
  const query = buildGlobalSearchQuery({tenantId: "tenant-a", storeId: "store-a", query: "4090", limit: 999, allowedMenus: ["products", "inventory", "sales_list"]});
  assert.equal(query.limit, 60);
  assert.deepEqual(query.values, ["tenant-a", "store-a", "4090", 60]);
  assert.match(query.sql, /gpu_products/);
  assert.match(query.sql, /gpu_inventory/);
  assert.match(query.sql, /gpu_sales_invoices/);
  assert.match(query.sql, /tenant_id = \$1/);
  assert.match(query.sql, /store_id = \$2/);
  assert.match(query.sql, /LIMIT \$4/);
  assert.doesNotMatch(query.sql, /updated_at/);
  assert.doesNotMatch(query.sql, /totalCost|totalProfit|costPrice|sellPrice|paidAmount/);
});
