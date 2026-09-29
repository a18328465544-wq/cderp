import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient } from "pg";
import { BULK_UPSERT_CHUNK_SIZE, appendOnlyCollection, assertProductionBootstrapPasswordConfigured, assertTestDatabaseConfigured, buildDeleteMissingRowsQuery, buildFinanceProfitFlowQuery, buildFinanceRecordPageQuery, buildInventoryPageQuery, buildInvoicePageQuery, buildLogPageQuery, buildPasswordUpgradeBatches, bulkUpsertRows, getCollectionTablesForKeys, resolveDatabaseUrl } from "./db.ts";

test("production bootstrap password is required only when initializing an empty database", () => {
  assert.doesNotThrow(() => assertProductionBootstrapPasswordConfigured({ NODE_ENV: "development" }));
  assert.throws(
    () => assertProductionBootstrapPasswordConfigured({ NODE_ENV: "production" }),
    /首次初始化生产数据库必须配置 BOOTSTRAP_ADMIN_PASSWORD/,
  );
  assert.doesNotThrow(() => assertProductionBootstrapPasswordConfigured({
    NODE_ENV: "production",
    BOOTSTRAP_ADMIN_PASSWORD: "owner-password",
  }));
});

test("integration tests require a separate test database URL", () => {
  assert.equal(resolveDatabaseUrl({ NODE_ENV: "development", DATABASE_URL: "postgres://dev" }), "postgres://dev");
  assert.equal(resolveDatabaseUrl({ NODE_ENV: "test", TEST_DATABASE_URL: "postgres://test" }), "postgres://test");
  assert.throws(
    () => assertTestDatabaseConfigured({ NODE_ENV: "test" }),
    /必须配置独立的 TEST_DATABASE_URL/,
  );
  assert.throws(
    () => resolveDatabaseUrl({ NODE_ENV: "test", DATABASE_URL: "postgres://same", TEST_DATABASE_URL: "postgres://same" }),
    /不能与 DATABASE_URL 相同/,
  );
});

function createFakeClient(existingIds: string[] = [], existingData: Record<string, unknown> = {}) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const client = {
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (/^\s*SELECT id, data FROM/i.test(sql)) {
        const ids = Array.isArray(params[0]) ? params[0] as string[] : [];
        return { rows: existingIds.filter((id) => ids.includes(id)).map((id) => ({ id, data: existingData[id] || {} })) };
      }
      if (/^\s*SELECT id FROM/i.test(sql)) {
        const ids = Array.isArray(params[0]) ? params[0] as string[] : existingIds;
        return { rows: existingIds.filter((id) => ids.includes(id)).map((id) => ({ id })) };
      }
      return { rows: [] };
    },
  } as unknown as PoolClient;
  return { client, calls };
}

test("partial state save targets only requested collections", () => {
  assert.deepEqual(getCollectionTablesForKeys(["systemUsers", "logs"]), [
    { key: "logs", table: "gpu_logs" },
    { key: "systemUsers", table: "gpu_system_users" },
  ]);
});

test("collection sync deletes only rows missing from the current id set", () => {
  assert.deepEqual(buildDeleteMissingRowsQuery("gpu_products", ["SP-001", "SP-002"]), {
    sql: 'DELETE FROM "gpu_products" WHERE NOT (id = ANY($1::text[]))',
    values: [["SP-001", "SP-002"]],
  });
});

test("collection sync can clear an empty collection explicitly", () => {
  assert.deepEqual(buildDeleteMissingRowsQuery("gpu_products", []), {
    sql: 'DELETE FROM "gpu_products"',
    values: [],
  });
});

test("collection sync scope never deletes rows from another tenant or store", () => {
  const query = buildDeleteMissingRowsQuery("gpu_products", ["SP-001"], "tenant_a", "store_b");
  assert.match(query.sql, /tenant_id = \$1 AND store_id = \$2/);
  assert.match(query.sql, /id = ANY\(\$3::text\[\]\)/);
  assert.deepEqual(query.values, ["tenant_a", "store_b", ["SP-001"]]);
  const clear = buildDeleteMissingRowsQuery("gpu_products", [], "tenant_a", "store_b");
  assert.equal(clear.sql, 'DELETE FROM "gpu_products" WHERE tenant_id = $1 AND store_id = $2');
  assert.deepEqual(clear.values, ["tenant_a", "store_b"]);
});

