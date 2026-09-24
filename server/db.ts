import "dotenv/config";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import type { AppState } from "./store.ts";
import { hashPassword, isPasswordHash } from "./security.ts";
import type { CommissionMode, SystemUserAccount } from "../src/types.ts";
import { applyCrmFoundationSchema } from "./crmSchema.ts";
import { applyOperationalProjectionSchema } from "./operationalSchema.ts";
import { applyAccountingControlPlaneSchema, applyCommercialFoundationSchema, applyCommercialHardeningSchema } from "./commercialSchema.ts";
import { DEFAULT_STORE_ID, DEFAULT_TENANT_ID } from "./commercialConstants.ts";
import { createResilientQueue } from "./resilientQueue.ts";
import { createAiInsightsRepository } from "./dbAiInsights.ts";
import { createDatabaseBackups } from "./dbBackups.ts";
import { createDailyOperations } from "./dbDailyOperations.ts";
import { createAccountingPeriodOperations } from "./dbAccountingPeriods.ts";
import { createFinanceReconciliationActionOperations } from "./dbFinanceReconciliationActions.ts";
import { createAccountingEventOperations } from "./dbAccountingEvents.ts";
import { createFinanceControlsOperations } from "./dbFinanceControls.ts";
import { createDatabaseQueryServices } from "./dbQueryServices.ts";
import { createReferenceQueries } from "./dbReferenceQueries.ts";
import { createStatePersistence } from "./dbStatePersistence.ts";
import { createDatabaseLocks } from "./dbLocks.ts";
import { createDatabaseSessionStore as createDatabaseSessionStoreRepository } from "./dbSessions.ts";
import { scopedAuxiliaryKey, scopedStoreId, scopedTenantId } from "./dbScope.ts";
import { createPostgresInitializer } from "./dbPostgresInitializer.ts";
import {
  appendOnlyCollection,
  applySchemaComments,
  buildDeleteMissingRowsQuery,
  bulkUpsertRows,
  collectionTables,
  getCollectionTablesForKeys,
  quoteIdentifier,
  rowId,
} from "./dbCollectionStorage.ts";
export {
  appendOnlyCollection,
  buildDeleteMissingRowsQuery,
  bulkUpsertRows,
  getCollectionTablesForKeys,
} from "./dbCollectionStorage.ts";
export {BULK_UPSERT_CHUNK_SIZE} from "./dbCollectionStorage.ts";
export {
  buildCommissionPageQuery,
  buildFinanceProfitFlowQuery,
  buildFinanceRecordPageQuery,
  buildInventoryPageQuery,
  buildInvoicePageQuery,
  buildLogPageQuery,
} from "./dbQueryBuilders.ts";
export type { FinanceProfitFlowKind, FinanceRecordKind } from "./dbQueryBuilders.ts";

const DATA_DIR = path.resolve(process.cwd(), "data");
const LEGACY_DATA_FILE = path.join(DATA_DIR, "app-state.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");

const LEGACY_IMPORT_ENABLED = process.env.POSTGRES_IMPORT_LEGACY_JSON !== "false";

let pool: Pool | null = null;
const enqueueStateSave = createResilientQueue();

type CollectionKey = Exclude<keyof AppState, "currentRole" | "customPermissions" | "currentUserId">;
export type StateCollectionKey = CollectionKey;
export type StateRecordSave = { key: CollectionKey; items: unknown[]; deleteMissing?: boolean; deleteIds?: string[] };
export type StateRecordTransactionHook = (client: PoolClient) => void | Promise<unknown>;
export type InventoryPageFilters = {
  tenantId?: string;
  storeId?: string;
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: string;
  category?: string;
  brand?: string;
  model?: string;
  condition?: string;
  entryStart?: string;
  entryEnd?: string;
  risk?: "mined" | "upturned" | "high";
  minStorageDays?: number;
  maxStorageDays?: number;
  minProfitMargin?: number;
  activeOnly?: boolean;
  warehouseLocation?: string;
  includeSold?: boolean;
  sortKey?: string;
  sortDirection?: "asc" | "desc";
};
export type CollectionPage<T> = { data: T[]; meta: { page: number; pageSize: number; total: number } };
export type LogPageFilters = { tenantId?: string; storeId?: string; page?: number; pageSize?: number; keyword?: string };
export type FinanceRecordPageFilters = {
  tenantId?: string;
  storeId?: string;
  page?: number;
  pageSize?: number;
  keyword?: string;
  accountId?: string;
  handler?: string;
  businessType?: string;
  direction?: string;
  relatedDocNo?: string;
  customerName?: string;
  supplierName?: string;
  dateStart?: string;
  dateEnd?: string;
  sortKey?: string;
  sortDirection?: "asc" | "desc";
};
export type FinanceRecordPage<T> = CollectionPage<T> & { meta: CollectionPage<T>["meta"] & { totalAmount?: number } };
export type FinanceProfitFlowFilters = {tenantId?: string; storeId?: string; dateStart?: string; dateEnd?: string};
export type FinanceProfitFlowRow = {date: string; income: number; expense: number; net: number};
export type InvoicePageKind = "purchase" | "sales";
export type InvoicePageFilters = {
  tenantId?: string;
  storeId?: string;
  page?: number;
  pageSize?: number;
  keyword?: string;
  sourceType?: string;
  channel?: string;
  paymentStatus?: string;
  outboundStatus?: string;
  dateStart?: string;
  dateEnd?: string;
  sortKey?: string;
  sortDirection?: "asc" | "desc";
};
export type InvoicePage<T> = CollectionPage<T> & {meta: CollectionPage<T>["meta"] & {summary: Record<string, number>}};
export type CommissionPageFilters = {
  tenantId?: string;
  storeId?: string;
  mode: CommissionMode;
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: string;
  handler?: string;
  dateStart?: string;
  dateEnd?: string;
  sortKey?: string;
  sortDirection?: "asc" | "desc";
};
export type CommissionPage<T> = CollectionPage<T> & {meta: CollectionPage<T>["meta"] & {summary: Record<string, number>}};
export type AiInsightsCacheRecord = {
  scope: string;
  sourceHash: string;
  payload: unknown;
  generatedAt: string;
  expiresAt: string;
  provider: string;
  model: string;
};
export type AiInsightActionStatus = "done" | "ignored";
export type AiInsightActionRecord = {
  insightId: string;
  status: AiInsightActionStatus;
  updatedBy: string;
  updatedAt: string;
};

