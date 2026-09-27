import type {Pool} from "pg";
import type {InspectionRecord, SystemUserAccount} from "../src/types.ts";

type ReferenceQueryDependencies = {
  initializePostgres: () => Promise<void>;
  getPool: () => Pool;
  scopedTenantId: (tenantId?: string) => string;
  scopedStoreId: (storeId?: string) => string;
  defaultTenantId: string;
  defaultStoreId: string;
};

/** Small, tenant-scoped reference lookups shared by auth, inventory and audit flows. */
export function createReferenceQueries({
  initializePostgres,
  getPool,
  scopedTenantId,
  scopedStoreId,
  defaultTenantId,
  defaultStoreId,
}: ReferenceQueryDependencies) {
  async function findInventoryRecord<T = unknown>(id: string, tenantId?: string, storeId?: string): Promise<T | null> {
    await initializePostgres();
    const scope = tenantId?.trim();
    const storeScope = scope ? scopedStoreId(storeId) : undefined;
    const result = await getPool().query<{data: T}>(
      `SELECT data FROM gpu_inventory WHERE id = $1${scope ? ` AND tenant_id = $2${storeScope ? " AND store_id = $3" : ""}` : ""}`,
      scope ? (storeScope ? [id, scope, storeScope] : [id, scope]) : [id],
    );
    return result.rows[0]?.data || null;
  }

  async function findInventoryRecordBySn<T = unknown>(sn: string, tenantId?: string, storeId?: string): Promise<T | null> {
    await initializePostgres();
    const scope = tenantId?.trim();
    const storeScope = scope ? scopedStoreId(storeId) : undefined;
    const result = await getPool().query<{data: T}>(
      `SELECT data FROM gpu_inventory WHERE op_sn = LOWER($1)${scope ? ` AND tenant_id = $2${storeScope ? " AND store_id = $3" : ""}` : ""} LIMIT 1`,
      scope ? (storeScope ? [sn, scope, storeScope] : [sn, scope]) : [sn],
    );
    return result.rows[0]?.data || null;
  }

  /** Resolve the global login identity; tenant authorization is enforced by membership. */
  async function findSystemUserById(userId: string, tenantId?: string): Promise<SystemUserAccount | null> {
    await initializePostgres();
    const scope = scopedTenantId(tenantId);
    const result = await getPool().query<{data: SystemUserAccount; tenant_id: string}>(
      "SELECT data, tenant_id FROM gpu_system_users WHERE id = $1 ORDER BY CASE WHEN tenant_id = $2 THEN 0 ELSE 1 END, id ASC LIMIT 1",
      [userId, scope],
    );
    const user = result.rows[0]?.data;
    return user
      ? {...user, tenantId: user.tenantId || result.rows[0]?.tenant_id || scope, storeId: user.storeId || defaultStoreId}
      : null;
  }

  async function findSystemUserByUsername(username: string, tenantId?: string): Promise<SystemUserAccount | null> {
    await initializePostgres();
    const scope = tenantId?.trim();
    const result = await getPool().query<{data: SystemUserAccount; tenant_id: string}>(
      scope
        ? "SELECT data, tenant_id FROM gpu_system_users WHERE LOWER(data->>'username') = LOWER($1) AND tenant_id = $2 ORDER BY id ASC LIMIT 1"
        : "SELECT data, tenant_id FROM gpu_system_users WHERE LOWER(data->>'username') = LOWER($1) ORDER BY CASE WHEN tenant_id = $2 THEN 0 ELSE 1 END, id ASC LIMIT 1",
      scope ? [username.trim(), scope] : [username.trim(), defaultTenantId],
    );
    const user = result.rows[0]?.data;
    return user
      ? {...user, tenantId: user.tenantId || result.rows[0]?.tenant_id || scope || defaultTenantId, storeId: user.storeId || defaultStoreId}
      : null;
  }

  async function findActiveTenantMembership(userId: string, tenantId: string, storeId?: string) {
    await initializePostgres();
    const result = await getPool().query<{tenant_id: string; store_id: string; role: string; status: string; permissions: unknown}>(
      `SELECT tenant_id, store_id, role, status, permissions
         FROM gpu_tenant_memberships
        WHERE tenant_id = $1 AND user_id = $2 AND status = 'active'
          ${storeId ? "AND store_id = $3" : ""}
        ORDER BY created_at ASC LIMIT 1`,
      storeId ? [tenantId, userId, storeId] : [tenantId, userId],
    );
    const row = result.rows[0];
    return row
      ? {
          tenantId: row.tenant_id,
          storeId: row.store_id,
          role: row.role,
          status: row.status,
          permissions: row.permissions && typeof row.permissions === "object" ? row.permissions as Record<string, unknown> : {},
        }
      : null;
  }

  async function listInspectionVersions<T = InspectionRecord>(inspectionId: string, tenantId?: string): Promise<T[]> {
    await initializePostgres();
    const scope = scopedTenantId(tenantId);
    const result = await getPool().query<{data: T}>(
      `SELECT data
         FROM gpu_inspection_versions
        WHERE tenant_id = $1 AND inspection_id = $2
        ORDER BY record_version ASC`,
      [scope, inspectionId.trim()],
    );
    return result.rows.map((row) => row.data);
  }

  return {
    findInventoryRecord,
    findInventoryRecordBySn,
    findSystemUserById,
    findSystemUserByUsername,
    findActiveTenantMembership,
    listInspectionVersions,
  };
}

export type {ReferenceQueryDependencies};
