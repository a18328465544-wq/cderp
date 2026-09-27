import { withDatabaseTransaction } from "./db.ts";

export type SalesCustomerPageFilters = {
  tenantId?: string;
  page?: number;
  pageSize?: number;
  keyword?: string;
};

export type SalesCustomerRecord = {
  id: string;
  name?: string;
  phone?: string;
  contact?: string;
  wechat?: string;
  qq?: string;
  level?: string;
  source?: string;
  firstChannel?: string;
  type?: string;
  crmStatus?: string;
};

function pageValue(value: number | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed || fallback)) : fallback;
}

/**
 * Sales orders must bind the durable customer archive id. The normalized CRM
 * account is an enrichment/read model and can temporarily lag a legacy write,
 * so it must never be the only source used by the order-entry picker.
 */
export function buildSalesCustomerPageQuery(filters: SalesCustomerPageFilters = {}) {
  const page = pageValue(filters.page, 1);
  const pageSize = Math.min(200, pageValue(filters.pageSize, 30));
  const values: unknown[] = [];
  const clauses: string[] = [];
  const bind = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  if (filters.tenantId?.trim()) clauses.push(`tenant_id = ${bind(filters.tenantId.trim())}`);
  const keyword = filters.keyword?.trim();
  if (keyword) {
    clauses.push(`CONCAT_WS(' ', id, data->>'name', data->>'phone', data->>'contact', data->>'wechat', data->>'qq', data->>'company', data->>'remarks') ILIKE ${bind(`%${keyword}%`)}`);
  }
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    values,
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
  };
}

export async function listSalesCustomers(filters: SalesCustomerPageFilters = {}) {
  return withDatabaseTransaction(async (client) => {
    const query = buildSalesCustomerPageQuery(filters);
    const rows = await client.query<{ id: string; data: SalesCustomerRecord }>(
      `SELECT id, data
       FROM gpu_customers
       ${query.where}
       ORDER BY updated_at DESC, id ASC
       LIMIT $${query.values.length + 1} OFFSET $${query.values.length + 2}`,
      [...query.values, query.pageSize, query.offset],
    );
    const count = await client.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM gpu_customers ${query.where}`,
      query.values,
    );
    return {
      data: rows.rows.map((row) => ({ ...row.data, id: row.id })),
      meta: { page: query.page, pageSize: query.pageSize, total: Number(count.rows[0]?.total || 0) },
    };
  });
}