export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env) {
  const isTest = env.NODE_ENV === "test";
  const databaseUrl = (isTest ? env.TEST_DATABASE_URL : env.DATABASE_URL)?.trim();
  if (isTest && databaseUrl && env.DATABASE_URL?.trim() === databaseUrl) {
    throw new Error("测试环境的 TEST_DATABASE_URL 不能与 DATABASE_URL 相同，已拒绝连接可能的生产数据库。");
  }
  return databaseUrl || "";
}

export function assertTestDatabaseConfigured(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== "test") {
    throw new Error("后端集成测试必须使用 NODE_ENV=test。");
  }
  if (!resolveDatabaseUrl(env)) {
    throw new Error("后端集成测试必须配置独立的 TEST_DATABASE_URL。");
  }
}

function requireDatabaseUrl() {
  const isTest = process.env.NODE_ENV === "test";
  const databaseUrl = resolveDatabaseUrl();
  if (!databaseUrl) {
    throw new Error(isTest
      ? "测试数据库未配置，请使用独立的 TEST_DATABASE_URL。"
      : "缺少 DATABASE_URL，系统已切换为 PostgreSQL 存储，请先配置 PostgreSQL 连接字符串。");
  }
  return databaseUrl;
}

export function assertProductionBootstrapPasswordConfigured(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV === "production" && !env.BOOTSTRAP_ADMIN_PASSWORD?.trim()) {
    throw new Error("首次初始化生产数据库必须配置 BOOTSTRAP_ADMIN_PASSWORD");
  }
}

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: requireDatabaseUrl(),
      ssl: (process.env.NODE_ENV === "test" ? process.env.TEST_DATABASE_SSL : process.env.DATABASE_SSL) === "true"
        ? { rejectUnauthorized: false }
        : undefined,
    });
  }
  return pool;
}

/**
 * Run an application-owned PostgreSQL transaction. Domain migrations and
 * normalized repositories use this helper so they share the same pool,
 * connection options, and schema initialization as the legacy state layer.
 */
async function rollbackQuietly(client: PoolClient) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original database error. The connection is released below;
    // a rollback failure must not hide the operation that actually failed.
  }
}

const postgresInitializer = createPostgresInitializer({
  getPool,
  collectionTables,
  applySchemaComments,
  applyCrmFoundationSchema,
  applyOperationalProjectionSchema,
  applyCommercialFoundationSchema,
  applyCommercialHardeningSchema,
  applyAccountingControlPlaneSchema,
  upgradePersistedUserPasswords,
  rollbackQuietly,
});
const initializePostgres = postgresInitializer.initializePostgres;

export async function withDatabaseTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  await initializePostgres();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

export type PersistedPasswordUpgradeRow = {
  id: string;
  data: SystemUserAccount;
  tenantId?: string | null;
  storeId?: string | null;
};

export type PasswordUpgradeBatch = {
  tenantId: string;
  storeId: string;
  rows: { id: string; json: string }[];
};

/**
 * Prepare password upgrades without losing the row's commercial scope.  The
 * password migration runs during startup and must never write a non-default
 * tenant row through the default scope: ids are globally unique, while the
 * scope columns are mandatory after the commercial foundation migration.
 */
