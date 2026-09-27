import {readFile} from "node:fs/promises";
import type {Pool, PoolClient} from "pg";
import {
  createInitialState,
  normalizeStateConditions,
  type AppState,
} from "./store.ts";
import type {InspectionRecord} from "../src/types.ts";
import type {
  StateCollectionKey,
  StateRecordSave,
  StateRecordTransactionHook,
} from "./db.ts";

type CollectionTable = {key: StateCollectionKey; table: string};
type QueryResult = {sql: string; values: unknown[]};

type StatePersistenceDependencies = {
  initializePostgres: () => Promise<void>;
  getPool: () => Pool;
  scopedTenantId: (tenantId?: string) => string;
  scopedStoreId: (storeId?: string) => string;
  defaultTenantId: string;
  collectionKeys: StateCollectionKey[];
  getCollectionTablesForKeys: (keys: StateCollectionKey[]) => CollectionTable[];
  buildDeleteMissingRowsQuery: (table: string, ids: string[], tenantId?: string, storeId?: string) => QueryResult;
  bulkUpsertRows: (client: PoolClient, table: string, rows: {id: string; json: string}[], tenantId?: string, storeId?: string) => Promise<void>;
  appendOnlyCollection: (client: PoolClient, table: string, items: unknown[], tenantId?: string, storeId?: string) => Promise<void>;
  rowId: (item: unknown, index: number) => string;
  quoteIdentifier: (identifier: string) => string;
  enqueueStateSave: <T>(task: () => T | PromiseLike<T>) => Promise<T>;
  lockTransactionForStateWrite: (client: PoolClient) => Promise<void>;
  rollbackQuietly: (client: PoolClient) => Promise<void>;
  syncAccountingEventsForRecordsInTransaction: (client: PoolClient, sourceKey: string, items: unknown[], tenantId?: string, storeId?: string) => Promise<void>;
  assertProductionBootstrapPasswordConfigured: () => void;
  legacyDataFile: string;
  legacyImportEnabled: boolean;
};

function cloneWithoutRuntimeSession(state: AppState): AppState {
  return {...state, currentUserId: undefined};
}

