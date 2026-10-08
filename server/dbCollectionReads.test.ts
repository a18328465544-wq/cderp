import assert from "node:assert/strict";
import test from "node:test";
import type {PoolClient} from "pg";
import {readCollectionBatch} from "./dbCollectionReads.ts";

test("multiple state collections share one SQL round trip and preserve empty collections", async () => {
  const queries: {sql: string; values: unknown[]}[] = [];
  const client = {query: async (sql: string, values: unknown[]) => {
    queries.push({sql, values});
    return {rows: [{collection: "inventory", data: {id: "KC-1"}}, {collection: "products", data: {id: "P-1"}}]};
  }} as unknown as PoolClient;
  const result = await readCollectionBatch(client, [{key: "products", table: "gpu_products"}, {key: "inventory", table: "gpu_inventory"}, {key: "salesInvoices", table: "gpu_sales_invoices"}], "tenant-a", "store-a");
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /UNION ALL/);
  assert.match(queries[0].sql, /ORDER BY collection, id/);
  assert.equal(queries[0].sql.match(/tenant_id = \$1 AND store_id = \$2/g)?.length, 3);
  assert.deepEqual(queries[0].values.slice(0, 2), ["tenant-a", "store-a"]);
  assert.deepEqual(result.get("inventory"), [{id: "KC-1"}]);
  assert.deepEqual(result.get("products"), [{id: "P-1"}]);
  assert.deepEqual(result.get("salesInvoices"), []);
});

test("empty reads do no work and invalid table identifiers are rejected before querying", async () => {
  let calls = 0;
  const client = {query: async () => {calls++; return {rows: []};}} as unknown as PoolClient;
  assert.equal((await readCollectionBatch(client, [], "a", "b")).size, 0);
  await assert.rejects(readCollectionBatch(client, [{key: "products", table: "gpu_products; DELETE"}], "a", "b"), /Invalid collection table/);
  assert.equal(calls, 0);
});

test("a database error rejects the complete batch instead of returning partial state", async () => {
  const failure = new Error("read failed");
  const client = {query: async () => {throw failure;}} as unknown as PoolClient;
  await assert.rejects(readCollectionBatch(client, [{key: "inventory", table: "gpu_inventory"}], "a", "b"), (error) => error === failure);
});
