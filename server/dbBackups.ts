import {mkdir, writeFile} from "node:fs/promises";
import path from "node:path";
import type {Pool, PoolClient} from "pg";
import type {AppState} from "./store.ts";

type DatabaseBackupsDependencies = {
  initializePostgres: () => Promise<void>;
  getPool: () => Pool;
  scopedTenantId: (tenantId?: string) => string;
  defaultTenantId: string;
  backupDir: string;
  snapshotState: (client: PoolClient, tenantId?: string) => Promise<AppState>;
  rollbackQuietly: (client: PoolClient) => Promise<void>;
};

function cloneWithoutRuntimeSession(state: AppState): AppState {
  return {...state, currentUserId: undefined};
}

/** PostgreSQL snapshot and export operations, kept separate from live state persistence. */
export function createDatabaseBackups({
  initializePostgres,
  getPool,
  scopedTenantId,
  defaultTenantId,
  backupDir,
  snapshotState,
  rollbackQuietly,
}: DatabaseBackupsDependencies) {
  function scopedBackupId(baseId: string, tenantId?: string) {
    const scope = scopedTenantId(tenantId);
    return scope === defaultTenantId ? baseId : `${encodeURIComponent(scope)}::${baseId}`;
  }

  function backupScopeSql(tenantId?: string) {
    const scope = scopedTenantId(tenantId);
    return scope === defaultTenantId
      ? {sql: "id NOT LIKE $1", values: ["%::%"]}
      : {sql: "id LIKE $1", values: [`${encodeURIComponent(scope)}::%`]};
  }

  async function createManualBackup(tenantId?: string): Promise<{file: string}> {
    await initializePostgres();
    const client = await getPool().connect();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupId = scopedBackupId(`postgres-backup-${stamp}`, tenantId);
    try {
      await client.query("BEGIN");
      const snapshot = await snapshotState(client, tenantId);
      await client.query(
        "INSERT INTO gpu_db_backups (id, snapshot) VALUES ($1, $2::jsonb)",
        [backupId, JSON.stringify(snapshot)],
      );
      await client.query("COMMIT");
      return {file: `postgres:${backupId}`};
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async function listBackups(tenantId?: string): Promise<Array<{name: string; size: number; createdAt: string}>> {
    await initializePostgres();
    const scope = backupScopeSql(tenantId);
    const result = await getPool().query<{id: string; size: string; created_at: Date}>(`
      SELECT id, pg_column_size(snapshot)::text AS size, created_at
      FROM gpu_db_backups
      WHERE ${scope.sql}
      ORDER BY created_at DESC
      LIMIT 100
    `, scope.values);
    return result.rows.map((row) => ({
      name: row.id,
      size: Number(row.size || 0),
      createdAt: row.created_at.toISOString(),
    }));
  }

  async function writeDownloadedBackup(state: AppState): Promise<string> {
    await mkdir(backupDir, {recursive: true});
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = path.join(backupDir, `postgres-export-${stamp}.json`);
    await writeFile(backupFile, `${JSON.stringify(cloneWithoutRuntimeSession(state), null, 2)}\n`, "utf8");
    return backupFile;
  }

  return {createManualBackup, listBackups, writeDownloadedBackup};
}

export type {DatabaseBackupsDependencies};