export function buildPasswordUpgradeBatches(rows: PersistedPasswordUpgradeRow[]): PasswordUpgradeBatch[] {
  const batches = new Map<string, PasswordUpgradeBatch>();
  for (const row of rows) {
    const password = row.data?.password;
    if (!password || isPasswordHash(password)) continue;
    const tenantId = row.tenantId?.trim() || DEFAULT_TENANT_ID;
    const storeId = row.storeId?.trim() || DEFAULT_STORE_ID;
    const key = `${tenantId}\u0000${storeId}`;
    const batch = batches.get(key) || { tenantId, storeId, rows: [] };
    batch.rows.push({
      id: row.id,
      json: JSON.stringify({ ...row.data, password: hashPassword(password) }),
    });
    batches.set(key, batch);
  }
  return Array.from(batches.values());
}

async function upgradePersistedUserPasswords(client: PoolClient) {
  const result = await client.query<{
    id: string;
    data: SystemUserAccount;
    tenant_id: string | null;
    store_id: string | null;
  }>("SELECT id, data, tenant_id, store_id FROM gpu_system_users");
  const batches = buildPasswordUpgradeBatches(result.rows.map((row) => ({
    id: row.id,
    data: row.data,
    tenantId: row.tenant_id,
    storeId: row.store_id,
  })));
  for (const batch of batches) {
    await bulkUpsertRows(client, "gpu_system_users", batch.rows, batch.tenantId, batch.storeId);
  }
}

const databaseLocks = createDatabaseLocks({
  initializePostgres,
  getPool,
  stateLockKey: "gpu_erp_state_write",
  authLockKey: "gpu_erp_auth_write",
});

export const acquireStateWriteLock = databaseLocks.acquireStateWriteLock;
export const acquireAuthWriteLock = databaseLocks.acquireAuthWriteLock;
const lockTransactionForStateWrite = databaseLocks.lockTransactionForStateWrite;

export function createDatabaseSessionStore() {
  return createDatabaseSessionStoreRepository({
    initializePostgres,
    getPool,
    defaultTenantId: DEFAULT_TENANT_ID,
  });
}

const aiInsightsRepository = createAiInsightsRepository({
  initializePostgres,
  getPool,
  scopedTenantId,
  scopedAuxiliaryKey,
  defaultTenantId: DEFAULT_TENANT_ID,
});

export const getAiInsightsCache = aiInsightsRepository.getAiInsightsCache;
export const saveAiInsightsCache = aiInsightsRepository.saveAiInsightsCache;
export const listAiInsightActions = aiInsightsRepository.listAiInsightActions;
export const saveAiInsightAction = aiInsightsRepository.saveAiInsightAction;
export const deleteAiInsightAction = aiInsightsRepository.deleteAiInsightAction;

const databaseQueryServices = createDatabaseQueryServices({initializePostgres, getPool});

export const queryInventoryPage = databaseQueryServices.queryInventoryPage;
export const queryLogsPage = databaseQueryServices.queryLogsPage;
export const queryCommissionPage = databaseQueryServices.queryCommissionPage;
export const queryFinanceProfitOtherFlows = databaseQueryServices.queryFinanceProfitOtherFlows;
export const querySettlementLedgerPage = databaseQueryServices.querySettlementLedgerPage;
export const queryPaymentInPage = databaseQueryServices.queryPaymentInPage;
export const queryPaymentOutPage = databaseQueryServices.queryPaymentOutPage;
export const queryPurchaseInvoicePage = databaseQueryServices.queryPurchaseInvoicePage;
export const querySalesInvoicePage = databaseQueryServices.querySalesInvoicePage;

const referenceQueries = createReferenceQueries({
  initializePostgres,
  getPool,
  scopedTenantId,
  scopedStoreId,
  defaultTenantId: DEFAULT_TENANT_ID,
  defaultStoreId: DEFAULT_STORE_ID,
});

export const findInventoryRecord = referenceQueries.findInventoryRecord;
export const findInventoryRecordBySn = referenceQueries.findInventoryRecordBySn;
export const findSystemUserById = referenceQueries.findSystemUserById;
export const findSystemUserByUsername = referenceQueries.findSystemUserByUsername;
export const findActiveTenantMembership = referenceQueries.findActiveTenantMembership;
export const listInspectionVersions = referenceQueries.listInspectionVersions;

const accountingEventOperations = createAccountingEventOperations({
  initializePostgres,
  getPool,
  scopedTenantId,
  scopedStoreId,
});

export const listAccountingEvents = accountingEventOperations.listAccountingEvents;
export const getAccountingEvent = accountingEventOperations.getAccountingEvent;
export const listAccountingReversalDocuments = accountingEventOperations.listReversalDocuments;
export const createAccountingReversalDocumentInTransaction = accountingEventOperations.createAccountingReversalDocumentInTransaction;

