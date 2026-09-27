import { withDatabaseTransaction } from "./db.ts";

export type CrmAccountPageFilters = {
  tenantId?: string;
  page?: number;
  pageSize?: number;
  keyword?: string;
  role?: string;
  ownerId?: string;
  status?: string;
};

export type CrmAccountListItem = {
  id: string;
  accountType: "individual" | "company";
  displayName: string;
  normalizedName: string;
  status: string;
  level?: string;
  ownerId?: string;
  source?: string;
  primaryPhone?: string;
  primaryWechat?: string;
  primaryQq?: string;
  city?: string;
  companyName?: string;
  roles: string[];
  contactCount: number;
  legacyCustomer?: unknown;
  legacyVendor?: unknown;
  updatedAt: string;
};

export type CrmTimelineItem = {
  id: string;
  eventType: string;
  sourceType: string;
  sourceId: string;
  summary: string;
  payload: unknown;
  actorId?: string;
  occurredAt: string;
};

export type CrmAccountPage = {
  data: CrmAccountListItem[];
  meta: { page: number; pageSize: number; total: number };
};

function pageValue(value: number | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed || fallback)) : fallback;
}

export function buildCrmAccountsPageQuery(filters: CrmAccountPageFilters = {}) {
  const page = pageValue(filters.page, 1);
  const pageSize = Math.min(200, pageValue(filters.pageSize, 30));
  const values: unknown[] = [];
  const clauses = ["a.deleted_at IS NULL"];
  const tenantId = filters.tenantId?.trim();
  const tenantPlaceholder = tenantId ? "$1" : undefined;
  if (tenantId) {
    values.push(tenantId);
    clauses.push(`a.tenant_id = ${tenantPlaceholder}`);
  }
  const bind = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  const keyword = filters.keyword?.trim();
  if (keyword) {
    clauses.push(`CONCAT_WS(' ', a.id, a.display_name, a.primary_phone, a.primary_wechat, a.primary_qq, a.city, a.company_name, a.owner_id, a.source, c.data->>'name', v.data->>'name', v.data->>'contactPerson', v.data->>'phone') ILIKE ${bind(`%${keyword}%`)}`);
  }
  if (filters.role?.trim()) {
    clauses.push(`EXISTS (SELECT 1 FROM gpu_crm_account_roles role_filter WHERE role_filter.account_id = a.id AND role_filter.tenant_id = a.tenant_id AND role_filter.role = ${bind(filters.role.trim())})`);
  }
  if (filters.ownerId?.trim()) clauses.push(`a.owner_id = ${bind(filters.ownerId.trim())}`);
  if (filters.status?.trim()) clauses.push(`a.status = ${bind(filters.status.trim())}`);
  const where = `WHERE ${clauses.join(" AND ")}`;
  const roleScope = tenantPlaceholder ? `WHERE tenant_id = ${tenantPlaceholder}` : "";
  const contactScope = tenantPlaceholder ? `WHERE tenant_id = ${tenantPlaceholder}` : "";
  const customerScope = tenantId ? ` AND c.tenant_id = ${tenantPlaceholder}` : "";
  const vendorScope = tenantId ? ` AND v.tenant_id = ${tenantPlaceholder}` : "";
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    values,
    where,
    listSql: `
      SELECT
        a.id,
        a.account_type,
        a.display_name,
        a.normalized_name,
        a.status,
        a.level,
        a.owner_id,
        a.source,
        a.primary_phone,
        a.primary_wechat,
        a.primary_qq,
        a.city,
        a.company_name,
        a.updated_at,
        COALESCE(role_summary.roles, ARRAY[]::text[]) AS roles,
        COALESCE(contact_summary.contact_count, 0)::int AS contact_count,
        c.data AS legacy_customer,
        v.data AS legacy_vendor
      FROM gpu_crm_accounts a
      LEFT JOIN (
        SELECT account_id, ARRAY_AGG(role ORDER BY role) AS roles
        FROM gpu_crm_account_roles
        ${roleScope}
        GROUP BY account_id
      ) role_summary ON role_summary.account_id = a.id
      LEFT JOIN (
        SELECT account_id, COUNT(*)::int AS contact_count
        FROM gpu_crm_contacts
        ${contactScope}
        GROUP BY account_id
      ) contact_summary ON contact_summary.account_id = a.id
      LEFT JOIN gpu_customers c ON c.id = a.legacy_customer_id${customerScope}
      LEFT JOIN gpu_vendors v ON v.id = a.legacy_vendor_id${vendorScope}
      ${where}
      ORDER BY a.updated_at DESC, a.id ASC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `,
    countSql: `
      SELECT COUNT(*)::text AS total
      FROM gpu_crm_accounts a
      LEFT JOIN gpu_customers c ON c.id = a.legacy_customer_id${customerScope}
      LEFT JOIN gpu_vendors v ON v.id = a.legacy_vendor_id${vendorScope}
      ${where}
    `,
  };
}

