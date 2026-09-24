import {randomUUID} from "node:crypto";
import type {Pool, PoolClient} from "pg";

export type FinanceReconciliationActionType = "reviewed" | "resolved" | "reversal_requested";

export type FinanceReconciliationAction = {
  id: string;
  tenantId: string;
  storeId: string;
  issueFingerprint: string;
  issueCode: string;
  domain: string;
  entityId?: string;
  action: FinanceReconciliationActionType;
  notes?: string;
  actor: string;
  createdAt: string;
};

type FinanceReconciliationActionDependencies = {
  initializePostgres: () => Promise<void>;
  getPool: () => Pool;
  withDatabaseTransaction: <T>(callback: (client: PoolClient) => Promise<T>) => Promise<T>;
  scopedTenantId: (tenantId?: string) => string;
  scopedStoreId: (storeId?: string) => string;
};

function mapRow(row: Record<string, unknown>): FinanceReconciliationAction {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    storeId: String(row.store_id),
    issueFingerprint: String(row.issue_fingerprint),
    issueCode: String(row.issue_code),
    domain: String(row.domain),
    entityId: row.entity_id ? String(row.entity_id) : undefined,
    action: row.action as FinanceReconciliationActionType,
    notes: row.notes ? String(row.notes) : undefined,
    actor: String(row.actor),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

/** Durable operator handling history for finance reconciliation findings. */
export function createFinanceReconciliationActionOperations({
  initializePostgres,
  getPool,
  withDatabaseTransaction,
  scopedTenantId,
  scopedStoreId,
}: FinanceReconciliationActionDependencies) {
  async function listActions(limit = 100, tenantId?: string, storeId?: string) {
    await initializePostgres();
    const safeLimit = Math.max(1, Math.min(500, Math.floor(Number(limit) || 100)));
    const result = await getPool().query<Record<string, unknown>>(
      `SELECT id, tenant_id, store_id, issue_fingerprint, issue_code, domain, entity_id, action, notes, actor, created_at
         FROM gpu_finance_reconciliation_actions
        WHERE tenant_id = $1 AND store_id = $2
        ORDER BY created_at DESC, id DESC
        LIMIT $3`,
      [scopedTenantId(tenantId), scopedStoreId(storeId), safeLimit],
    );
    return result.rows.map(mapRow);
  }

  async function createActionInTransaction(client: PoolClient, input: {
    issueFingerprint: string;
    issueCode: string;
    domain: string;
    entityId?: string;
    action: FinanceReconciliationActionType;
    notes?: string;
    actor: string;
  }, tenantId?: string, storeId?: string) {
    const tenantScope = scopedTenantId(tenantId);
    const storeScope = scopedStoreId(storeId);
    const result = await client.query<Record<string, unknown>>(
      `INSERT INTO gpu_finance_reconciliation_actions
         (id, tenant_id, store_id, issue_fingerprint, issue_code, domain, entity_id, action, notes, actor)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, tenant_id, store_id, issue_fingerprint, issue_code, domain, entity_id, action, notes, actor, created_at`,
      [
        `FRA-${randomUUID()}`,
        tenantScope,
        storeScope,
        input.issueFingerprint,
        input.issueCode,
        input.domain,
        input.entityId || null,
        input.action,
        input.notes?.trim() || null,
        input.actor,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("财务异常处理记录写入失败");
    return mapRow(row);
  }

  async function createAction(input: {
    issueFingerprint: string;
    issueCode: string;
    domain: string;
    entityId?: string;
    action: FinanceReconciliationActionType;
    notes?: string;
    actor: string;
  }, tenantId?: string, storeId?: string) {
    await initializePostgres();
    return withDatabaseTransaction((client) => createActionInTransaction(client, input, tenantId, storeId));
  }

  return {listActions, createAction, createActionInTransaction};
}

export type {FinanceReconciliationActionDependencies};
