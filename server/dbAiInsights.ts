import type {Pool} from "pg";
import type {
  AiInsightActionRecord,
  AiInsightActionStatus,
  AiInsightsCacheRecord,
} from "./db.ts";

type AiInsightsRepositoryDependencies = {
  initializePostgres: () => Promise<void>;
  getPool: () => Pool;
  scopedTenantId: (tenantId?: string) => string;
  scopedAuxiliaryKey: (value: string, tenantId?: string) => string;
  defaultTenantId: string;
};

/**
 * PostgreSQL persistence for generated AI insight snapshots and user action
 * state.  The AI service owns generation; this module only owns the durable
 * cache/index contract and tenant-safe key projection.
 */
export function createAiInsightsRepository({
  initializePostgres,
  getPool,
  scopedTenantId,
  scopedAuxiliaryKey,
  defaultTenantId,
}: AiInsightsRepositoryDependencies) {
  async function getAiInsightsCache(scope: string, tenantId?: string): Promise<AiInsightsCacheRecord | null> {
    await initializePostgres();
    const cacheScope = scopedAuxiliaryKey(scope, tenantId);
    const result = await getPool().query<{
      scope: string;
      source_hash: string;
      payload: unknown;
      generated_at: Date;
      expires_at: Date;
      provider: string;
      model: string;
    }>(
      `SELECT scope, source_hash, payload, generated_at, expires_at, provider, model
       FROM gpu_ai_insights
       WHERE scope = $1`,
      [cacheScope],
    );
    const row = result.rows[0];
    return row ? {
      scope: row.scope,
      sourceHash: row.source_hash,
      payload: row.payload,
      generatedAt: row.generated_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
      provider: row.provider,
      model: row.model,
    } : null;
  }

  async function saveAiInsightsCache(record: AiInsightsCacheRecord, tenantId?: string) {
    await initializePostgres();
    const cacheScope = scopedAuxiliaryKey(record.scope, tenantId);
    await getPool().query(
      `INSERT INTO gpu_ai_insights (scope, source_hash, payload, provider, model, generated_at, expires_at)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6::timestamptz, $7::timestamptz)
       ON CONFLICT (scope) DO UPDATE SET
         source_hash = EXCLUDED.source_hash,
         payload = EXCLUDED.payload,
         provider = EXCLUDED.provider,
         model = EXCLUDED.model,
         generated_at = EXCLUDED.generated_at,
         expires_at = EXCLUDED.expires_at,
         updated_at = NOW()`,
      [cacheScope, record.sourceHash, JSON.stringify(record.payload), record.provider, record.model, record.generatedAt, record.expiresAt],
    );
  }

  async function listAiInsightActions(tenantId?: string): Promise<AiInsightActionRecord[]> {
    await initializePostgres();
    const scope = scopedTenantId(tenantId);
    const prefix = scope === defaultTenantId ? "" : `${scope}::`;
    const result = await getPool().query<{
      insight_id: string;
      status: AiInsightActionStatus;
      updated_by: string;
      updated_at: Date;
    }>(
      `SELECT insight_id, status, updated_by, updated_at
         FROM gpu_ai_insight_actions
        WHERE ${scope === defaultTenantId ? "insight_id NOT LIKE $1" : "insight_id LIKE $1"}
        ORDER BY updated_at DESC LIMIT 500`,
      [`${scope === defaultTenantId ? "%::%" : `${prefix}%`}`],
    );
    return result.rows.map(row => ({
      insightId: scope === defaultTenantId ? row.insight_id : row.insight_id.slice(prefix.length).replaceAll("%3A%3A", "::"),
      status: row.status,
      updatedBy: row.updated_by,
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async function saveAiInsightAction(record: Omit<AiInsightActionRecord, "updatedAt">, tenantId?: string): Promise<AiInsightActionRecord> {
    await initializePostgres();
    const scope = scopedTenantId(tenantId);
    const insightId = scopedAuxiliaryKey(record.insightId, scope);
    const result = await getPool().query<{
      insight_id: string;
      status: AiInsightActionStatus;
      updated_by: string;
      updated_at: Date;
    }>(
      `INSERT INTO gpu_ai_insight_actions (insight_id, status, updated_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (insight_id) DO UPDATE SET status = EXCLUDED.status, updated_by = EXCLUDED.updated_by, updated_at = NOW()
       RETURNING insight_id, status, updated_by, updated_at`,
      [insightId, record.status, record.updatedBy],
    );
    const row = result.rows[0];
    if (!row) throw new Error("AI insight action insert returned no row");
    return {insightId: record.insightId, status: row.status, updatedBy: row.updated_by, updatedAt: row.updated_at.toISOString()};
  }

  async function deleteAiInsightAction(insightId: string, tenantId?: string) {
    await initializePostgres();
    await getPool().query("DELETE FROM gpu_ai_insight_actions WHERE insight_id = $1", [scopedAuxiliaryKey(insightId, tenantId)]);
  }

  return {getAiInsightsCache, saveAiInsightsCache, listAiInsightActions, saveAiInsightAction, deleteAiInsightAction};
}

export type {AiInsightsRepositoryDependencies};
