import assert from "node:assert/strict";
import test from "node:test";
import type {Pool} from "pg";
import type {DailyClosing} from "../src/types.ts";
import {createDailyOperations} from "./dbDailyOperations.ts";

test("daily closing writes through the transaction client", async () => {
  const closing: DailyClosing = {
    id: "RJ-20260921",
    date: "2026-09-21",
    closedAt: "2026-09-21T23:00:00+08:00",
    closedBy: "老板",
    snapshot: {income: 10, expense: 2, netCash: 8, salesCount: 1, purchaseCount: 1, receivable: 0, payable: 0, unreviewed: 0, accountReconciliationDifferences: 0},
  };
  let poolQueryCount = 0;
  const clientQueries: string[] = [];
  const client = {
    query: async (sql: string) => {
      clientQueries.push(sql);
      if (/INSERT INTO gpu_daily_closings/.test(sql)) return {rows: [{data: closing}]};
      return {rows: []};
    },
    release: () => undefined,
  };
  const pool = {
    connect: async () => client,
    query: async () => { poolQueryCount += 1; return {rows: []}; },
  } as unknown as Pool;
  const operations = createDailyOperations({
    initializePostgres: async () => undefined,
    getPool: () => pool,
    scopedTenantId: (tenantId) => tenantId || "tenant_default",
    scopedStoreId: (storeId) => storeId || "store_default",
  });

  const saved = await operations.saveDailyClosing(closing, "tenant_a", "store_a");
  assert.equal(saved.id, closing.id);
  assert.equal(poolQueryCount, 0);
  assert.ok(clientQueries.some((sql) => /INSERT INTO gpu_daily_closings/.test(sql)));
});
