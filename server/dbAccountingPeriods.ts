import type {Pool, PoolClient} from "pg";

export type AccountingPeriodStatus = "open" | "closed";

export type AccountingPeriod = {
  tenantId: string;
  storeId: string;
  period: string;
  status: AccountingPeriodStatus;
  closedAt?: string;
  closedBy?: string;
  remarks?: string;
  snapshot?: unknown;
};

type AccountingPeriodDependencies = {
  initializePostgres: () => Promise<void>;
  getPool: () => Pool;
  scopedTenantId: (tenantId?: string) => string;
  scopedStoreId: (storeId?: string) => string;
};

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function normalizePeriod(value: unknown) {
  const period = String(value || "").trim();
  if (!PERIOD_PATTERN.test(period)) throw new Error("会计期间必须是 YYYY-MM");
  return period;
}

function periodFromDate(value: unknown) {
  const date = String(value || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("业务日期必须是 YYYY-MM-DD");
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error("业务日期无效");
  }
  return date.slice(0, 7);
}

function mapRow(row: Record<string, unknown>): AccountingPeriod {
  return {
    tenantId: String(row.tenant_id),
    storeId: String(row.store_id),
    period: String(row.period),
    status: row.status === "closed" ? "closed" : "open",
    closedAt: row.closed_at instanceof Date ? row.closed_at.toISOString() : row.closed_at ? String(row.closed_at) : undefined,
    closedBy: row.closed_by ? String(row.closed_by) : undefined,
    remarks: row.remarks ? String(row.remarks) : undefined,
    snapshot: row.snapshot ?? undefined,
  };
}

/** Durable monthly accounting locks. Business rows remain in the legacy JSONB
 * collections, while period state is kept normalized so every process sees the
 * same lock before calculating a state mutation. */
export function createAccountingPeriodOperations({
  initializePostgres,
  getPool,
  scopedTenantId,
  scopedStoreId,
}: AccountingPeriodDependencies) {
  async function getAccountingPeriod(periodInput: string, tenantId?: string, storeId?: string) {
    await initializePostgres();
    const period = normalizePeriod(periodInput);
    const result = await getPool().query<Record<string, unknown>>(
      `SELECT tenant_id, store_id, period, status, closed_at, closed_by, remarks, snapshot
         FROM gpu_accounting_periods
        WHERE tenant_id = $1 AND store_id = $2 AND period = $3`,
      [scopedTenantId(tenantId), scopedStoreId(storeId), period],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async function listAccountingPeriods(limit = 24, tenantId?: string, storeId?: string) {
    await initializePostgres();
    const safeLimit = Math.max(1, Math.min(120, Math.floor(Number(limit) || 24)));
    const result = await getPool().query<Record<string, unknown>>(
      `SELECT tenant_id, store_id, period, status, closed_at, closed_by, remarks, snapshot
         FROM gpu_accounting_periods
        WHERE tenant_id = $1 AND store_id = $2
        ORDER BY period DESC
        LIMIT $3`,
      [scopedTenantId(tenantId), scopedStoreId(storeId), safeLimit],
    );
    return result.rows.map(mapRow);
  }

  async function isAccountingPeriodClosed(dateInput: string, tenantId?: string, storeId?: string) {
    const period = periodFromDate(dateInput);
    const row = await getAccountingPeriod(period, tenantId, storeId);
    return row?.status === "closed";
  }

  async function closeAccountingPeriod(input: {
    period: string;
    closedBy: string;
    remarks?: string;
    snapshot?: unknown;
  }, tenantId?: string, storeId?: string) {
    await initializePostgres();
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const closed = await closeAccountingPeriodInTransaction(client, input, tenantId, storeId);
      await client.query("COMMIT");
      return closed;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async function closeAccountingPeriodInTransaction(client: PoolClient, input: {
    period: string;
    closedBy: string;
    remarks?: string;
    snapshot?: unknown;
  }, tenantId?: string, storeId?: string) {
    const period = normalizePeriod(input.period);
    const scope = scopedTenantId(tenantId);
    const storeScope = scopedStoreId(storeId);
    const result = await client.query<Record<string, unknown>>(
      `INSERT INTO gpu_accounting_periods
         (tenant_id, store_id, period, status, closed_at, closed_by, remarks, snapshot, updated_at)
       VALUES ($1, $2, $3, 'closed', NOW(), $4, $5, $6::jsonb, NOW())
       ON CONFLICT (tenant_id, store_id, period) DO UPDATE SET
         status = 'closed', closed_at = NOW(), closed_by = EXCLUDED.closed_by,
         remarks = EXCLUDED.remarks, snapshot = EXCLUDED.snapshot, updated_at = NOW()
       RETURNING tenant_id, store_id, period, status, closed_at, closed_by, remarks, snapshot`,
      [scope, storeScope, period, input.closedBy, input.remarks || null, JSON.stringify(input.snapshot ?? null)],
    );
    return mapRow(result.rows[0]!);
  }

  async function reopenAccountingPeriod(periodInput: string, reopenedBy: string, remarks?: string, tenantId?: string, storeId?: string) {
    await initializePostgres();
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const reopened = await reopenAccountingPeriodInTransaction(client, periodInput, reopenedBy, remarks, tenantId, storeId);
      await client.query("COMMIT");
      return reopened;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async function reopenAccountingPeriodInTransaction(client: PoolClient, periodInput: string, reopenedBy: string, remarks?: string, tenantId?: string, storeId?: string) {
    const period = normalizePeriod(periodInput);
    const result = await client.query<Record<string, unknown>>(
      `UPDATE gpu_accounting_periods
          SET status = 'open', closed_at = NULL, closed_by = NULL,
              remarks = $4, updated_at = NOW()
        WHERE tenant_id = $1 AND store_id = $2 AND period = $3
        RETURNING tenant_id, store_id, period, status, closed_at, closed_by, remarks, snapshot`,
      [scopedTenantId(tenantId), scopedStoreId(storeId), period, remarks ? `${remarks}；由 ${reopenedBy} 重开` : `由 ${reopenedBy} 重开`],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  /** Lock a period on the same client as the state write when callers already
   * own a transaction. This closes the race between checking and posting. */
  async function assertOpenInTransaction(client: PoolClient, dateInput: string, tenantId?: string, storeId?: string) {
    const period = periodFromDate(dateInput);
    const result = await client.query<{status: AccountingPeriodStatus}>(
      `SELECT status FROM gpu_accounting_periods
        WHERE tenant_id = $1 AND store_id = $2 AND period = $3
        FOR SHARE`,
      [scopedTenantId(tenantId), scopedStoreId(storeId), period],
    );
    return result.rows[0]?.status !== "closed";
  }

  return {
    getAccountingPeriod,
    listAccountingPeriods,
    isAccountingPeriodClosed,
    closeAccountingPeriod,
    closeAccountingPeriodInTransaction,
    reopenAccountingPeriod,
    reopenAccountingPeriodInTransaction,
    assertOpenInTransaction,
    periodFromDate,
    normalizePeriod,
  };
}

export type {AccountingPeriodDependencies};
