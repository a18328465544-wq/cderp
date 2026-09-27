import {withDatabaseTransaction} from "./db.ts";

export type CustomerDirectoryPageFilters = {
  tenantId?: string;
  page?: number;
  pageSize?: number;
  keyword?: string;
  type?: string;
  channel?: string;
  level?: string;
  sortKey?: string;
  sortDirection?: "asc" | "desc";
};

const numericJson = (key: string) => `CASE WHEN COALESCE(data->>'${key}', '') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (data->>'${key}')::numeric ELSE 0 END`;
const normalizedLevel = `CASE WHEN data->>'isCoreCustomer' = 'true' OR data->>'level' = 'S级' THEN 'S级' ELSE COALESCE(NULLIF(data->>'level', ''), 'C级') END`;
const sortExpressions: Record<string, string> = {
  name: `COALESCE(data->>'name', '')`,
  level: normalizedLevel,
  totalAmount: numericJson("totalAmount"),
  receivableBalance: numericJson("receivableBalance"),
  payableBalance: numericJson("payableBalance"),
  lastDealTime: `COALESCE(data->>'lastDealTime', '')`,
};

function positiveInteger(value: number | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed || fallback)) : fallback;
}

export function buildCustomerDirectoryPageQuery(filters: CustomerDirectoryPageFilters = {}) {
  const page = positiveInteger(filters.page, 1);
  const pageSize = Math.min(100, positiveInteger(filters.pageSize, 20));
  const values: unknown[] = [];
  const clauses: string[] = [];
  const bind = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  if (filters.tenantId?.trim()) clauses.push(`tenant_id = ${bind(filters.tenantId.trim())}`);
  if (filters.keyword?.trim()) {
    clauses.push(`CONCAT_WS(' ', id, data->>'name', data->>'phone', data->>'contact', data->>'wechat', data->>'qq', data->>'company', data->>'owner', data->>'remarks', data->>'tags') ILIKE ${bind(`%${filters.keyword.trim()}%`)}`);
  }
  if (filters.type?.trim() && filters.type !== "all") clauses.push(`COALESCE(data->>'type', '个人买家客户') = ${bind(filters.type.trim())}`);
  if (filters.channel?.trim() && filters.channel !== "all") clauses.push(`COALESCE(NULLIF(data->>'firstChannel', ''), NULLIF(data->>'source', ''), '未记录') = ${bind(filters.channel.trim())}`);
  if (filters.level?.trim() && filters.level !== "all") clauses.push(`${normalizedLevel} = ${bind(filters.level.trim())}`);
  const sortExpression = sortExpressions[filters.sortKey || ""] || `COALESCE(data->>'lastDealTime', '')`;
  const sortDirection = filters.sortDirection === "asc" ? "ASC" : "DESC";
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    values,
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    orderBy: `${sortExpression} ${sortDirection} NULLS LAST, updated_at DESC, id ASC`,
  };
}

export async function listCustomerDirectoryPage(filters: CustomerDirectoryPageFilters = {}) {
  return withDatabaseTransaction(async (client) => {
    const query = buildCustomerDirectoryPageQuery(filters);
    const pageValues = [...query.values, query.pageSize, query.offset];
    const rows = await client.query<{id: string; data: Record<string, unknown>}>(
      `SELECT id, data FROM gpu_customers ${query.where}
       ORDER BY ${query.orderBy}
       LIMIT $${query.values.length + 1} OFFSET $${query.values.length + 2}`,
      pageValues,
    );
    const aggregate = await client.query<{
      total: string;
      core_count: string;
      receivable: string;
      payable: string;
    }>(
      `SELECT COUNT(*)::text AS total,
              COUNT(*) FILTER (WHERE ${normalizedLevel} = 'S级')::text AS core_count,
              COALESCE(SUM(${numericJson("receivableBalance")}), 0)::text AS receivable,
              COALESCE(SUM(${numericJson("payableBalance")}), 0)::text AS payable
       FROM gpu_customers ${query.where}`,
      query.values,
    );
    const tenantClause = filters.tenantId?.trim() ? `WHERE tenant_id = $1` : "";
    const tenantValues = filters.tenantId?.trim() ? [filters.tenantId.trim()] : [];
    const options = await client.query<{type: string; channel: string}>(
      `SELECT DISTINCT
         COALESCE(data->>'type', '个人买家客户') AS type,
         COALESCE(NULLIF(data->>'firstChannel', ''), NULLIF(data->>'source', ''), '未记录') AS channel
       FROM gpu_customers ${tenantClause}`,
      tenantValues,
    );
    const summary = aggregate.rows[0];
    return {
      data: rows.rows.map((row) => ({...row.data, id: row.id})),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total: Number(summary?.total || 0),
        summary: {
          coreCount: Number(summary?.core_count || 0),
          receivable: Number(summary?.receivable || 0),
          payable: Number(summary?.payable || 0),
        },
        types: Array.from(new Set(options.rows.map((row) => row.type).filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-CN")),
        channels: Array.from(new Set(options.rows.map((row) => row.channel).filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-CN")),
      },
    };
  });
}
