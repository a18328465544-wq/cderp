import assert from "node:assert/strict";
import test from "node:test";
import {buildGlobalSearchQuery, searchableGlobalSearchKinds} from "./globalSearchRepository.ts";
import {buildInventoryPageQuery} from "./dbQueryBuilders.ts";

test("global search selects only entities backed by the current account menus", () => {
  assert.deepEqual(searchableGlobalSearchKinds(["products", "inventory", "sales_list"]), ["product", "inventory", "sales"]);
  assert.deepEqual(searchableGlobalSearchKinds(["dashboard"]), []);
  assert.deepEqual(searchableGlobalSearchKinds(["all"]), ["product", "inventory", "inspection", "customer", "vendor", "purchase", "sales", "quote", "return", "order", "aftersales"]);
});

test("global search query is tenant/store scoped, bounded, and returns no sensitive fields", () => {
  const query = buildGlobalSearchQuery({tenantId: "tenant-a", storeId: "store-a", query: "4090", limit: 999, allowedMenus: ["products", "inventory", "sales_list"]});
  assert.equal(query.limit, 60);
  assert.deepEqual(query.values.slice(0, 4), ["tenant-a", "store-a", "4090", 60]);
  assert.equal(String(query.values.at(-1)).includes("4090"), true);
  assert.match(query.sql, /gpu_products/);
  assert.match(query.sql, /gpu_inventory/);
  assert.match(query.sql, /gpu_sales_invoices/);
  assert.match(query.sql, /tenant_id = \$1/);
  assert.match(query.sql, /store_id = \$2/);
  assert.match(query.sql, /LENGTH\(\$3::text\) > 0/);
  assert.match(query.sql, /LIMIT \$4/);
  assert.doesNotMatch(query.sql, /updated_at/);
  assert.doesNotMatch(query.sql, /totalCost|totalProfit|costPrice|sellPrice|paidAmount/);
});

test("global inventory search shares the stock-card identity predicate without supplier or remark matches", () => {
  const global = buildGlobalSearchQuery({tenantId: "tenant-a", storeId: "store-a", query: "4090", allowedMenus: ["inventory"]});
  const inventory = buildInventoryPageQuery({tenantId: "tenant-a", storeId: "store-a", keyword: "4090"});
  const globalPredicate = global.sql.slice(global.sql.indexOf("FROM gpu_inventory"), global.sql.indexOf("ORDER BY id ASC"));
  assert.match(globalPredicate, /op_product_id/);
  assert.match(globalPredicate, /op_sn/);
  assert.match(globalPredicate, /data->>'productName'/);
  assert.match(globalPredicate, /data->>'model'/);
  assert.doesNotMatch(globalPredicate, /supplierName|remarks|warehouseLocation/);
  assert.equal(global.values.some((value) => typeof value === "string" && value.includes("4090") && value.includes("(?!")), true);
  assert.equal(Math.max(...[...global.sql.matchAll(/\$(\d+)/g)].map((match) => Number(match[1]))), global.values.length);
  assert.match(inventory.where, /op_product_id/);
  assert.equal(global.values.includes("4090"), true);
  assert.equal(inventory.values.includes("4090"), true);
});
