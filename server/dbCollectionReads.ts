import type {PoolClient} from "pg";
import type {StateCollectionKey} from "./db.ts";

type CollectionTable = {key: StateCollectionKey; table: string};

/** Keep collection ordering and tenant/store boundaries identical to legacy reads. */
export async function readCollectionBatch(client: PoolClient, tables: CollectionTable[], tenantId: string, storeId: string) {
  const result = new Map<StateCollectionKey, unknown[]>();
  const values: unknown[] = [tenantId, storeId];
  const branches = tables.map(({key, table}) => {
    if (!/^gpu_[a-z_]+$/.test(table)) throw new Error("Invalid collection table");
    result.set(key, []);
    values.push(key);
    return `SELECT $${values.length}::text AS collection, id, data FROM ${table} WHERE tenant_id = $1 AND store_id = $2`;
  });
  if (!branches.length) return result;
  const rows = await client.query<{collection: StateCollectionKey; data: unknown}>(
    `SELECT collection, data FROM (${branches.join(" UNION ALL ")}) AS collections ORDER BY collection, id`, values);
  for (const row of rows.rows) result.get(row.collection)!.push(row.data);
  return result;
}
