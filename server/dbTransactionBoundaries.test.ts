import assert from "node:assert/strict";
import test from "node:test";
import type {Pool, PoolClient} from "pg";
import {createDailyOperations} from "./dbDailyOperations.ts";
import {createAccountingPeriodOperations} from "./dbAccountingPeriods.ts";
import {createFinanceControlsOperations} from "./dbFinanceControls.ts";
import {createDatabaseBackups} from "./dbBackups.ts";
import {createStatePersistence} from "./dbStatePersistence.ts";
import {queryProfitReport} from "./financeProfitReport.ts";
import {rollbackTransactionQuietly} from "./dbTransactionCleanup.ts";
import {createInitialState} from "./store.ts";

for (const rollbackFails of [false, true]) {
  test(`every transaction owner ${rollbackFails ? "discards" : "returns"} its connection after failure`, async () => {
    const original = new Error("BEGIN failed");
    const releases: unknown[] = [];
    const client = {query: async (sql: string) => {
      if (sql.startsWith("BEGIN")) throw original;
      assert.equal(sql, "ROLLBACK");
      if (rollbackFails) throw new Error("rollback failed");
      return {rows: []};
    }, release: (destroy?: boolean) => releases.push(destroy)} as unknown as PoolClient;
    const getPool = () => ({connect: async () => client}) as unknown as Pool;
    const noop = async () => undefined;
    const dependencies = {initializePostgres: noop, getPool, scopedTenantId: () => "tenant", scopedStoreId: () => "store"};
    const periods = createAccountingPeriodOperations(dependencies);
    const daily = createDailyOperations(dependencies);
    const finance = createFinanceControlsOperations(dependencies);
    const backups = createDatabaseBackups({...dependencies, defaultTenantId: "tenant", backupDir: "/unused",
      snapshotState: async () => createInitialState(), rollbackQuietly: rollbackTransactionQuietly});
    const persistence = createStatePersistence({...dependencies, defaultTenantId: "tenant", collectionKeys: [],
      getCollectionTablesForKeys: () => [], buildDeleteMissingRowsQuery: () => ({sql: "", values: []}),
      bulkUpsertRows: noop, appendOnlyCollection: noop, rowId: () => "id", quoteIdentifier: (value) => value,
      enqueueStateSave: async (operation) => operation(), lockTransactionForStateWrite: noop,
      rollbackQuietly: rollbackTransactionQuietly, syncAccountingEventsForRecordsInTransaction: noop,
      assertProductionBootstrapPasswordConfigured: () => undefined, legacyDataFile: "/unused", legacyImportEnabled: false});
    const state = createInitialState();
    const operations = [
      () => periods.closeAccountingPeriod({period: "2026-10", closedBy: "test"}),
      () => periods.reopenAccountingPeriod("2026-10", "test"),
      () => daily.saveDailyClosing({date: "2026-10-07"} as Parameters<typeof daily.saveDailyClosing>[0]),
      () => finance.saveDailySnapshot({date: "2026-10-07", snapshot: {}}),
      () => backups.createManualBackup(),
      () => persistence.loadState(),
      () => persistence.loadStateCollections(state, ["inventory"]),
      () => persistence.saveState(state),
      () => persistence.saveStateCollections(state, ["inventory"]),
      () => persistence.saveStateRecords([{key: "inventory", items: []}]),
      () => queryProfitReport(getPool(), {tenantId: "tenant", storeId: "store", keyword: "", dateStart: "2026-10-01", dateEnd: "2026-10-07", dimension: "product", page: 1, pageSize: 20}, {showCost: true, showProfit: true}),
    ];
    for (const operation of operations) {
      const before = releases.length;
      await assert.rejects(operation(), (error) => error === original);
      assert.deepEqual(releases.slice(before), [rollbackFails ? true : undefined]);
    }
  });
}

for (const rollbackFails of [false, true]) {
  test(`commit failure preserves the original error and ${rollbackFails ? "discards" : "returns"} the connection`, async () => {
    const failure = new Error("COMMIT acknowledgement lost");
    const releases: unknown[] = [];
    const client = {query: async (sql: string) => {
      if (sql === "COMMIT") throw failure;
      if (sql === "ROLLBACK" && rollbackFails) throw new Error("connection closed");
      return {rows: []};
    }, release: (destroy?: boolean) => releases.push(destroy)} as unknown as PoolClient;
    const backups = createDatabaseBackups({initializePostgres: async () => undefined,
      getPool: () => ({connect: async () => client}) as unknown as Pool, scopedTenantId: () => "test",
      defaultTenantId: "test", backupDir: "/unused", snapshotState: async () => createInitialState(),
      rollbackQuietly: rollbackTransactionQuietly});
    await assert.rejects(backups.createManualBackup(), (error) => error === failure);
    assert.deepEqual(releases, [rollbackFails ? true : undefined]);
    // A lost COMMIT acknowledgement is not automatically retried: the server
    // may already have committed. The request idempotency receipt governs retry.
  });
}