const financeControlsOperations = createFinanceControlsOperations({
  initializePostgres,
  getPool,
  scopedTenantId,
  scopedStoreId,
});

export const saveFinanceDailySnapshotInTransaction = financeControlsOperations.saveDailySnapshotInTransaction;
export const saveFinanceDailySnapshot = financeControlsOperations.saveDailySnapshot;
export const listFinanceDailySnapshots = financeControlsOperations.listDailySnapshots;
export const syncFinanceIntegrityAlertsInTransaction = financeControlsOperations.syncFinanceIntegrityAlertsInTransaction;
export const listFinanceIntegrityAlerts = financeControlsOperations.listFinanceIntegrityAlerts;

const statePersistence = createStatePersistence({
  initializePostgres,
  getPool,
  scopedTenantId,
  scopedStoreId,
  defaultTenantId: DEFAULT_TENANT_ID,
  collectionKeys: collectionTables.map(({key}) => key),
  getCollectionTablesForKeys,
  buildDeleteMissingRowsQuery,
  bulkUpsertRows,
  appendOnlyCollection,
  rowId,
  quoteIdentifier,
  enqueueStateSave,
  lockTransactionForStateWrite,
  rollbackQuietly,
  syncAccountingEventsForRecordsInTransaction: accountingEventOperations.syncAccountingEventsForRecordsInTransaction,
  assertProductionBootstrapPasswordConfigured: () => assertProductionBootstrapPasswordConfigured(),
  legacyDataFile: LEGACY_DATA_FILE,
  legacyImportEnabled: LEGACY_IMPORT_ENABLED,
});

export const getStateRevision = statePersistence.getStateRevision;
export const loadState = statePersistence.loadState;
export const loadStateCollections = statePersistence.loadStateCollections;
export const saveState = statePersistence.saveState;
export const saveStateCollections = statePersistence.saveStateCollections;
export const saveStateRecords = statePersistence.saveStateRecords;
export const appendInspectionVersionInTransaction = statePersistence.appendInspectionVersionInTransaction;

const databaseBackups = createDatabaseBackups({
  initializePostgres,
  getPool,
  scopedTenantId,
  defaultTenantId: DEFAULT_TENANT_ID,
  backupDir: BACKUP_DIR,
  snapshotState: statePersistence.snapshotState,
  rollbackQuietly,
});

export const createManualBackup = databaseBackups.createManualBackup;
export const listBackups = databaseBackups.listBackups;
export const writeDownloadedBackup = databaseBackups.writeDownloadedBackup;

const dailyOperations = createDailyOperations({
  initializePostgres,
  getPool,
  scopedTenantId,
  scopedStoreId,
});

export const claimDailyNotification = dailyOperations.claimDailyNotification;
export const markDailyNotificationSent = dailyOperations.markDailyNotificationSent;
export const markDailyNotificationFailed = dailyOperations.markDailyNotificationFailed;
export const getDailyClosing = dailyOperations.getDailyClosing;
export const listDailyClosings = dailyOperations.listDailyClosings;
export const saveDailyClosing = dailyOperations.saveDailyClosing;
export const saveDailyClosingInTransaction = dailyOperations.saveDailyClosingInTransaction;

const accountingPeriodOperations = createAccountingPeriodOperations({
  initializePostgres,
  getPool,
  scopedTenantId,
  scopedStoreId,
});

export const getAccountingPeriod = accountingPeriodOperations.getAccountingPeriod;
export const listAccountingPeriods = accountingPeriodOperations.listAccountingPeriods;
export const isAccountingPeriodClosed = accountingPeriodOperations.isAccountingPeriodClosed;
export const closeAccountingPeriod = accountingPeriodOperations.closeAccountingPeriod;
export const closeAccountingPeriodInTransaction = accountingPeriodOperations.closeAccountingPeriodInTransaction;
export const reopenAccountingPeriod = accountingPeriodOperations.reopenAccountingPeriod;
export const reopenAccountingPeriodInTransaction = accountingPeriodOperations.reopenAccountingPeriodInTransaction;
export const accountingPeriodFromDate = accountingPeriodOperations.periodFromDate;
export const normalizeAccountingPeriod = accountingPeriodOperations.normalizePeriod;

const financeReconciliationActionOperations = createFinanceReconciliationActionOperations({
  initializePostgres,
  getPool,
  withDatabaseTransaction,
  scopedTenantId,
  scopedStoreId,
});

export const listFinanceReconciliationActions = financeReconciliationActionOperations.listActions;
export const createFinanceReconciliationAction = financeReconciliationActionOperations.createAction;
export const createFinanceReconciliationActionInTransaction = financeReconciliationActionOperations.createActionInTransaction;

export const dataFilePath = "postgresql:DATABASE_URL";
