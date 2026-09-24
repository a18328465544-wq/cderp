import type {Pool, PoolClient} from "pg";
import type {DailyClosing} from "../src/types.ts";

type DailyOperationsDependencies = {
  initializePostgres: () => Promise<void>;
  getPool: () => Pool;
  scopedTenantId: (tenantId?: string) => string;
  scopedStoreId: (storeId?: string) => string;
};

function normalizeDailyClosingDate(value: string) {
  const date = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

/** Durable daily-report delivery claims and daily closing snapshots. */
export function createDailyOperations({
  initializePostgres,
  getPool,
  scopedTenantId,
  scopedStoreId,
}: DailyOperationsDependencies) {
  /** Claim a daily notification before delivery. A successful report is never sent twice; a failed
   * delivery may be retried, and a stale in-progress delivery becomes retryable after 30 minutes. */
  async function claimDailyNotification(reportDate: string, notificationType: string, tenantId?: string, storeId?: string) {
    await initializePostgres();
    const scope = scopedTenantId(tenantId);
    const storeScope = scopedStoreId(storeId);
    const result = await getPool().query<{report_date: string}>(`
      INSERT INTO gpu_daily_notifications (tenant_id, store_id, report_date, notification_type, status, attempted_at)
      VALUES ($1, $2, $3, $4, 'sending', NOW())
      ON CONFLICT (tenant_id, store_id, report_date, notification_type) DO UPDATE SET
        status = 'sending', attempted_at = NOW(), error_message = NULL
      WHERE gpu_daily_notifications.status = 'failed'
         OR (gpu_daily_notifications.status = 'sending' AND gpu_daily_notifications.attempted_at < NOW() - INTERVAL '30 minutes')
      RETURNING report_date
    `, [scope, storeScope, reportDate, notificationType]);
    return result.rowCount === 1;
  }

  async function markDailyNotificationSent(reportDate: string, notificationType: string, payload: unknown, tenantId?: string, storeId?: string) {
    await initializePostgres();
    const scope = scopedTenantId(tenantId);
    const storeScope = scopedStoreId(storeId);
    await getPool().query(`
      UPDATE gpu_daily_notifications
      SET status = 'sent', sent_at = NOW(), payload = $5::jsonb, error_message = NULL
      WHERE tenant_id = $1 AND store_id = $2 AND report_date = $3 AND notification_type = $4
    `, [scope, storeScope, reportDate, notificationType, JSON.stringify(payload)]);
  }

  async function markDailyNotificationFailed(reportDate: string, notificationType: string, errorMessage: string, tenantId?: string, storeId?: string) {
    await initializePostgres();
    const scope = scopedTenantId(tenantId);
    const storeScope = scopedStoreId(storeId);
    await getPool().query(`
      UPDATE gpu_daily_notifications
      SET status = 'failed', error_message = $5
      WHERE tenant_id = $1 AND store_id = $2 AND report_date = $3 AND notification_type = $4
    `, [scope, storeScope, reportDate, notificationType, errorMessage.slice(0, 2000)]);
  }

  async function getDailyClosing(date: string, tenantId?: string, storeId?: string): Promise<DailyClosing | null> {
    await initializePostgres();
    const normalizedDate = normalizeDailyClosingDate(date);
    if (!normalizedDate) return null;
    const result = await getPool().query<{data: DailyClosing}>(
      "SELECT data FROM gpu_daily_closings WHERE tenant_id = $1 AND store_id = $2 AND date = $3",
      [scopedTenantId(tenantId), scopedStoreId(storeId), normalizedDate],
    );
    return result.rows[0]?.data || null;
  }

  async function listDailyClosings(limit = 14, tenantId?: string, storeId?: string): Promise<DailyClosing[]> {
    await initializePostgres();
    const safeLimit = Math.max(1, Math.min(90, Math.floor(Number(limit) || 14)));
    const result = await getPool().query<{data: DailyClosing}>(
      `SELECT data FROM gpu_daily_closings
        WHERE tenant_id = $1 AND store_id = $2
        ORDER BY date DESC LIMIT $3`,
      [scopedTenantId(tenantId), scopedStoreId(storeId), safeLimit],
    );
    return result.rows.map((row) => row.data);
  }

  async function saveDailyClosing(closing: DailyClosing, tenantId?: string, storeId?: string): Promise<DailyClosing> {
    await initializePostgres();
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const saved = await saveDailyClosingInTransaction(client, closing, tenantId, storeId);
      await client.query("COMMIT");
      return saved;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async function saveDailyClosingInTransaction(client: PoolClient, closing: DailyClosing, tenantId?: string, storeId?: string): Promise<DailyClosing> {
    const normalizedDate = normalizeDailyClosingDate(closing.date);
    if (!normalizedDate) throw new Error("日结日期必须是 YYYY-MM-DD");
    const scope = scopedTenantId(tenantId);
    const storeScope = scopedStoreId(storeId);
    const result = await client.query<{data: DailyClosing}>(`
      INSERT INTO gpu_daily_closings (tenant_id, store_id, date, data, updated_at) VALUES ($1, $2, $3, $4::jsonb, NOW())
      ON CONFLICT (tenant_id, store_id, date) DO NOTHING
      RETURNING data
    `, [scope, storeScope, normalizedDate, JSON.stringify(closing)]);
    if (result.rows[0]?.data) return result.rows[0].data;
    const existing = await client.query<{data: DailyClosing}>(
      "SELECT data FROM gpu_daily_closings WHERE tenant_id = $1 AND store_id = $2 AND date = $3",
      [scope, storeScope, normalizedDate],
    );
    return existing.rows[0]?.data || closing;
  }

  return {
    claimDailyNotification,
    markDailyNotificationSent,
    markDailyNotificationFailed,
    getDailyClosing,
    listDailyClosings,
    saveDailyClosing,
    saveDailyClosingInTransaction,
  };
}

export type {DailyOperationsDependencies};
