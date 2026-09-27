import type {Pool} from "pg";
import type {PersistedSession, SessionStore} from "./security.ts";

type DatabaseSessionDependencies = {
  initializePostgres: () => Promise<void>;
  getPool: () => Pool;
  defaultTenantId: string;
};

/** PostgreSQL-backed web session store, isolated from business state persistence. */
export function createDatabaseSessionStore({
  initializePostgres,
  getPool,
  defaultTenantId,
}: DatabaseSessionDependencies): SessionStore {
  return {
    async create(tokenHash: string, session: PersistedSession) {
      await initializePostgres();
      await getPool().query(
        `INSERT INTO gpu_sessions (token_hash, user_id, tenant_id, store_id, expires_at)
         VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0))
         ON CONFLICT (token_hash) DO UPDATE SET user_id = EXCLUDED.user_id, tenant_id = EXCLUDED.tenant_id, store_id = EXCLUDED.store_id, expires_at = EXCLUDED.expires_at, created_at = NOW()`,
        [tokenHash, session.userId, session.tenantId || defaultTenantId, session.storeId || null, session.expiresAt],
      );
    },
    async resolve(tokenHash: string) {
      await initializePostgres();
      const result = await getPool().query<{user_id: string; tenant_id: string | null; store_id: string | null; expires_at: Date}>(
        `DELETE FROM gpu_sessions WHERE token_hash = $1 AND expires_at <= NOW() RETURNING user_id, tenant_id, store_id, expires_at`,
        [tokenHash],
      );
      if (result.rowCount) return null;
      const active = await getPool().query<{user_id: string; tenant_id: string | null; store_id: string | null; expires_at: Date}>(
        "SELECT user_id, tenant_id, store_id, expires_at FROM gpu_sessions WHERE token_hash = $1 AND expires_at > NOW()",
        [tokenHash],
      );
      const row = active.rows[0];
      return row
        ? {userId: row.user_id, tenantId: row.tenant_id || defaultTenantId, storeId: row.store_id || undefined, expiresAt: row.expires_at.getTime()}
        : null;
    },
    async revoke(tokenHash: string) {
      await initializePostgres();
      await getPool().query("DELETE FROM gpu_sessions WHERE token_hash = $1", [tokenHash]);
    },
    async revokeUserSessions(userId: string, tenantId?: string) {
      await initializePostgres();
      const scope = tenantId?.trim();
      const result = await getPool().query(
        `DELETE FROM gpu_sessions WHERE user_id = $1${scope ? " AND tenant_id = $2" : ""}`,
        scope ? [userId, scope] : [userId],
      );
      return result.rowCount || 0;
    },
    async cleanupExpired(expiresBefore: number) {
      await initializePostgres();
      const result = await getPool().query(
        "DELETE FROM gpu_sessions WHERE expires_at <= to_timestamp($1 / 1000.0)",
        [expiresBefore],
      );
      return result.rowCount || 0;
    },
  };
}

export type {DatabaseSessionDependencies};
