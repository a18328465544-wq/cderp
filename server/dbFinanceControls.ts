import {createHash} from "node:crypto";
import type {Pool, PoolClient} from "pg";
import type {FinanceIntegrityAlert} from "../src/types/accounting.ts";
import type {FinanceReconciliationIssue} from "./financeReconciliation.ts";

type FinanceControlsDependencies = {
  initializePostgres: () => Promise<void>;
  getPool: () => Pool;
  scopedTenantId: (tenantId?: string) => string;
  scopedStoreId: (storeId?: string) => string;
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, nested]) => [key, stableValue(nested)]));
  }
  return value;
}

export function hashFinanceSnapshot(snapshot: unknown) {
  return createHash("sha256").update(JSON.stringify(stableValue(snapshot))).digest("hex");
}

function dateKey(value: unknown) {
  const date = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("财务快照日期必须是 YYYY-MM-DD");
  return date;
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapSnapshot(row: Record<string, unknown>) {
  return {
    tenantId: String(row.tenant_id),
    storeId: String(row.store_id),
    date: row.snapshot_date instanceof Date ? row.snapshot_date.toISOString().slice(0, 10) : String(row.snapshot_date),
    hash: String(row.snapshot_hash),
    snapshot: row.snapshot,
    sourceRevision: row.source_revision === null || row.source_revision === undefined ? undefined : numberValue(row.source_revision),
    createdBy: row.created_by ? String(row.created_by) : undefined,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

function mapAlert(row: Record<string, unknown>): FinanceIntegrityAlert {
  return {
    fingerprint: String(row.fingerprint),
    code: String(row.code),
    severity: row.severity === "warning" ? "warning" : "error",
    status: row.status === "resolved" ? "resolved" : "open",
    domain: String(row.domain),
    ...(row.entity_id ? {entityId: String(row.entity_id)} : {}),
    ...(row.source_event_id ? {sourceEventId: String(row.source_event_id)} : {}),
    firstSeenAt: row.first_seen_at instanceof Date ? row.first_seen_at.toISOString() : String(row.first_seen_at),
    lastSeenAt: row.last_seen_at instanceof Date ? row.last_seen_at.toISOString() : String(row.last_seen_at),
    ...(row.resolved_at ? {resolvedAt: row.resolved_at instanceof Date ? row.resolved_at.toISOString() : String(row.resolved_at)} : {}),
    ...(row.resolved_by ? {resolvedBy: String(row.resolved_by)} : {}),
    message: String(row.message),
    payload: row.payload && typeof row.payload === "object" ? row.payload as Record<string, unknown> : {},
  };
}

export function createFinanceControlsOperations({
  initializePostgres,
  getPool,
  scopedTenantId,
  scopedStoreId,
}: FinanceControlsDependencies) {
  async function saveDailySnapshotInTransaction(client: PoolClient, input: {
    date: string;
    snapshot: unknown;
    sourceRevision?: number;
    createdBy?: string;
  }, tenantId?: string, storeId?: string) {
    const result = await client.query<Record<string, unknown>>(
      `INSERT INTO gpu_finance_daily_snapshots
        (tenant_id, store_id, snapshot_date, snapshot_hash, snapshot, source_revision, created_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
       ON CONFLICT (tenant_id, store_id, snapshot_date) DO NOTHING
       RETURNING tenant_id, store_id, snapshot_date, snapshot_hash, snapshot, source_revision, created_by, created_at`,
      [scopedTenantId(tenantId), scopedStoreId(storeId), dateKey(input.date), hashFinanceSnapshot(input.snapshot), JSON.stringify(input.snapshot), input.sourceRevision ?? null, input.createdBy || null],
    );
    if (result.rows[0]) return mapSnapshot(result.rows[0]);
    const existing = await client.query<Record<string, unknown>>(
      `SELECT tenant_id, store_id, snapshot_date, snapshot_hash, snapshot, source_revision, created_by, created_at
         FROM gpu_finance_daily_snapshots WHERE tenant_id = $1 AND store_id = $2 AND snapshot_date = $3`,
      [scopedTenantId(tenantId), scopedStoreId(storeId), dateKey(input.date)],
    );
    return existing.rows[0] ? mapSnapshot(existing.rows[0]) : null;
  }

  async function saveDailySnapshot(input: {date: string; snapshot: unknown; sourceRevision?: number; createdBy?: string}, tenantId?: string, storeId?: string) {
    await initializePostgres();
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const saved = await saveDailySnapshotInTransaction(client, input, tenantId, storeId);
      await client.query("COMMIT");
      return saved;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async function listDailySnapshots(limit = 30, tenantId?: string, storeId?: string) {
    await initializePostgres();
    const result = await getPool().query<Record<string, unknown>>(
      `SELECT tenant_id, store_id, snapshot_date, snapshot_hash, snapshot, source_revision, created_by, created_at
         FROM gpu_finance_daily_snapshots WHERE tenant_id = $1 AND store_id = $2
        ORDER BY snapshot_date DESC LIMIT $3`,
      [scopedTenantId(tenantId), scopedStoreId(storeId), Math.max(1, Math.min(366, Math.floor(Number(limit) || 30)))],
    );
    return result.rows.map(mapSnapshot);
  }

  async function syncFinanceIntegrityAlertsInTransaction(client: PoolClient, issues: FinanceReconciliationIssue[], tenantId?: string, storeId?: string) {
    const scope = scopedTenantId(tenantId);
    const storeScope = scopedStoreId(storeId);
    const fingerprints = issues.map((issue) => issue.fingerprint);
    for (const issue of issues) {
      await client.query(
        `INSERT INTO gpu_finance_integrity_alerts
          (tenant_id, store_id, fingerprint, code, severity, status, domain, entity_id, source_event_id, message, payload, first_seen_at, last_seen_at, resolved_at, resolved_by)
         VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, NULL, $8, $9::jsonb, NOW(), NOW(), NULL, NULL)
         ON CONFLICT (tenant_id, store_id, fingerprint) DO UPDATE SET
           code = EXCLUDED.code, severity = EXCLUDED.severity, status = 'open', domain = EXCLUDED.domain,
           entity_id = EXCLUDED.entity_id, message = EXCLUDED.message, payload = EXCLUDED.payload,
           last_seen_at = NOW(), resolved_at = NULL, resolved_by = NULL`,
        [scope, storeScope, issue.fingerprint, issue.code, issue.severity, issue.domain, issue.entityId || null, issue.message, JSON.stringify({relatedIds: issue.relatedIds || [], sourcePath: issue.sourcePath, reversePath: issue.reversePath})],
      );
    }
    if (fingerprints.length) {
      await client.query(
        `UPDATE gpu_finance_integrity_alerts
            SET status = 'resolved', resolved_at = NOW(), resolved_by = 'reconciliation'
          WHERE tenant_id = $1 AND store_id = $2 AND status = 'open' AND NOT (fingerprint = ANY($3::text[]))`,
        [scope, storeScope, fingerprints],
      );
    } else {
      await client.query(
        `UPDATE gpu_finance_integrity_alerts SET status = 'resolved', resolved_at = NOW(), resolved_by = 'reconciliation'
          WHERE tenant_id = $1 AND store_id = $2 AND status = 'open'`,
        [scope, storeScope],
      );
    }
    return issues.length;
  }

  async function listFinanceIntegrityAlerts(input: {limit?: number; status?: string; tenantId?: string; storeId?: string} = {}) {
    await initializePostgres();
    const params: unknown[] = [scopedTenantId(input.tenantId), scopedStoreId(input.storeId)];
    const conditions = ["tenant_id = $1", "store_id = $2"];
    if (input.status === "open" || input.status === "resolved") {
      params.push(input.status);
      conditions.push(`status = $${params.length}`);
    }
    params.push(Math.max(1, Math.min(500, Math.floor(Number(input.limit) || 100))));
    const result = await getPool().query<Record<string, unknown>>(
      `SELECT fingerprint, code, severity, status, domain, entity_id, source_event_id, message, payload, first_seen_at, last_seen_at, resolved_at, resolved_by
         FROM gpu_finance_integrity_alerts WHERE ${conditions.join(" AND ")}
        ORDER BY CASE severity WHEN 'error' THEN 0 ELSE 1 END, last_seen_at DESC LIMIT $${params.length}`,
      params,
    );
    return result.rows.map(mapAlert);
  }

  return {saveDailySnapshotInTransaction, saveDailySnapshot, listDailySnapshots, syncFinanceIntegrityAlertsInTransaction, listFinanceIntegrityAlerts};
}

export type {FinanceControlsDependencies};