function mapAccount(row: {
  id: string;
  account_type: "individual" | "company";
  display_name: string;
  normalized_name: string;
  status: string;
  level: string | null;
  owner_id: string | null;
  source: string | null;
  primary_phone: string | null;
  primary_wechat: string | null;
  primary_qq: string | null;
  city: string | null;
  company_name: string | null;
  roles: string[];
  contact_count: number;
  legacy_customer: unknown;
  legacy_vendor: unknown;
  updated_at: Date;
}): CrmAccountListItem {
  return {
    id: row.id,
    accountType: row.account_type,
    displayName: row.display_name,
    normalizedName: row.normalized_name,
    status: row.status,
    level: row.level || undefined,
    ownerId: row.owner_id || undefined,
    source: row.source || undefined,
    primaryPhone: row.primary_phone || undefined,
    primaryWechat: row.primary_wechat || undefined,
    primaryQq: row.primary_qq || undefined,
    city: row.city || undefined,
    companyName: row.company_name || undefined,
    roles: row.roles || [],
    contactCount: Number(row.contact_count || 0),
    legacyCustomer: row.legacy_customer || undefined,
    legacyVendor: row.legacy_vendor || undefined,
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function listCrmAccounts(filters: CrmAccountPageFilters = {}): Promise<CrmAccountPage> {
  return withDatabaseTransaction(async (client) => {
    const query = buildCrmAccountsPageQuery(filters);
    const rows = await client.query<Parameters<typeof mapAccount>[0]>(query.listSql, [...query.values, query.pageSize, query.offset]);
    const count = await client.query<{ total: string }>(query.countSql, query.values);
    return {
      data: rows.rows.map(mapAccount),
      meta: { page: query.page, pageSize: query.pageSize, total: Number(count.rows[0]?.total || 0) },
    };
  });
}

export async function listCrmTimeline(accountId: string, options: { page?: number; pageSize?: number; tenantId?: string } = {}) {
  const page = pageValue(options.page, 1);
  const pageSize = Math.min(200, pageValue(options.pageSize, 50));
  return withDatabaseTransaction(async (client) => {
    const values: unknown[] = [accountId];
    const tenantClause = options.tenantId?.trim() ? ` AND tenant_id = $${values.push(options.tenantId.trim())}` : "";
    const rows = await client.query<{
      id: string;
      event_type: string;
      source_type: string;
      source_id: string;
      summary: string;
      payload: unknown;
      actor_id: string | null;
      occurred_at: Date;
    }>(
      `SELECT id, event_type, source_type, source_id, summary, payload, actor_id, occurred_at
       FROM gpu_crm_timeline_events
       WHERE account_id = $1${tenantClause}
       ORDER BY occurred_at DESC, id DESC
       LIMIT $${values.push(pageSize)} OFFSET $${values.push((page - 1) * pageSize)}`,
      values,
    );
    const countValues: unknown[] = [accountId];
    const countTenantClause = options.tenantId?.trim() ? ` AND tenant_id = $${countValues.push(options.tenantId.trim())}` : "";
    const count = await client.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM gpu_crm_timeline_events WHERE account_id = $1${countTenantClause}`,
      countValues,
    );
    const data: CrmTimelineItem[] = rows.rows.map((row) => ({
      id: row.id,
      eventType: row.event_type,
      sourceType: row.source_type,
      sourceId: row.source_id,
      summary: row.summary,
      payload: row.payload,
      actorId: row.actor_id || undefined,
      occurredAt: row.occurred_at.toISOString(),
    }));
    return { data, meta: { page, pageSize, total: Number(count.rows[0]?.total || 0) } };
  });
}