export function createStatePersistence({
  initializePostgres,
  getPool,
  scopedTenantId,
  scopedStoreId,
  defaultTenantId,
  collectionKeys,
  getCollectionTablesForKeys,
  buildDeleteMissingRowsQuery,
  bulkUpsertRows,
  appendOnlyCollection,
  rowId,
  quoteIdentifier,
  enqueueStateSave,
  lockTransactionForStateWrite,
  rollbackQuietly,
  syncAccountingEventsForRecordsInTransaction,
  assertProductionBootstrapPasswordConfigured,
  legacyDataFile,
  legacyImportEnabled,
}: StatePersistenceDependencies) {
  async function hasPersistedState(client: PoolClient, tenantId?: string, storeId?: string) {
    const scope = scopedTenantId(tenantId);
    const storeScope = scopedStoreId(storeId);
    if (scope === defaultTenantId) {
      const result = await client.query<{count: string}>(
        "SELECT COUNT(*)::text AS count FROM gpu_app_meta WHERE key IN ('currentRole', 'customPermissions')",
      );
      if (Number(result.rows[0]?.count || 0) > 0) return true;
    } else {
      const settings = await client.query<{count: string}>(
        "SELECT COUNT(*)::text AS count FROM gpu_tenant_settings WHERE tenant_id = $1",
        [scope],
      );
      if (Number(settings.rows[0]?.count || 0) > 0) return true;
    }

    const inventory = await client.query<{count: string}>(
      "SELECT COUNT(*)::text AS count FROM gpu_inventory WHERE tenant_id = $1 AND store_id = $2",
      [scope, storeScope],
    );
    const users = await client.query<{count: string}>(
      "SELECT COUNT(*)::text AS count FROM gpu_system_users WHERE tenant_id = $1 AND store_id = $2",
      [scope, storeScope],
    );
    return Number(inventory.rows[0]?.count || 0) > 0 || Number(users.rows[0]?.count || 0) > 0;
  }

  /** Repair the membership projection without reactivating an explicitly deactivated account. */
  async function ensureTenantMemberships(client: PoolClient, tenantId?: string, storeId?: string) {
    const scope = scopedTenantId(tenantId);
    const storeScope = scopedStoreId(storeId);
    await client.query(
      `INSERT INTO gpu_tenant_memberships
         (tenant_id, user_id, store_id, role, status, joined_at)
       SELECT tenant_id, id, store_id,
              COALESCE(NULLIF(data->>'role', ''), '店员'),
              CASE WHEN data->>'enabled' = 'false' THEN 'deactivated' ELSE 'active' END,
              NOW()
         FROM gpu_system_users
        WHERE tenant_id = $1 AND store_id = $2
       ON CONFLICT (tenant_id, user_id, store_id) DO NOTHING`,
      [scope, storeScope],
    );
  }

  async function touchStateRevision(client: PoolClient) {
    await client.query(`
      INSERT INTO gpu_app_meta (key, value, updated_at) VALUES ('stateRevision', '1'::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET
        value = to_jsonb(COALESCE((gpu_app_meta.value #>> '{}')::bigint, 0) + 1),
        updated_at = NOW()
    `);
  }

  async function getStateRevision() {
    await initializePostgres();
    const result = await getPool().query<{value: unknown}>("SELECT value FROM gpu_app_meta WHERE key = 'stateRevision'");
    const value = result.rows[0]?.value;
    return typeof value === "number" ? value : Number(value || 0);
  }

  async function loadLegacyJsonState() {
    if (!legacyImportEnabled) return null;
    try {
      const raw = await readFile(legacyDataFile, "utf8");
      return {
        ...createInitialState({includeCrmDemoData: false}),
        ...(JSON.parse(raw) as Partial<AppState>),
        currentUserId: undefined,
      };
    } catch {
      return null;
    }
  }

  async function readStateFromPostgres(client: PoolClient, tenantId?: string, storeId?: string): Promise<AppState> {
    const scope = scopedTenantId(tenantId);
    const storeScope = scopedStoreId(storeId);
    const state = createInitialState({includeCrmDemoData: false});

    for (const {key, table} of getCollectionTablesForKeys(collectionKeys)) {
      const result = await client.query<{data: unknown}>(
        `SELECT data FROM ${table} WHERE tenant_id = $1 AND store_id = $2 ORDER BY id ASC`,
        [scope, storeScope],
      );
      (state[key] as unknown[]) = result.rows.map((row) => row.data);
    }
    state.systemUsers = state.systemUsers.map((user) => ({
      ...user,
      tenantId: user.tenantId || scope,
      storeId: user.storeId || storeScope,
    }));

    const settings = await client.query<{current_role: string | null; custom_permissions: unknown; commission_rules: unknown}>(
      "SELECT \"current_role\", custom_permissions, commission_rules FROM gpu_tenant_settings WHERE tenant_id = $1",
      [scope],
    );
    const setting = settings.rows[0];
    if (setting?.current_role) state.currentRole = setting.current_role as AppState["currentRole"];
    // Older settings rows used `{}` for custom_permissions. Keep in-memory
    // defaults for malformed legacy values instead of passing an object to UI helpers.
    if (Array.isArray(setting?.custom_permissions)) {
      state.customPermissions = setting.custom_permissions as AppState["customPermissions"];
    }
    if (setting?.commission_rules && typeof setting.commission_rules === "object") {
      state.commissionRules = setting.commission_rules as AppState["commissionRules"];
    }
    // Keep legacy app_meta values readable for the default tenant during migration.
    if (scope === defaultTenantId && !setting) {
      const meta = await client.query<{key: string; value: unknown}>("SELECT key, value FROM gpu_app_meta");
      for (const row of meta.rows) {
        if (row.key === "currentRole") state.currentRole = row.value as AppState["currentRole"];
        if (row.key === "customPermissions" && Array.isArray(row.value)) {
          state.customPermissions = row.value as AppState["customPermissions"];
        }
        if (row.key === "commissionRules") state.commissionRules = row.value as AppState["commissionRules"];
      }
    }

    state.currentUserId = undefined;
    return normalizeStateConditions(state);
  }

  async function readStateCollectionsFromPostgres(
    client: PoolClient,
    currentState: AppState,
    keys: StateCollectionKey[],
    tenantId?: string,
    storeId?: string,
  ): Promise<AppState> {
    const scope = scopedTenantId(tenantId);
    const storeScope = scopedStoreId(storeId);
    const state = {...currentState, currentUserId: undefined};

    for (const {key, table} of getCollectionTablesForKeys(keys)) {
      const result = await client.query<{data: unknown}>(
        `SELECT data FROM ${table} WHERE tenant_id = $1 AND store_id = $2 ORDER BY id ASC`,
        [scope, storeScope],
      );
      (state[key] as unknown[]) = result.rows.map((row) => row.data);
    }
    state.systemUsers = state.systemUsers.map((user) => ({
      ...user,
      tenantId: user.tenantId || scope,
      storeId: user.storeId || storeScope,
    }));

    const settings = await client.query<{current_role: string | null; custom_permissions: unknown; commission_rules: unknown}>(
      "SELECT \"current_role\", custom_permissions, commission_rules FROM gpu_tenant_settings WHERE tenant_id = $1",
      [scope],
    );
    const setting = settings.rows[0];
    if (setting?.current_role) state.currentRole = setting.current_role as AppState["currentRole"];
    if (Array.isArray(setting?.custom_permissions)) {
      state.customPermissions = setting.custom_permissions as AppState["customPermissions"];
    }
    if (setting?.commission_rules && typeof setting.commission_rules === "object") {
      state.commissionRules = setting.commission_rules as AppState["commissionRules"];
    } else if (scope === defaultTenantId && !setting) {
      const meta = await client.query<{value: unknown}>("SELECT value FROM gpu_app_meta WHERE key = 'commissionRules'");
      if (meta.rows[0]) state.commissionRules = meta.rows[0].value as AppState["commissionRules"];
    }

    return normalizeStateConditions(state);
  }

  async function writeStateToPostgres(client: PoolClient, nextState: AppState, tenantId?: string, storeId?: string) {
    const scope = scopedTenantId(tenantId);
    const storeScope = scopedStoreId(storeId);
    const state = cloneWithoutRuntimeSession(nextState);

    await writeCollectionsToPostgres(client, state, collectionKeys, scope, storeScope);
    await client.query(
      `INSERT INTO gpu_tenant_settings (tenant_id, "current_role", custom_permissions, commission_rules, updated_at)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET
         "current_role" = EXCLUDED."current_role",
         custom_permissions = EXCLUDED.custom_permissions,
         commission_rules = EXCLUDED.commission_rules,
         updated_at = NOW()`,
      [scope, state.currentRole || null, JSON.stringify(state.customPermissions || []), JSON.stringify(state.commissionRules || {})],
    );
    // app_meta remains a compatibility projection for the default tenant only.
    if (scope === defaultTenantId) {
      await client.query(
        `INSERT INTO gpu_app_meta (key, value, updated_at) VALUES
          ('currentRole', $1::jsonb, NOW()),
          ('customPermissions', $2::jsonb, NOW()),
          ('commissionRules', $3::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [JSON.stringify(state.currentRole), JSON.stringify(state.customPermissions), JSON.stringify(state.commissionRules)],
      );
    }
  }

  async function writeCollectionsToPostgres(client: PoolClient, nextState: AppState, keys: StateCollectionKey[], tenantId?: string, storeId?: string) {
    const scope = scopedTenantId(tenantId);
    const storeScope = scopedStoreId(storeId);
    const state = cloneWithoutRuntimeSession(nextState);

    for (const {key, table} of getCollectionTablesForKeys(keys)) {
      const items = state[key] as unknown[];
      if (key === "logs") {
        await appendOnlyCollection(client, table, items, scope, storeScope);
        continue;
      }
      const rows = items.map((item, index) => ({id: rowId(item, index), json: JSON.stringify(item)}));
      await bulkUpsertRows(client, table, rows, scope, storeScope);
      await syncAccountingEventsForRecordsInTransaction(client, key, items, scope, storeScope);
      const deleteMissing = buildDeleteMissingRowsQuery(table, rows.map((row) => row.id), scope, storeScope);
      await client.query(deleteMissing.sql, deleteMissing.values);
    }
  }

  async function upsertCollectionRecords(client: PoolClient, records: StateRecordSave[], tenantId?: string, storeId?: string) {
    const scope = scopedTenantId(tenantId);
    const storeScope = scopedStoreId(storeId);
    for (const record of records) {
      const target = getCollectionTablesForKeys([record.key])[0];
      if (!target) continue;

      const rows = record.items.map((item, index) => ({id: rowId(item, index), json: JSON.stringify(item)}));
      await bulkUpsertRows(client, target.table, rows, scope, storeScope);
      await syncAccountingEventsForRecordsInTransaction(client, record.key, record.items, scope, storeScope);
      if (record.deleteIds?.length) {
        await client.query(
          `DELETE FROM ${quoteIdentifier(target.table)} WHERE tenant_id = $1 AND store_id = $2 AND id = ANY($3::text[])`,
          [scope, storeScope, Array.from(new Set(record.deleteIds))],
        );
      }
      if (record.deleteMissing) {
        const deleteMissing = buildDeleteMissingRowsQuery(target.table, rows.map((row) => row.id), scope, storeScope);
        await client.query(deleteMissing.sql, deleteMissing.values);
      }
    }
  }

  async function snapshotState(client: PoolClient, tenantId?: string, storeId?: string) {
    const state = await readStateFromPostgres(client, tenantId, storeId);
    return cloneWithoutRuntimeSession(state);
  }

  /** Keep every inspection revision as append-only evidence for re-checks and rollback tooling. */
  async function appendInspectionVersionInTransaction(
    client: PoolClient,
    record: InspectionRecord,
    tenantId?: string,
    recordedBy?: string,
  ) {
    const scope = scopedTenantId(tenantId);
    await client.query(
      `INSERT INTO gpu_inspection_versions (tenant_id, inspection_id, record_version, data, recorded_by)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT (tenant_id, inspection_id, record_version) DO NOTHING`,
      [scope, record.id, Math.max(1, Number(record.recordVersion || 1)), JSON.stringify(record), recordedBy?.trim() || null],
    );
  }

  async function ensureInitializedState(client: PoolClient, tenantId: string, storeId: string) {
    if (await hasPersistedState(client, tenantId, storeId)) return;
    const legacy = tenantId === defaultTenantId ? await loadLegacyJsonState() : null;
    if (!legacy) assertProductionBootstrapPasswordConfigured();
    const initial = legacy || createInitialState({includeCrmDemoData: false});
    if (tenantId !== defaultTenantId && !legacy) initial.systemUsers = [];
    await writeStateToPostgres(client, initial, tenantId, storeId);
    await touchStateRevision(client);
  }

  async function loadState(tenantId?: string, storeId?: string): Promise<AppState> {
    const scope = scopedTenantId(tenantId);
    const storeScope = scopedStoreId(storeId);
    await initializePostgres();
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await ensureInitializedState(client, scope, storeScope);
      await ensureTenantMemberships(client, scope, storeScope);
      const state = await readStateFromPostgres(client, scope, storeScope);
      await client.query("COMMIT");
      return state;
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async function loadStateCollections(state: AppState, keys: StateCollectionKey[], tenantId?: string, storeId?: string): Promise<AppState> {
    const scope = scopedTenantId(tenantId);
    const storeScope = scopedStoreId(storeId);
    if (!keys.length) return state;
    await initializePostgres();
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await ensureInitializedState(client, scope, storeScope);
      await ensureTenantMemberships(client, scope, storeScope);
      const nextState = await readStateCollectionsFromPostgres(client, state, keys, scope, storeScope);
      await client.query("COMMIT");
      return nextState;
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async function saveState(state: AppState, tenantId?: string, storeId?: string) {
    const scope = scopedTenantId(tenantId);
    const storeScope = scopedStoreId(storeId);
    return enqueueStateSave(async () => {
      await initializePostgres();
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        await lockTransactionForStateWrite(client);
        await writeStateToPostgres(client, state, scope, storeScope);
        await touchStateRevision(client);
        await client.query("COMMIT");
      } catch (error) {
        await rollbackQuietly(client);
        throw error;
      } finally {
        client.release();
      }
    });
  }

  async function saveStateCollections(state: AppState, keys: StateCollectionKey[], tenantId?: string, storeId?: string) {
    const scope = scopedTenantId(tenantId);
    const storeScope = scopedStoreId(storeId);
    return enqueueStateSave(async () => {
      await initializePostgres();
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        await lockTransactionForStateWrite(client);
        await writeCollectionsToPostgres(client, state, keys, scope, storeScope);
        await touchStateRevision(client);
        await client.query("COMMIT");
      } catch (error) {
        await rollbackQuietly(client);
        throw error;
      } finally {
        client.release();
      }
    });
  }

  async function saveStateRecords(records: StateRecordSave[], transactionHook?: StateRecordTransactionHook, tenantId?: string, storeId?: string) {
    const scope = scopedTenantId(tenantId);
    const storeScope = scopedStoreId(storeId);
    return enqueueStateSave(async () => {
      await initializePostgres();
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        await lockTransactionForStateWrite(client);
        await upsertCollectionRecords(client, records, scope, storeScope);
        await transactionHook?.(client);
        await touchStateRevision(client);
        await client.query("COMMIT");
      } catch (error) {
        await rollbackQuietly(client);
        throw error;
      } finally {
        client.release();
      }
    });
  }

  return {
    getStateRevision,
    loadState,
    loadStateCollections,
    saveState,
    saveStateCollections,
    saveStateRecords,
    snapshotState,
    appendInspectionVersionInTransaction,
  };
}

export type {StatePersistenceDependencies};