test("indexed pages include both tenant and store predicates", () => {
  const inventory = buildInventoryPageQuery({tenantId: "tenant_a", storeId: "store_b", keyword: "4090"});
  assert.deepEqual(inventory.values, ["tenant_a", "store_b", "4090"]);
  assert.match(inventory.where, /tenant_id = \$1/);
  assert.match(inventory.where, /store_id = \$2/);

  const logs = buildLogPageQuery({tenantId: "tenant_a", storeId: "store_b", keyword: "登录"});
  assert.deepEqual(logs.values, ["tenant_a", "store_b", "%登录%"]);
  assert.match(logs.where, /tenant_id = \$1/);
  assert.match(logs.where, /store_id = \$2/);

  const invoices = buildInvoicePageQuery("sales", {tenantId: "tenant_a", storeId: "store_b", keyword: "XS-1"});
  assert.deepEqual(invoices.values, ["tenant_a", "store_b", "%XS-1%"]);
  assert.match(invoices.where, /tenant_id = \$1/);
  assert.match(invoices.where, /store_id = \$2/);
});

test("indexed inventory query applies filters and caps server-side pagination", () => {
  const query = buildInventoryPageQuery({
    page: 3,
    pageSize: 999,
    keyword: "RTX 4090",
    status: "已入库",
    category: "显卡",
    warehouseLocation: "A-01",
  });

  assert.equal(query.page, 3);
  assert.equal(query.pageSize, 200);
  assert.equal(query.offset, 400);
  assert.deepEqual(query.values, ["已入库", "显卡", "A-01", "rtx", "4090"]);
  assert.match(query.where, /op_status = \$1/);
  assert.match(query.where, /STRPOS\(regexp_replace\(.+?, \$4\) > 0/);
  assert.match(query.where, /STRPOS\(regexp_replace\(.+?, \$5\) > 0/);
  assert.match(query.where, /<> '已售出'/);
  assert.match(query.select, /jsonb_build_object\('storageDays'/);
  assert.match(query.select, /CURRENT_TIMESTAMP AT TIME ZONE 'Asia\/Shanghai'/);
});

test("inventory keyword search matches a compact brand and model without losing scoped pagination", () => {
  const query = buildInventoryPageQuery({tenantId: "tenant_a", storeId: "store_b", category: "显卡", keyword: "技嘉RTX4090", page: 2, pageSize: 10});
  assert.deepEqual(query.values, ["tenant_a", "store_b", "显卡", "技嘉", "rtx", "4090"]);
  assert.match(query.where, /tenant_id = \$1/);
  assert.match(query.where, /store_id = \$2/);
  assert.match(query.where, /op_category = \$3/);
  assert.equal((query.where.match(/STRPOS\(/g) || []).length, 3);
  assert.equal(query.offset, 10);

  const reordered = buildInventoryPageQuery({keyword: "RTX4090 技嘉"});
  assert.deepEqual(reordered.values, ["rtx", "4090", "技嘉"]);
  const unsafe = buildInventoryPageQuery({keyword: "4090%' OR TRUE --"});
  assert.doesNotMatch(unsafe.where, /OR TRUE/);
});

test("inventory page query keeps active, brand, risk, and aging filters inside PostgreSQL", () => {
  const query = buildInventoryPageQuery({
    activeOnly: true,
    brand: "华硕",
    risk: "upturned",
    minStorageDays: 30,
  });

  assert.match(query.where, /NOT IN \('已售出', '已退货', '已报废', '已拆卸', '已组装'\)/);
  assert.match(query.where, /op_brand = \$1/);
  assert.match(query.where, /marketPrice/);
  assert.match(query.where, /marketPrice[^\n]+> 0/);
  assert.match(query.where, /op_entry_time/);
  assert.equal(query.values[0], "华硕");
  assert.equal(query.values.length, 2);
});

test("inventory page query lets explicit sold filters override active-only defaults", () => {
  const includeSold = buildInventoryPageQuery({activeOnly: true, includeSold: true});
  assert.match(includeSold.where, /NOT IN \('已退货', '已报废', '已拆卸', '已组装'\)/);
  assert.doesNotMatch(includeSold.where, /已售出/);

  const soldStatus = buildInventoryPageQuery({activeOnly: true, status: "已售出"});
  assert.match(soldStatus.where, /op_status = \$1/);
  assert.doesNotMatch(soldStatus.where, /已售出.*<>|NOT IN .*已售出/);
  assert.deepEqual(soldStatus.values, ["已售出"]);
});

test("inventory page query rejects statuses outside the shared backend contract", () => {
  const query = buildInventoryPageQuery({status: "已维修"});
  assert.match(query.where, /FALSE/);
  assert.deepEqual(query.values, []);
});

test("inventory page sorting uses an allowlist and never interpolates arbitrary SQL", () => {
  const sorted = buildInventoryPageQuery({ sortKey: "profit", sortDirection: "asc" });
  assert.match(sorted.orderBy, /estSellPrice/);
  assert.match(sorted.orderBy, /ASC NULLS LAST/);

  const rejected = buildInventoryPageQuery({ sortKey: "id; DROP TABLE gpu_inventory", sortDirection: "asc" });
  assert.equal(rejected.orderBy, "ORDER BY op_entry_time DESC NULLS LAST, id ASC");
});

test("audit log page query caps page size and keeps keyword filtering in PostgreSQL", () => {
  const query = buildLogPageQuery({ page: 2, pageSize: 999, keyword: "采购 JH-001" });
  assert.equal(query.page, 2);
  assert.equal(query.pageSize, 200);
  assert.equal(query.offset, 200);
  assert.deepEqual(query.values, ["%采购 JH-001%"]);
  assert.match(query.where, /CONCAT_WS/);
  assert.match(query.where, /ILIKE \$1/);
});

test("finance record pages keep filtering and pagination inside PostgreSQL", () => {
  const query = buildFinanceRecordPageQuery("income", {page: 2, pageSize: 999, keyword: "返点", accountId: "ACC-1", dateStart: "2026-08-01", dateEnd: "2026-08-31"});
  assert.equal(query.table, "gpu_payment_in_records");
  assert.equal(query.pageSize, 200);
  assert.equal(query.offset, 200);
  assert.match(query.where, /accountId/);
  assert.match(query.where, /ILIKE/);
  assert.match(query.where, /销售收款/);
  assert.match(query.where, /采购单/);
  assert.match(query.where, /退货单/);
  assert.match(query.where, /采购退款/);
  assert.ok(query.values.every((value) => typeof value === "string"));
});

test("profit flow query keeps other income and actual expenses separate from business settlement", () => {
  const income = buildFinanceProfitFlowQuery("income", {dateStart: "2026-08-01", dateEnd: "2026-08-31"});
  assert.equal(income.table, "gpu_payment_in_records");
  assert.match(income.where, /businessType/);
  assert.match(income.where, /销售单/);
  assert.deepEqual(income.values.slice(1), ["2026-08-01", "2026-08-31"]);

  const expense = buildFinanceProfitFlowQuery("expense", {dateStart: "2026-08-01"});
  assert.equal(expense.table, "gpu_payment_out_records");
  assert.match(expense.where, /采购付款/);
  assert.match(expense.where, /relatedDocNo/);
  assert.equal(expense.values[1], "2026-08-01");
});

test("invoice page sorting uses an allowlist and keeps business filters parameterized", () => {
  const purchase = buildInvoicePageQuery("purchase", {sourceType: "同行拿货", paymentStatus: "未付款", sortKey: "totalCost", sortDirection: "asc"});
  assert.equal(purchase.table, "gpu_purchase_invoices");
  assert.match(purchase.where, /sourceType/);
  assert.match(purchase.orderBy, /totalCost/);
  assert.deepEqual(purchase.values, ["同行拿货", "未付款"]);
  const rejected = buildInvoicePageQuery("sales", {sortKey: "id; DROP TABLE gpu_sales_invoices"});
  assert.match(rejected.orderBy, /data->>'date' DESC/);
  assert.doesNotMatch(rejected.orderBy, /DROP TABLE/);
});

test("bulk upsert dedupes duplicate ids (last write wins) into a single multi-row insert", async () => {
  const { client, calls } = createFakeClient();
  await bulkUpsertRows(client, "gpu_products", [
    { id: "SP-001", json: '{"v":1}' },
    { id: "SP-001", json: '{"v":2}' },
    { id: "SP-002", json: '{"v":3}' },
  ]);
  // One read plus one INSERT with two value tuples — never the same conflict target twice in one statement.
  assert.equal(calls.length, 2);
  const insert = calls.find((call) => /INSERT INTO/.test(call.sql));
  assert.ok(insert);
  assert.equal((insert!.sql.match(/::jsonb, NOW\(\)\)/g) || []).length, 2);
  assert.deepEqual(insert!.params, ["SP-001", '{"v":2}', "SP-002", '{"v":3}']);
});

test("bulk upsert splits large collections into chunked inserts", async () => {
  const { client, calls } = createFakeClient();
  const rows = Array.from({ length: BULK_UPSERT_CHUNK_SIZE + 100 }, (_, index) => ({
    id: `L-${index}`,
    json: `{"i":${index}}`,
  }));
  await bulkUpsertRows(client, "gpu_logs", rows);
  const inserts = calls.filter((call) => /INSERT INTO/.test(call.sql));
  assert.equal(inserts.length, 2);
  assert.equal(inserts[0].params.length, BULK_UPSERT_CHUNK_SIZE * 2);
  assert.equal(inserts[1].params.length, 100 * 2);
});

test("bulk upsert updates only changed rows and leaves identical historical rows untouched", async () => {
  const {client, calls} = createFakeClient(["SP-001"], {"SP-001": {v: 1}});
  await bulkUpsertRows(client, "gpu_products", [{id: "SP-001", json: '{"v":2}'}]);
  assert.equal(calls.filter((call) => /UPDATE/.test(call.sql)).length, 1);
  assert.equal(calls.filter((call) => /INSERT INTO/.test(call.sql)).length, 0);

  const identical = createFakeClient(["SP-001"], {"SP-001": {v: 2}});
  await bulkUpsertRows(identical.client, "gpu_products", [{id: "SP-001", json: '{"v":2}'}]);
  assert.equal(identical.calls.filter((call) => /UPDATE/.test(call.sql)).length, 0);
  assert.equal(identical.calls.filter((call) => /INSERT INTO/.test(call.sql)).length, 0);
});

test("bulk upsert issues no query for an empty collection", async () => {
  const { client, calls } = createFakeClient();
  await bulkUpsertRows(client, "gpu_logs", []);
  assert.equal(calls.length, 0);
});

test("password upgrades preserve the tenant and store scope of every account", () => {
  const batches = buildPasswordUpgradeBatches([
    {id: "U-DEFAULT", data: {id: "U-DEFAULT", username: "default", password: "legacy-default", displayName: "Default", role: "老板", enabled: true}, tenantId: "tenant_default", storeId: "store_default"},
    {id: "U-SECOND", data: {id: "U-SECOND", username: "second", password: "legacy-second", displayName: "Second", role: "店员", enabled: true}, tenantId: "tenant_second", storeId: "store_second"},
    {id: "U-HASHED", data: {id: "U-HASHED", username: "hashed", password: "scrypt$already-hashed", displayName: "Hashed", role: "店员", enabled: true}, tenantId: "tenant_second", storeId: "store_second"},
  ]);
  assert.deepEqual(batches.map(({tenantId, storeId}) => ({tenantId, storeId})), [
    {tenantId: "tenant_default", storeId: "store_default"},
    {tenantId: "tenant_second", storeId: "store_second"},
  ]);
  assert.equal(batches[0]?.rows[0]?.id, "U-DEFAULT");
  assert.equal(batches[1]?.rows[0]?.id, "U-SECOND");
  assert.match(batches[0]?.rows[0]?.json || "", /scrypt\$/);
  assert.match(batches[1]?.rows[0]?.json || "", /scrypt\$/);
});

test("append-only collection inserts only new rows and never rewrites existing ones", async () => {
  // DB already holds L-1 and L-2; in-memory buffer has a new L-3 plus the existing two.
  const { client, calls } = createFakeClient(["L-1", "L-2"]);
  await appendOnlyCollection(client, "gpu_logs", [
    { id: "L-3", v: 3 },
    { id: "L-2", v: 2 },
    { id: "L-1", v: 1 },
  ]);
  const inserts = calls.filter((call) => /INSERT INTO/.test(call.sql));
  assert.equal(inserts.length, 1);
  // Only the new row L-3 is written — L-1 / L-2 are skipped entirely.
  assert.deepEqual(inserts[0].params, ["L-3", '{"id":"L-3","v":3}']);
  // The trim keeps exactly the current in-memory id set.
  const deletes = calls.filter((call) => /DELETE FROM/.test(call.sql));
  assert.equal(deletes.length, 1);
  assert.deepEqual(deletes[0].params, [["L-3", "L-2", "L-1"]]);
});

test("append-only collection trims rows that fell out of the capped buffer", async () => {
  // DB holds an old L-0 that is no longer in the capped in-memory buffer — it must be deleted.
  const { client, calls } = createFakeClient(["L-0", "L-1"]);
  await appendOnlyCollection(client, "gpu_logs", [{ id: "L-1", v: 1 }]);
  const inserts = calls.filter((call) => /INSERT INTO/.test(call.sql));
  assert.equal(inserts.length, 0);
  const deletes = calls.filter((call) => /DELETE FROM/.test(call.sql));
  assert.deepEqual(deletes[0].params, [["L-1"]]);
});
