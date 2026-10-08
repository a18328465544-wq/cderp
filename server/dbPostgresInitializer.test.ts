import assert from "node:assert/strict";
import test from "node:test";
import type {Pool} from "pg";
import {createPostgresInitializer, type PostgresInitializerDependencies} from "./dbPostgresInitializer.ts";
import {rollbackTransactionQuietly} from "./dbTransactionCleanup.ts";

function fixture(failFirst = false) {
  let connections = 0;
  let releases = 0;
  const getPool = () => ({connect: async () => {
    const attempt = ++connections;
    return {query: async (sql: string) => {
      if (sql === "BEGIN") await new Promise((resolve) => setTimeout(resolve, 5));
      if (failFirst && attempt === 1 && sql.includes("CREATE TABLE")) throw new Error("startup failed");
      return {rows: []};
    }, release: () => {releases++;}};
  }}) as unknown as Pool;
  const noop = async () => undefined;
  const dependencies: PostgresInitializerDependencies = {getPool, collectionTables: [], applySchemaComments: noop,
    applyCrmFoundationSchema: noop, applyOperationalProjectionSchema: noop,
    applyCommercialFoundationSchema: noop, applyCommercialHardeningSchema: noop,
    applyAccountingControlPlaneSchema: noop, upgradePersistedUserPasswords: noop, rollbackQuietly: rollbackTransactionQuietly};
  return {initialize: createPostgresInitializer(dependencies).initializePostgres, counts: () => ({connections, releases})};
}

test("concurrent cold requests share one schema initialization transaction", async () => {
  const f = fixture();
  await Promise.all(Array.from({length: 20}, () => f.initialize()));
  await f.initialize();
  assert.deepEqual(f.counts(), {connections: 1, releases: 1});
});

test("failed initialization rejects all waiters but permits a clean subsequent retry", async () => {
  const f = fixture(true);
  const results = await Promise.allSettled(Array.from({length: 10}, () => f.initialize()));
  assert.ok(results.every((result) => result.status === "rejected"));
  assert.deepEqual(f.counts(), {connections: 1, releases: 1});
  await f.initialize();
  assert.deepEqual(f.counts(), {connections: 2, releases: 2});
});
