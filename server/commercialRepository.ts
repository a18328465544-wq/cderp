import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PoolClient } from "pg";
import { loadState, withDatabaseTransaction } from "./db.ts";
import { sanitizeUserAccount } from "./security.ts";
import {
  COMMERCIAL_PLAN_DEFAULTS,
  DEFAULT_STORE_ID,
  DEFAULT_STORE_NAME,
  DEFAULT_STORE_TIMEZONE,
  DEFAULT_TENANT_ID,
  DEFAULT_TENANT_NAME,
  DEFAULT_TENANT_SLUG,
  commercialMembershipStatusValues,
  commercialPlanCodeValues,
  commercialExportFormatValues,
  commercialStoreStatusValues,
  commercialSubscriptionStatusValues,
  commercialUsageMetricValues,
  type CommercialPlanCode,
  type MembershipStatus,
  type SubscriptionStatus,
  type TenantStatus,
} from "./commercialConstants.ts";

export type CommercialTenant = {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  planCode: CommercialPlanCode;
  trialEndsAt?: string;
  settings: Record<string, unknown>;
};

export type CommercialStore = {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  timezone: string;
  currency: string;
  status: "active" | "archived";
};

export type CommercialMembership = {
  tenantId: string;
  userId: string;
  storeId: string;
  role: string;
  status: MembershipStatus;
  permissions: Record<string, unknown>;
  invitedBy?: string;
  invitedAt?: string;
  joinedAt?: string;
};

export type CommercialSubscription = {
  tenantId: string;
  planCode: CommercialPlanCode;
  status: SubscriptionStatus;
  seatLimit: number;
  mediaBytesLimit: number;
  aiTokensLimit: number;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  externalCustomerId?: string;
  externalSubscriptionId?: string;
};

export type CommercialUsage = {
  metric: string;
  periodStart: string;
  quantity: number;
  limit: number | null;
  remaining: number | null;
};

export type CommercialContext = {
  tenant: CommercialTenant;
  store: CommercialStore;
  membership: CommercialMembership;
  subscription: CommercialSubscription;
  usage: CommercialUsage[];
};

export type CommercialFeatureGateInput = {
  tenant: Pick<CommercialTenant, "status" | "trialEndsAt"> | null;
  subscription: Pick<CommercialSubscription, "planCode" | "status" | "currentPeriodEnd"> | null;
  feature: string;
  now?: Date;
};

export class CommercialValidationError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "CommercialValidationError";
    this.code = code;
    this.status = status;
  }
}

/**
 * A tenant owner must be an existing, enabled login identity.  Keeping this
 * check pure makes provisioning safe to exercise without opening a database
 * connection and prevents an archived/disabled account from becoming the
 * only administrator of a newly-created tenant.
 */
export function assertOwnerAccountEligible(owner: { id: string; data?: unknown } | null | undefined) {
  if (!owner?.id) throw new CommercialValidationError("OWNER_NOT_FOUND", "企业负责人账号不存在", 404);
  const data = owner.data && typeof owner.data === "object" ? owner.data as Record<string, unknown> : {};
  const enabled = data.enabled;
  if (enabled !== true && enabled !== "true") {
    throw new CommercialValidationError("OWNER_DISABLED", "企业负责人账号未启用，无法创建企业", 409);
  }
  return owner;
}

const PLAN_CODES = new Set<CommercialPlanCode>(commercialPlanCodeValues);
const MEMBERSHIP_STATUSES = new Set<MembershipStatus>(commercialMembershipStatusValues);
const SUBSCRIPTION_STATUSES = new Set<SubscriptionStatus>(commercialSubscriptionStatusValues);
const USAGE_METRICS = new Map<string, "media_bytes_limit" | "ai_tokens_limit" | null>([
  [commercialUsageMetricValues[0], "media_bytes_limit"],
  [commercialUsageMetricValues[1], "ai_tokens_limit"],
  [commercialUsageMetricValues[2], null],
]);

export type IdempotencyRequest = {
  tenantId: string;
  route: string;
  key: string;
  requestHash: string;
};

export type IdempotencyClaim =
  | { replay: false }
  | { replay: true; statusCode: number; response: unknown };

/**
 * Keep retry identity independent from the request body shape.  Routes may add
 * fields over time, but a client retrying the same operation must still send
 * exactly the same canonical payload hash.
 */
export function hashIdempotencyPayload(payload: unknown) {
  return createHash("sha256").update(JSON.stringify(payload ?? null)).digest("hex");
}

function normalizeIdempotencyRequest(input: IdempotencyRequest) {
  const tenantId = text(input.tenantId, DEFAULT_TENANT_ID);
  const route = text(input.route);
  const key = text(input.key);
  const requestHash = text(input.requestHash);
  if (!key || key.length > 200 || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(key)) {
    throw new CommercialValidationError("INVALID_IDEMPOTENCY_KEY", "Idempotency-Key 格式无效");
  }
  if (!route || route.length > 240 || !route.startsWith("/api/")) {
    throw new CommercialValidationError("INVALID_IDEMPOTENCY_ROUTE", "幂等请求路由无效");
  }
  if (!/^[a-f0-9]{64}$/.test(requestHash)) {
    throw new CommercialValidationError("INVALID_IDEMPOTENCY_HASH", "幂等请求摘要无效");
  }
  return {tenantId, route, key, requestHash};
}

/**
 * Claim a mutation key before running the domain command.  The claim is
 * tenant-scoped and serialised by the composite primary key; completed
 * responses are replayed and an in-flight key is rejected instead of running
 * the business command twice.
 */
export async function claimIdempotencyKey(input: IdempotencyRequest): Promise<IdempotencyClaim> {
  const request = normalizeIdempotencyRequest(input);
  return withDatabaseTransaction(async (client) => {
    const claimed = await client.query<{ status: string; response_status: number | null; response: unknown }>(
      `INSERT INTO gpu_idempotency_keys (tenant_id, idempotency_key, route, request_hash, status, response_status, response, created_at, completed_at, expires_at)
       VALUES ($1, $2, $3, $4, 'processing', NULL, NULL, NOW(), NULL, NOW() + INTERVAL '24 hours')
       ON CONFLICT (tenant_id, idempotency_key, route) DO UPDATE SET
         request_hash = EXCLUDED.request_hash,
         status = 'processing', response_status = NULL, response = NULL,
         created_at = NOW(), completed_at = NULL, expires_at = NOW() + INTERVAL '24 hours'
       WHERE gpu_idempotency_keys.expires_at <= NOW()
       RETURNING status, response_status, response`,
      [request.tenantId, request.key, request.route, request.requestHash],
    );
    if (claimed.rowCount === 1) return {replay: false};

    const existing = await client.query<{ request_hash: string; status: string; response_status: number | null; response: unknown }>(
      `SELECT request_hash, status, response_status, response
         FROM gpu_idempotency_keys
        WHERE tenant_id = $1 AND idempotency_key = $2 AND route = $3
        FOR UPDATE`,
      [request.tenantId, request.key, request.route],
    );
    const row = existing.rows[0];
    if (!row) throw new CommercialValidationError("IDEMPOTENCY_CLAIM_FAILED", "无法取得幂等锁", 503);
    if (row.request_hash !== request.requestHash) {
      throw new CommercialValidationError("IDEMPOTENCY_KEY_REUSE", "同一幂等键不能用于不同请求", 409);
    }
    if (row.status === "completed" && row.response_status) {
      return {replay: true, statusCode: row.response_status, response: row.response};
    }
    throw new CommercialValidationError("IDEMPOTENCY_IN_PROGRESS", "相同请求正在处理中，请稍后重试", 409);
  });
}

export async function completeIdempotencyKeyInTransaction(
  client: PoolClient,
  input: IdempotencyRequest,
  statusCode: number,
  response: unknown,
) {
  const request = normalizeIdempotencyRequest(input);
  const result = await client.query(
    `UPDATE gpu_idempotency_keys
        SET status = 'completed', response_status = $4, response = $5::jsonb,
            completed_at = NOW(), expires_at = NOW() + INTERVAL '24 hours'
      WHERE tenant_id = $1 AND idempotency_key = $2 AND route = $3
        AND request_hash = $6 AND status = 'processing'`,
    [request.tenantId, request.key, request.route, statusCode, JSON.stringify(response), request.requestHash],
  );
  if (result.rowCount !== 1) throw new CommercialValidationError("IDEMPOTENCY_COMPLETION_FAILED", "幂等结果保存失败", 503);
}

export async function releaseIdempotencyKey(input: IdempotencyRequest) {
  const request = normalizeIdempotencyRequest(input);
  await withDatabaseTransaction(async (client) => {
    await client.query(
      `DELETE FROM gpu_idempotency_keys
        WHERE tenant_id = $1 AND idempotency_key = $2 AND route = $3
          AND request_hash = $4 AND status = 'processing'`,
      [request.tenantId, request.key, request.route, request.requestHash],
    );
  });
}

type OutboundReservationInvoice = {
  id: string;
  invoiceNo?: string;
  items?: Array<{inventoryId?: string}>;
};

/** Reserve every concrete inventory card in the same transaction as the
 * outbound state patch.  A second invoice can never claim an active card. */
export async function reserveSalesOutboundInventoryInTransaction(
  client: PoolClient,
  invoice: OutboundReservationInvoice,
  tenantId = DEFAULT_TENANT_ID,
  reservationKey = `sales-outbound:${invoice.id}`,
) {
  const inventoryIds = Array.from(new Set((invoice.items || []).map((item) => text(item.inventoryId)).filter(Boolean)));
  for (const inventoryId of inventoryIds) {
    const existing = await client.query<{invoice_id: string; status: string}>(
      `SELECT invoice_id, status FROM gpu_inventory_reservations
        WHERE tenant_id = $1 AND inventory_id = $2 AND status IN ('reserved', 'consumed')
        FOR UPDATE`,
      [tenantId, inventoryId],
    );
    const prior = existing.rows[0];
    if (prior && prior.invoice_id !== invoice.id) {
      throw new CommercialValidationError("INVENTORY_ALREADY_RESERVED", `库存卡 ${inventoryId} 已被其他销售单占用`, 409);
    }
    if (prior) continue;
    const inserted = await client.query(
      `INSERT INTO gpu_inventory_reservations (id, tenant_id, inventory_id, reservation_key, invoice_id, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'consumed', NOW())
       ON CONFLICT (tenant_id, inventory_id) WHERE status IN ('reserved', 'consumed') DO NOTHING
       RETURNING id`,
      [`reservation_${randomUUID()}`, tenantId, inventoryId, reservationKey, invoice.id],
    );
    if (inserted.rowCount === 1) continue;
    const conflict = await client.query<{invoice_id: string}>(
      `SELECT invoice_id FROM gpu_inventory_reservations
        WHERE tenant_id = $1 AND inventory_id = $2 AND status IN ('reserved', 'consumed')
        FOR UPDATE`,
      [tenantId, inventoryId],
    );
    if (conflict.rows[0]?.invoice_id !== invoice.id) {
      throw new CommercialValidationError("INVENTORY_ALREADY_RESERVED", `库存卡 ${inventoryId} 已被其他销售单占用`, 409);
    }
  }
}

export async function releaseInventoryReservationsInTransaction(
  client: PoolClient,
  inventoryIds: string[],
  tenantId = DEFAULT_TENANT_ID,
  invoiceId?: string,
) {
  const ids = Array.from(new Set(inventoryIds.map((id) => text(id)).filter(Boolean)));
  if (!ids.length) return;
  await client.query(
    `UPDATE gpu_inventory_reservations
        SET status = 'released', released_at = NOW()
      WHERE tenant_id = $1 AND inventory_id = ANY($2::text[])
        AND status IN ('reserved', 'consumed')
        ${invoiceId ? "AND invoice_id = $3" : ""}`,
    invoiceId ? [tenantId, ids, invoiceId] : [tenantId, ids],
  );
}

const TENANT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/;

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function optionalIso(value: unknown) {
  const candidate = text(value);
  if (!candidate) return undefined;
  const timestamp = Date.parse(candidate);
  if (!Number.isFinite(timestamp)) throw new CommercialValidationError("INVALID_DATE", "日期格式无效");
  return new Date(timestamp).toISOString();
}

function mapTenant(row: Record<string, unknown>): CommercialTenant {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    status: row.status as TenantStatus,
    planCode: row.plan_code as CommercialPlanCode,
    trialEndsAt: row.trial_ends_at instanceof Date ? row.trial_ends_at.toISOString() : undefined,
    settings: row.settings && typeof row.settings === "object" ? row.settings as Record<string, unknown> : {},
  };
}

function mapStore(row: Record<string, unknown>): CommercialStore {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    code: String(row.code),
    name: String(row.name),
    timezone: String(row.timezone),
    currency: String(row.currency),
    status: row.status as CommercialStore["status"],
  };
}

function mapMembership(row: Record<string, unknown>): CommercialMembership {
  return {
    tenantId: String(row.tenant_id),
    userId: String(row.user_id),
    storeId: String(row.store_id),
    role: String(row.role),
    status: row.status as MembershipStatus,
    permissions: row.permissions && typeof row.permissions === "object" ? row.permissions as Record<string, unknown> : {},
    invitedBy: row.invited_by ? String(row.invited_by) : undefined,
    invitedAt: row.invited_at instanceof Date ? row.invited_at.toISOString() : undefined,
    joinedAt: row.joined_at instanceof Date ? row.joined_at.toISOString() : undefined,
  };
}

function mapSubscription(row: Record<string, unknown>): CommercialSubscription {
  return {
    tenantId: String(row.tenant_id),
    planCode: row.plan_code as CommercialPlanCode,
    status: row.status as SubscriptionStatus,
    seatLimit: Number(row.seat_limit),
    mediaBytesLimit: Number(row.media_bytes_limit),
    aiTokensLimit: Number(row.ai_tokens_limit),
    currentPeriodStart: row.current_period_start instanceof Date ? row.current_period_start.toISOString().slice(0, 10) : undefined,
    currentPeriodEnd: row.current_period_end instanceof Date ? row.current_period_end.toISOString().slice(0, 10) : undefined,
    externalCustomerId: row.external_customer_id ? String(row.external_customer_id) : undefined,
    externalSubscriptionId: row.external_subscription_id ? String(row.external_subscription_id) : undefined,
  };
}

function mapUsage(row: Record<string, unknown>, subscription?: CommercialSubscription): CommercialUsage {
  const metric = String(row.metric);
  const limit = metric === "media_bytes"
    ? subscription?.mediaBytesLimit
    : metric === "ai_tokens"
      ? subscription?.aiTokensLimit
      : metric === "active_seats"
        ? subscription?.seatLimit
        : null;
  const quantity = Number(row.quantity || 0);
  return {
    metric,
    periodStart: row.period_start instanceof Date ? row.period_start.toISOString().slice(0, 10) : String(row.period_start),
    quantity,
    limit: limit === undefined ? null : limit,
    remaining: limit === undefined || limit === null ? null : Math.max(0, limit - quantity),
  };
}

async function findMembership(client: PoolClient, tenantId: string, userId: string, storeId?: string) {
  const result = await client.query<Record<string, unknown>>(
    `SELECT tenant_id, user_id, store_id, role, status, permissions, invited_by, invited_at, joined_at
     FROM gpu_tenant_memberships
     WHERE tenant_id = $1 AND user_id = $2 AND status <> 'deactivated'
       ${storeId ? "AND store_id = $3" : ""}
     ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, created_at ASC
     LIMIT 1`,
    storeId ? [tenantId, userId, storeId] : [tenantId, userId],
  );
  return result.rows[0] ? mapMembership(result.rows[0]) : null;
}

export async function getCommercialTenant(tenantId = DEFAULT_TENANT_ID): Promise<CommercialTenant | null> {
  return withDatabaseTransaction(async (client) => {
    const result = await client.query<Record<string, unknown>>(
      "SELECT id, slug, name, status, plan_code, trial_ends_at, settings FROM gpu_tenants WHERE id = $1",
      [tenantId],
    );
    return result.rows[0] ? mapTenant(result.rows[0]) : null;
  });
}

export async function assertCommercialTenantActive(tenantId = DEFAULT_TENANT_ID) {
  const tenant = await getCommercialTenant(tenantId);
  if (!tenant) throw new CommercialValidationError("TENANT_NOT_FOUND", "企业不存在", 404);
  if (tenant.status === "suspended") throw new CommercialValidationError("TENANT_SUSPENDED", "企业已暂停，请联系管理员", 423);
  if (tenant.status === "archived") throw new CommercialValidationError("TENANT_ARCHIVED", "企业已归档", 403);
  return tenant;
}

export async function createCommercialTenant(input: {
  slug: string;
  name: string;
  planCode?: CommercialPlanCode;
  ownerUserId?: string;
  ownerRole?: string;
}) {
  const slug = text(input.slug).toLowerCase();
  const name = text(input.name);
  const planCode = input.planCode || "pilot";
  const ownerUserId = text(input.ownerUserId);
  if (slug.length < 3 || slug.length > 63 || !TENANT_SLUG_PATTERN.test(slug)) {
    throw new CommercialValidationError("INVALID_TENANT_SLUG", "企业标识只能使用 3-63 位小写字母、数字和连字符");
  }
  if (!name || name.length > 120) throw new CommercialValidationError("INVALID_TENANT_NAME", "企业名称不能为空且不能超过 120 个字符");
  if (!PLAN_CODES.has(planCode)) throw new CommercialValidationError("INVALID_PLAN", "套餐代码无效");
  return withDatabaseTransaction(async (client) => {
    const id = `tenant_${randomUUID()}`;
    const storeId = `store_${randomUUID()}`;
    const defaults = COMMERCIAL_PLAN_DEFAULTS[planCode];
    try {
      const tenantResult = await client.query<Record<string, unknown>>(
        `INSERT INTO gpu_tenants (id, slug, name, status, plan_code)
         VALUES ($1, $2, $3, 'active', $4)
         RETURNING id, slug, name, status, plan_code, trial_ends_at, settings`,
        [id, slug, name, planCode],
      );
      await client.query(
        `INSERT INTO gpu_stores (id, tenant_id, code, name, timezone, currency)
         VALUES ($1, $2, 'MAIN', $3, $4, 'CNY')`,
        [storeId, id, name, DEFAULT_STORE_TIMEZONE],
      );
      await client.query(
        `INSERT INTO gpu_subscriptions (tenant_id, plan_code, status, seat_limit, media_bytes_limit, ai_tokens_limit)
         VALUES ($1, $2, 'trialing', $3, $4, $5)`,
        [id, planCode, defaults.seatLimit, defaults.mediaBytesLimit, defaults.aiTokensLimit],
      );
      await client.query("INSERT INTO gpu_tenant_settings (tenant_id) VALUES ($1)", [id]);
      if (ownerUserId) {
        const owner = await client.query<{ id: string; data?: unknown }>("SELECT id, data FROM gpu_system_users WHERE id = $1 LIMIT 1", [ownerUserId]);
        assertOwnerAccountEligible(owner.rows[0]);
        await client.query(
          `INSERT INTO gpu_tenant_memberships (tenant_id, user_id, store_id, role, status, joined_at)
           VALUES ($1, $2, $3, $4, 'active', NOW())`,
          [id, ownerUserId, storeId, text(input.ownerRole, "老板")],
        );
      }
      const tenant = tenantResult.rows[0];
      if (!tenant) throw new CommercialValidationError("TENANT_NOT_CREATED", "企业创建失败", 500);
      return { tenant: mapTenant(tenant), store: { id: storeId, tenantId: id, code: "MAIN", name, timezone: DEFAULT_STORE_TIMEZONE, currency: "CNY", status: "active" as const }, ownerUserId: ownerUserId || undefined };
    } catch (error) {
      if (error instanceof CommercialValidationError) throw error;
      if (error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "23505") {
        throw new CommercialValidationError("TENANT_SLUG_EXISTS", "企业标识已存在", 409);
      }
      throw error;
    }
  });
}

async function assertSeatAvailableOnClient(client: PoolClient, tenantId: string, userId: string, storeId: string, status: MembershipStatus) {
  if (status !== "active") return;
  const existing = await client.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM gpu_tenant_memberships WHERE tenant_id = $1 AND user_id = $2 AND store_id = $3 AND status = 'active'",
    [tenantId, userId, storeId],
  );
  if (Number(existing.rows[0]?.count || 0) > 0) return;
  const subscription = await client.query<{ seat_limit: string }>("SELECT seat_limit::text FROM gpu_subscriptions WHERE tenant_id = $1 FOR UPDATE", [tenantId]);
  const seatLimit = Number(subscription.rows[0]?.seat_limit);
  if (!Number.isFinite(seatLimit)) throw new CommercialValidationError("SUBSCRIPTION_NOT_FOUND", "企业订阅不存在", 404);
  const active = await client.query<{ count: string }>("SELECT COUNT(DISTINCT user_id)::text AS count FROM gpu_tenant_memberships WHERE tenant_id = $1 AND status = 'active'", [tenantId]);
  if (Number(active.rows[0]?.count || 0) >= seatLimit) throw new CommercialValidationError("SEAT_LIMIT_EXCEEDED", "已达到套餐成员席位上限", 409);
}

export async function assertSeatAvailable(tenantId: string, userId = "", storeId = DEFAULT_STORE_ID) {
  const normalizedUserId = text(userId);
  if (!normalizedUserId) throw new CommercialValidationError("INVALID_MEMBERSHIP", "成员账号不能为空");
  return withDatabaseTransaction(async (client) => {
    await assertSeatAvailableOnClient(client, tenantId, normalizedUserId, storeId, "active");
    return true;
  });
}

export async function getCommercialContext(userId: string, tenantId = DEFAULT_TENANT_ID, storeId?: string): Promise<CommercialContext | null> {
  return withDatabaseTransaction(async (client) => {
    const [tenantResult, storeResult, subscriptionResult] = await Promise.all([
      client.query<Record<string, unknown>>("SELECT id, slug, name, status, plan_code, trial_ends_at, settings FROM gpu_tenants WHERE id = $1", [tenantId]),
      storeId
        ? client.query<Record<string, unknown>>("SELECT id, tenant_id, code, name, timezone, currency, status FROM gpu_stores WHERE tenant_id = $1 AND id = $2 AND status = 'active' LIMIT 1", [tenantId, storeId])
        : client.query<Record<string, unknown>>("SELECT id, tenant_id, code, name, timezone, currency, status FROM gpu_stores WHERE tenant_id = $1 AND status = 'active' ORDER BY id ASC LIMIT 1", [tenantId]),
      client.query<Record<string, unknown>>("SELECT tenant_id, plan_code, status, seat_limit, media_bytes_limit, ai_tokens_limit, current_period_start, current_period_end, external_customer_id, external_subscription_id FROM gpu_subscriptions WHERE tenant_id = $1", [tenantId]),
    ]);
    const tenant = tenantResult.rows[0];
    const store = storeResult.rows[0];
    const subscription = subscriptionResult.rows[0];
    if (!tenant || !store || !subscription) return null;
    const membership = await findMembership(client, tenantId, userId, storeId);
    if (!membership) return null;
    const usageResult = await client.query<Record<string, unknown>>(
      `SELECT metric, period_start, quantity FROM gpu_usage_counters
       WHERE tenant_id = $1 AND period_start = date_trunc('month', CURRENT_DATE)::date
       UNION ALL
       SELECT 'active_seats' AS metric, date_trunc('month', CURRENT_DATE)::date AS period_start,
              COUNT(DISTINCT user_id)::numeric AS quantity
         FROM gpu_tenant_memberships
        WHERE tenant_id = $1 AND status = 'active'
       ORDER BY metric ASC`,
      [tenantId],
    );
    const mappedSubscription = mapSubscription(subscription);
    return {
      tenant: mapTenant(tenant),
      store: mapStore(store),
      membership,
      subscription: mappedSubscription,
      usage: usageResult.rows.map(row => mapUsage(row, mappedSubscription)),
    };
  });
}

function normalizeStoreCode(value: unknown) {
  return text(value).toUpperCase();
}

function validateStoreInput(input: { code: unknown; name: unknown; timezone?: unknown; currency?: unknown }) {
  const code = normalizeStoreCode(input.code);
  const name = text(input.name);
  const timezone = text(input.timezone, DEFAULT_STORE_TIMEZONE);
  const currency = text(input.currency, "CNY").toUpperCase();
  if (!/^[A-Z0-9](?:[A-Z0-9_-]{1,31})$/.test(code)) {
    throw new CommercialValidationError("INVALID_STORE_CODE", "门店编码只能使用 2-32 位大写字母、数字、下划线或连字符");
  }
  if (!name || name.length > 120) throw new CommercialValidationError("INVALID_STORE_NAME", "门店名称不能为空且不能超过 120 个字符");
  if (!/^[A-Za-z_]+\/[A-Za-z0-9_+.-]+$/.test(timezone) || timezone.length > 64) {
    throw new CommercialValidationError("INVALID_STORE_TIMEZONE", "门店时区格式无效");
  }
  if (!/^[A-Z]{3}$/.test(currency)) throw new CommercialValidationError("INVALID_STORE_CURRENCY", "门店币种必须是 3 位大写代码");
  return { code, name, timezone, currency };
}

export async function listCommercialStores(tenantId = DEFAULT_TENANT_ID) {
  return withDatabaseTransaction(async (client) => {
    const result = await client.query<Record<string, unknown>>(
      `SELECT id, tenant_id, code, name, timezone, currency, status
         FROM gpu_stores WHERE tenant_id = $1 ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, code ASC`,
      [tenantId],
    );
    return result.rows.map(mapStore);
  });
}

export async function createCommercialStore(input: {
  tenantId?: string;
  code: string;
  name: string;
  timezone?: string;
  currency?: string;
}) {
  const tenantId = text(input.tenantId, DEFAULT_TENANT_ID);
  const { code, name, timezone, currency } = validateStoreInput(input);
  return withDatabaseTransaction(async (client) => {
    const tenant = await client.query<{ status: TenantStatus }>("SELECT status FROM gpu_tenants WHERE id = $1 FOR SHARE", [tenantId]);
    const tenantStatus = tenant.rows[0]?.status;
    if (!tenantStatus) throw new CommercialValidationError("TENANT_NOT_FOUND", "企业不存在", 404);
    if (tenantStatus === "suspended") throw new CommercialValidationError("TENANT_SUSPENDED", "企业已暂停，请联系管理员", 423);
    if (tenantStatus === "archived") throw new CommercialValidationError("TENANT_ARCHIVED", "企业已归档", 403);
    const id = `store_${randomUUID()}`;
    try {
      const result = await client.query<Record<string, unknown>>(
        `INSERT INTO gpu_stores (id, tenant_id, code, name, timezone, currency, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'active')
         RETURNING id, tenant_id, code, name, timezone, currency, status`,
        [id, tenantId, code, name, timezone, currency],
      );
      const row = result.rows[0];
      if (!row) throw new CommercialValidationError("STORE_NOT_CREATED", "门店创建失败", 500);
      return mapStore(row);
    } catch (error) {
      if (error instanceof CommercialValidationError) throw error;
      if (error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "23505") {
        throw new CommercialValidationError("STORE_CODE_EXISTS", "门店编码已存在", 409);
      }
      throw error;
    }
  });
}

export async function updateCommercialStore(tenantId: string, storeId: string, input: { name?: string; timezone?: string; currency?: string; status?: "active" | "archived" }) {
  const name = input.name === undefined ? undefined : text(input.name);
  const timezone = input.timezone === undefined ? undefined : text(input.timezone);
  const currency = input.currency === undefined ? undefined : text(input.currency).toUpperCase();
  if (name === "") throw new CommercialValidationError("INVALID_STORE_NAME", "门店名称不能为空");
  if (name && name.length > 120) throw new CommercialValidationError("INVALID_STORE_NAME", "门店名称不能超过 120 个字符");
  if (timezone && (!/^[A-Za-z_]+\/[A-Za-z0-9_+.-]+$/.test(timezone) || timezone.length > 64)) throw new CommercialValidationError("INVALID_STORE_TIMEZONE", "门店时区格式无效");
  if (currency && !/^[A-Z]{3}$/.test(currency)) throw new CommercialValidationError("INVALID_STORE_CURRENCY", "门店币种必须是 3 位大写代码");
  if (input.status && !commercialStoreStatusValues.includes(input.status)) throw new CommercialValidationError("INVALID_STORE_STATUS", "门店状态无效");
  return withDatabaseTransaction(async (client) => {
    const tenant = await client.query<{ status: TenantStatus }>("SELECT status FROM gpu_tenants WHERE id = $1 FOR SHARE", [tenantId]);
    const tenantStatus = tenant.rows[0]?.status;
    if (!tenantStatus) throw new CommercialValidationError("TENANT_NOT_FOUND", "企业不存在", 404);
    if (tenantStatus === "suspended") throw new CommercialValidationError("TENANT_SUSPENDED", "企业已暂停，请联系管理员", 423);
    if (tenantStatus === "archived") throw new CommercialValidationError("TENANT_ARCHIVED", "企业已归档", 403);
    if (input.status === "archived") {
      const active = await client.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM gpu_stores WHERE tenant_id = $1 AND status = 'active'", [tenantId]);
      if (Number(active.rows[0]?.count || 0) <= 1) throw new CommercialValidationError("LAST_ACTIVE_STORE", "至少保留一个启用门店", 409);
    }
    const result = await client.query<Record<string, unknown>>(
      `UPDATE gpu_stores SET name = COALESCE($3, name), timezone = COALESCE($4, timezone), currency = COALESCE($5, currency), status = COALESCE($6, status), updated_at = NOW()
        WHERE tenant_id = $1 AND id = $2
        RETURNING id, tenant_id, code, name, timezone, currency, status`,
      [tenantId, storeId, name || null, timezone || null, currency || null, input.status || null],
    );
    const row = result.rows[0];
    if (!row) throw new CommercialValidationError("STORE_NOT_FOUND", "门店不存在", 404);
    return mapStore(row);
  });
}

export async function listCommercialMembers(tenantId = DEFAULT_TENANT_ID) {
  return withDatabaseTransaction(async (client) => {
    const result = await client.query<Record<string, unknown>>(
      `SELECT tenant_id, user_id, store_id, role, status, permissions, invited_by, invited_at, joined_at
       FROM gpu_tenant_memberships WHERE tenant_id = $1 ORDER BY created_at ASC, user_id ASC`,
      [tenantId],
    );
    return result.rows.map(mapMembership);
  });
}

type CommercialMembershipInput = {
  tenantId?: string;
  userId: string;
  storeId?: string;
  role: string;
  status?: MembershipStatus;
  permissions?: Record<string, unknown>;
  invitedBy?: string;
};

function normalizeMembershipInput(input: CommercialMembershipInput) {
  const tenantId = text(input.tenantId, DEFAULT_TENANT_ID);
  const userId = text(input.userId);
  const storeId = text(input.storeId, DEFAULT_STORE_ID);
  const role = text(input.role);
  const status = input.status || "active";
  if (!userId || userId.length > 128 || !role || role.length > 64 || !MEMBERSHIP_STATUSES.has(status)) {
    throw new CommercialValidationError("INVALID_MEMBERSHIP", "成员信息不完整或格式无效");
  }
  return { tenantId, userId, storeId, role, status };
}

export async function upsertCommercialMembershipInTransaction(client: PoolClient, input: CommercialMembershipInput) {
  const { tenantId, userId, storeId, role, status } = normalizeMembershipInput(input);
  const tenantResult = await client.query<{ status: TenantStatus }>("SELECT status FROM gpu_tenants WHERE id = $1 FOR SHARE", [tenantId]);
  const tenantStatus = tenantResult.rows[0]?.status;
  if (!tenantStatus) throw new CommercialValidationError("TENANT_NOT_FOUND", "企业不存在", 404);
  if (tenantStatus === "suspended") throw new CommercialValidationError("TENANT_SUSPENDED", "企业已暂停，请联系管理员", 423);
  if (tenantStatus === "archived") throw new CommercialValidationError("TENANT_ARCHIVED", "企业已归档", 403);
  const store = await client.query<{ id: string }>("SELECT id FROM gpu_stores WHERE id = $1 AND tenant_id = $2 AND status = 'active' FOR SHARE", [storeId, tenantId]);
  if (!store.rows[0]) throw new CommercialValidationError("STORE_NOT_FOUND", "门店不存在或不属于当前企业", 404);
  await assertSeatAvailableOnClient(client, tenantId, userId, storeId, status);
  const result = await client.query<Record<string, unknown>>(
    `INSERT INTO gpu_tenant_memberships (tenant_id, user_id, store_id, role, status, permissions, invited_by, invited_at, joined_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, CASE WHEN $5 = 'invited' THEN NOW() ELSE NULL END, CASE WHEN $5 = 'active' THEN NOW() ELSE NULL END)
     ON CONFLICT (tenant_id, user_id, store_id) DO UPDATE SET
       role = EXCLUDED.role, status = EXCLUDED.status, permissions = EXCLUDED.permissions,
       invited_by = EXCLUDED.invited_by,
       invited_at = CASE WHEN EXCLUDED.status = 'invited' THEN COALESCE(gpu_tenant_memberships.invited_at, NOW()) ELSE gpu_tenant_memberships.invited_at END,
       joined_at = CASE WHEN EXCLUDED.status = 'active' THEN COALESCE(gpu_tenant_memberships.joined_at, NOW()) ELSE gpu_tenant_memberships.joined_at END,
       updated_at = NOW()
     RETURNING tenant_id, user_id, store_id, role, status, permissions, invited_by, invited_at, joined_at`,
    [tenantId, userId, storeId, role, status, JSON.stringify(input.permissions || {}), text(input.invitedBy) || null],
  );
  const row = result.rows[0];
  if (!row) throw new CommercialValidationError("MEMBERSHIP_NOT_SAVED", "成员保存失败", 500);
  return mapMembership(row);
}

export async function upsertCommercialMembership(input: CommercialMembershipInput) {
  // Reject malformed input before opening a database connection. This keeps
  // validation deterministic for API clients and avoids turning a simple 400
  // into a misleading database-configuration failure.
  normalizeMembershipInput(input);
  return withDatabaseTransaction(async (client) => {
    return upsertCommercialMembershipInTransaction(client, input);
  });
}

export async function updateCommercialMembership(tenantId: string, userId: string, input: { status?: MembershipStatus; role?: string; permissions?: Record<string, unknown> }, storeId = DEFAULT_STORE_ID) {
  const status = input.status;
  if (status && !MEMBERSHIP_STATUSES.has(status)) throw new CommercialValidationError("INVALID_MEMBERSHIP_STATUS", "成员状态无效");
  const role = input.role === undefined ? undefined : text(input.role);
  if (role === "") throw new CommercialValidationError("INVALID_MEMBERSHIP_ROLE", "成员角色不能为空");
  return withDatabaseTransaction(async (client) => {
    const tenantResult = await client.query<{ status: TenantStatus }>("SELECT status FROM gpu_tenants WHERE id = $1 FOR SHARE", [tenantId]);
    const tenantStatus = tenantResult.rows[0]?.status;
    if (!tenantStatus) throw new CommercialValidationError("TENANT_NOT_FOUND", "企业不存在", 404);
    if (tenantStatus === "suspended") throw new CommercialValidationError("TENANT_SUSPENDED", "企业已暂停，请联系管理员", 423);
    if (tenantStatus === "archived") throw new CommercialValidationError("TENANT_ARCHIVED", "企业已归档", 403);
    const store = await client.query<{ id: string }>("SELECT id FROM gpu_stores WHERE id = $1 AND tenant_id = $2 AND status = 'active' FOR SHARE", [storeId, tenantId]);
    if (!store.rows[0]) throw new CommercialValidationError("STORE_NOT_FOUND", "门店不存在或不属于当前企业", 404);
    if (status === "active") await assertSeatAvailableOnClient(client, tenantId, userId, storeId, status);
    const result = await client.query<Record<string, unknown>>(
      `UPDATE gpu_tenant_memberships
       SET status = COALESCE($4, status), role = COALESCE($5, role), permissions = COALESCE($6::jsonb, permissions), updated_at = NOW()
       WHERE tenant_id = $1 AND user_id = $2 AND store_id = $3
       RETURNING tenant_id, user_id, store_id, role, status, permissions, invited_by, invited_at, joined_at`,
      [tenantId, userId, storeId, status || null, role || null, input.permissions === undefined ? null : JSON.stringify(input.permissions)],
    );
    const row = result.rows[0];
    if (!row) throw new CommercialValidationError("MEMBERSHIP_NOT_FOUND", "成员不存在", 404);
    return mapMembership(row);
  });
}

export async function getCommercialSubscription(tenantId = DEFAULT_TENANT_ID) {
  return withDatabaseTransaction(async (client) => {
    const result = await client.query<Record<string, unknown>>("SELECT tenant_id, plan_code, status, seat_limit, media_bytes_limit, ai_tokens_limit, current_period_start, current_period_end, external_customer_id, external_subscription_id FROM gpu_subscriptions WHERE tenant_id = $1", [tenantId]);
    return result.rows[0] ? mapSubscription(result.rows[0]) : null;
  });
}

export async function updateCommercialSubscription(tenantId: string, input: { planCode?: CommercialPlanCode; status?: SubscriptionStatus; seatLimit?: number; mediaBytesLimit?: number; aiTokensLimit?: number; currentPeriodStart?: string; currentPeriodEnd?: string }) {
  const planCode = input.planCode;
  if (planCode && !PLAN_CODES.has(planCode)) throw new CommercialValidationError("INVALID_PLAN", "套餐代码无效");
  const status = input.status;
  if (status && !SUBSCRIPTION_STATUSES.has(status)) throw new CommercialValidationError("INVALID_SUBSCRIPTION_STATUS", "订阅状态无效");
  const defaults = planCode ? COMMERCIAL_PLAN_DEFAULTS[planCode] : undefined;
  const seatLimit = input.seatLimit === undefined ? defaults?.seatLimit : Math.floor(Number(input.seatLimit));
  const mediaBytesLimit = input.mediaBytesLimit === undefined ? defaults?.mediaBytesLimit : Math.floor(Number(input.mediaBytesLimit));
  const aiTokensLimit = input.aiTokensLimit === undefined ? defaults?.aiTokensLimit : Math.floor(Number(input.aiTokensLimit));
  for (const value of [seatLimit, mediaBytesLimit, aiTokensLimit]) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw new CommercialValidationError("INVALID_QUOTA", "额度必须是非负数字");
  }
  const currentPeriodStart = input.currentPeriodStart ? optionalIso(input.currentPeriodStart)?.slice(0, 10) : undefined;
  const currentPeriodEnd = input.currentPeriodEnd ? optionalIso(input.currentPeriodEnd)?.slice(0, 10) : undefined;
  return withDatabaseTransaction(async (client) => {
    // Quotas are safety boundaries, not presentation fields.  A plan change
    // must not strand active users or make already-consumed usage invalid.
    const currentResult = await client.query<Record<string, unknown>>(
      `SELECT tenant_id, plan_code, status, seat_limit, media_bytes_limit,
              ai_tokens_limit, current_period_start, current_period_end,
              external_customer_id, external_subscription_id
         FROM gpu_subscriptions
        WHERE tenant_id = $1
        FOR UPDATE`,
      [tenantId],
    );
    const current = currentResult.rows[0];
    if (!current) throw new CommercialValidationError("SUBSCRIPTION_NOT_FOUND", "企业订阅不存在", 404);
    const effectiveSeatLimit = seatLimit ?? Number(current.seat_limit);
    const effectiveMediaBytesLimit = mediaBytesLimit ?? Number(current.media_bytes_limit);
    const effectiveAiTokensLimit = aiTokensLimit ?? Number(current.ai_tokens_limit);
    const activeSeatsResult = await client.query<{ count: string }>(
      `SELECT COUNT(DISTINCT user_id)::text AS count
         FROM gpu_tenant_memberships
        WHERE tenant_id = $1 AND status = 'active'`,
      [tenantId],
    );
    const activeSeats = Number(activeSeatsResult.rows[0]?.count || 0);
    if (effectiveSeatLimit < activeSeats) {
      throw new CommercialValidationError("SEAT_QUOTA_BELOW_USAGE", `席位额度不能低于当前已启用成员数（${activeSeats}）`, 409);
    }
    const usagePeriodStart = currentPeriodStart
      || (current.current_period_start instanceof Date ? current.current_period_start.toISOString().slice(0, 10) : text(current.current_period_start))
      || new Date().toISOString().slice(0, 7) + "-01";
    const usageResult = await client.query<{ metric: string; quantity: string }>(
      `SELECT metric, COALESCE(SUM(quantity), 0)::text AS quantity
         FROM gpu_usage_counters
        WHERE tenant_id = $1 AND period_start >= $2::date
        GROUP BY metric`,
      [tenantId, usagePeriodStart],
    );
    const usageByMetric = new Map(usageResult.rows.map((row) => [row.metric, Number(row.quantity || 0)]));
    const mediaStoredResult = await client.query<{ bytes: string }>(
      "SELECT COALESCE(SUM(size_bytes), 0)::text AS bytes FROM gpu_media_assets WHERE tenant_id = $1",
      [tenantId],
    );
    const mediaStoredBytes = Number(mediaStoredResult.rows[0]?.bytes || 0);
    if (mediaStoredBytes > effectiveMediaBytesLimit || (usageByMetric.get("media_bytes") || 0) > effectiveMediaBytesLimit) {
      throw new CommercialValidationError("MEDIA_QUOTA_BELOW_USAGE", "媒体额度不能低于当前周期已用量", 409);
    }
    if ((usageByMetric.get("ai_tokens") || 0) > effectiveAiTokensLimit) {
      throw new CommercialValidationError("AI_QUOTA_BELOW_USAGE", "AI 额度不能低于当前周期已用量", 409);
    }
    const result = await client.query<Record<string, unknown>>(
      `UPDATE gpu_subscriptions SET
         plan_code = COALESCE($2, plan_code), status = COALESCE($3, status),
         seat_limit = COALESCE($4, seat_limit), media_bytes_limit = COALESCE($5, media_bytes_limit),
         ai_tokens_limit = COALESCE($6, ai_tokens_limit), current_period_start = COALESCE($7::date, current_period_start),
         current_period_end = COALESCE($8::date, current_period_end), updated_at = NOW()
       WHERE tenant_id = $1
       RETURNING tenant_id, plan_code, status, seat_limit, media_bytes_limit, ai_tokens_limit, current_period_start, current_period_end, external_customer_id, external_subscription_id`,
      [tenantId, planCode || null, status || null, seatLimit ?? null, mediaBytesLimit ?? null, aiTokensLimit ?? null, currentPeriodStart || null, currentPeriodEnd || null],
    );
    const row = result.rows[0];
    if (!row) throw new CommercialValidationError("SUBSCRIPTION_NOT_FOUND", "企业订阅不存在", 404);
    return mapSubscription(row);
  });
}

export async function recordCommercialUsage(input: { tenantId?: string; metric: string; quantity: number; periodStart?: string }) {
  const tenantId = text(input.tenantId, DEFAULT_TENANT_ID);
  const metric = text(input.metric);
  const limitColumn = USAGE_METRICS.get(metric);
  if (!limitColumn && !USAGE_METRICS.has(metric)) throw new CommercialValidationError("INVALID_USAGE_METRIC", "用量指标不支持");
  const quantity = Number(input.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000_000_000) throw new CommercialValidationError("INVALID_USAGE_QUANTITY", "用量必须是正数且在允许范围内");
  if (metric === "active_seats") {
    // Active seats are a derived value, not an additive meter.  Accepting
    // arbitrary increments would let an operator desynchronise seat limits;
    // membership writes are the single source of truth for this metric.
    throw new CommercialValidationError("USAGE_METRIC_READ_ONLY", "启用成员数由成员关系自动计算，不能手工记账", 409);
  }
  const periodStart = input.periodStart ? optionalIso(input.periodStart)?.slice(0, 10) : new Date().toISOString().slice(0, 7) + "-01";
  if (!periodStart) throw new CommercialValidationError("INVALID_USAGE_PERIOD", "用量周期无效");
  return withDatabaseTransaction(async (client) => {
    const subscription = await client.query<Record<string, unknown>>("SELECT seat_limit, media_bytes_limit, ai_tokens_limit FROM gpu_subscriptions WHERE tenant_id = $1 FOR UPDATE", [tenantId]);
    const limits = subscription.rows[0];
    if (!limits) throw new CommercialValidationError("SUBSCRIPTION_NOT_FOUND", "企业订阅不存在", 404);
    const limit = metric === "media_bytes" ? Number(limits.media_bytes_limit) : metric === "ai_tokens" ? Number(limits.ai_tokens_limit) : Number(limits.seat_limit);
    const current = await client.query<{ quantity: string }>("SELECT quantity::text FROM gpu_usage_counters WHERE tenant_id = $1 AND metric = $2 AND period_start = $3::date FOR UPDATE", [tenantId, metric, periodStart]);
    const previous = Number(current.rows[0]?.quantity || 0);
    if (previous + quantity > limit) throw new CommercialValidationError("USAGE_LIMIT_EXCEEDED", `已超过 ${metric} 用量额度`, 409);
    const result = await client.query<Record<string, unknown>>(
      `INSERT INTO gpu_usage_counters (tenant_id, metric, period_start, quantity)
       VALUES ($1, $2, $3::date, $4)
       ON CONFLICT (tenant_id, metric, period_start) DO UPDATE SET quantity = gpu_usage_counters.quantity + EXCLUDED.quantity, updated_at = NOW()
       RETURNING metric, period_start, quantity`,
      [tenantId, metric, periodStart, quantity],
    );
    return mapUsage(result.rows[0] || { metric, period_start: periodStart, quantity: previous + quantity }, {
      tenantId,
      planCode: "pilot",
      status: "active",
      seatLimit: Number(limits.seat_limit),
      mediaBytesLimit: Number(limits.media_bytes_limit),
      aiTokensLimit: Number(limits.ai_tokens_limit),
    });
  });
}

export async function createCommercialExport(input: { tenantId?: string; requestedBy: string; format?: "json" | "csv" }) {
  const tenantId = text(input.tenantId, DEFAULT_TENANT_ID);
  const requestedBy = text(input.requestedBy);
  const format = input.format || "json";
  if (!requestedBy || !commercialExportFormatValues.includes(format)) throw new CommercialValidationError("INVALID_EXPORT", "导出请求无效");
  return withDatabaseTransaction(async (client) => {
    const id = `EXP-${randomUUID()}`;
    const result = await client.query<Record<string, unknown>>(
      `INSERT INTO gpu_tenant_exports (id, tenant_id, requested_by, status, format, expires_at)
       VALUES ($1, $2, $3, 'queued', $4, NOW() + INTERVAL '24 hours')
       RETURNING id, tenant_id, requested_by, status, format, requested_at, expires_at`,
      [id, tenantId, requestedBy, format],
    );
    const row = result.rows[0];
    if (!row) throw new CommercialValidationError("EXPORT_NOT_CREATED", "导出任务创建失败", 500);
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      requestedBy: String(row.requested_by),
      status: String(row.status),
      format: String(row.format),
      requestedAt: row.requested_at instanceof Date ? row.requested_at.toISOString() : String(row.requested_at),
      expiresAt: row.expires_at instanceof Date ? row.expires_at.toISOString() : String(row.expires_at),
    };
  });
}

export const COMMERCIAL_EXPORT_ROOT = path.resolve(process.cwd(), "data", "exports");

function exportPathPart(value: string) {
  return value.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 120);
}

export function commercialExportTenantDirectory(tenantId: string) {
  return path.resolve(COMMERCIAL_EXPORT_ROOT, exportPathPart(tenantId));
}

function csvCell(value: unknown) {
  const text = value === undefined || value === null ? "" : typeof value === "string" ? value : JSON.stringify(value);
  const safe = /^[=+\-@\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function buildCommercialExportContent(state: Awaited<ReturnType<typeof loadState>>, format: string) {
  const safeState = {
    ...state,
    systemUsers: state.systemUsers.map(sanitizeUserAccount),
    currentUserId: undefined,
  };
  if (format === "json") return `${JSON.stringify(safeState, null, 2)}\n`;
  const rows = Object.entries(safeState).flatMap(([collection, value]) => {
    if (!Array.isArray(value)) return [];
    return value.map((item) => [collection, item && typeof item === "object" && "id" in item ? (item as { id?: unknown }).id : "", item]);
  });
  return ["collection,id,data", ...rows.map((row) => row.map(csvCell).join(","))].join("\r\n") + "\r\n";
}

export async function processCommercialExport(id: string, tenantId = DEFAULT_TENANT_ID) {
  const claimed = await withDatabaseTransaction(async (client) => {
    const result = await client.query<Record<string, unknown>>(
      `SELECT id, tenant_id, status, format, expires_at
         FROM gpu_tenant_exports WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [id, tenantId],
    );
    const row = result.rows[0];
    if (!row) throw new CommercialValidationError("EXPORT_NOT_FOUND", "导出任务不存在", 404);
    if (row.status === "completed") return null;
    if (row.status === "running") throw new CommercialValidationError("EXPORT_IN_PROGRESS", "导出任务正在处理中", 409);
    if (row.expires_at instanceof Date && row.expires_at.getTime() <= Date.now()) {
      await client.query("UPDATE gpu_tenant_exports SET status = 'expired', error_message = '导出任务已过期' WHERE id = $1 AND tenant_id = $2", [id, tenantId]);
      throw new CommercialValidationError("EXPORT_EXPIRED", "导出任务已过期", 410);
    }
    await client.query("UPDATE gpu_tenant_exports SET status = 'running', error_message = NULL WHERE id = $1 AND tenant_id = $2", [id, tenantId]);
    return { format: String(row.format) };
  });
  if (!claimed) return getCommercialExport(id, tenantId);

  try {
    const state = await loadState(tenantId);
    const format = claimed.format === "csv" ? "csv" : "json";
    const tenantDirectory = commercialExportTenantDirectory(tenantId);
    await mkdir(tenantDirectory, { recursive: true });
    const relativePath = path.join("data", "exports", exportPathPart(tenantId), `${exportPathPart(id)}.${format}`);
    const absolutePath = path.join(process.cwd(), relativePath);
    await writeFile(absolutePath, buildCommercialExportContent(state, format), "utf8");
    await withDatabaseTransaction(async (client) => {
      await client.query(
        `UPDATE gpu_tenant_exports
            SET status = 'completed', file_path = $3, completed_at = NOW(), error_message = NULL
          WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId, relativePath],
      );
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 2000) : "导出失败";
    await withDatabaseTransaction(async (client) => {
      await client.query("UPDATE gpu_tenant_exports SET status = 'failed', error_message = $3 WHERE id = $1 AND tenant_id = $2", [id, tenantId, message]);
    }).catch(() => undefined);
  }
  return getCommercialExport(id, tenantId);
}

export async function getCommercialExport(id: string, tenantId = DEFAULT_TENANT_ID) {
  return withDatabaseTransaction(async (client) => {
    const result = await client.query<Record<string, unknown>>(
      `SELECT id, tenant_id, requested_by, status, format, file_path, error_message, requested_at, completed_at, expires_at
       FROM gpu_tenant_exports WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: String(row.id), tenantId: String(row.tenant_id), requestedBy: String(row.requested_by), status: String(row.status), format: String(row.format),
      filePath: row.file_path ? String(row.file_path) : undefined,
      errorMessage: row.error_message ? String(row.error_message) : undefined,
      requestedAt: row.requested_at instanceof Date ? row.requested_at.toISOString() : String(row.requested_at),
      completedAt: row.completed_at instanceof Date ? row.completed_at.toISOString() : undefined,
      expiresAt: row.expires_at instanceof Date ? row.expires_at.toISOString() : undefined,
    };
  });
}

export async function getCommercialDiagnostics(tenantId = DEFAULT_TENANT_ID) {
  return withDatabaseTransaction(async (client) => {
    const result = await client.query<{ table_name: string; row_count: string }>(
      `SELECT table_name, row_count::text FROM (
        SELECT 'gpu_tenants' AS table_name, COUNT(*) AS row_count FROM gpu_tenants WHERE id = $1
        UNION ALL SELECT 'gpu_stores', COUNT(*) FROM gpu_stores WHERE tenant_id = $1
        UNION ALL SELECT 'gpu_tenant_memberships' AS table_name, COUNT(*) AS row_count FROM gpu_tenant_memberships WHERE tenant_id = $1
        UNION ALL SELECT 'gpu_usage_counters', COUNT(*) FROM gpu_usage_counters WHERE tenant_id = $1
        UNION ALL SELECT 'gpu_tenant_exports', COUNT(*) FROM gpu_tenant_exports WHERE tenant_id = $1
        UNION ALL SELECT 'gpu_media_assets', COUNT(*) FROM gpu_media_assets WHERE tenant_id = $1
        UNION ALL SELECT 'gpu_inventory_reservations_active', COUNT(*) FROM gpu_inventory_reservations WHERE tenant_id = $1 AND status IN ('reserved', 'consumed')
      ) counts ORDER BY table_name`,
      [tenantId],
    );
    return { tenantId, generatedAt: new Date().toISOString(), tables: Object.fromEntries(result.rows.map(row => [row.table_name, Number(row.row_count)])) };
  });
}

/**
 * Keep entitlement decisions deterministic and independent from HTTP/UI code.
 * A suspended or archived tenant cannot consume paid capabilities; trial access
 * ends at the tenant trial boundary, while active/past-due subscriptions honor
 * their explicit billing period. Unknown feature names are denied by default.
 */
export function subscriptionAllowsFeature(input: CommercialFeatureGateInput) {
  const { tenant, subscription, feature } = input;
  if (!tenant || tenant.status !== "active" || !subscription || subscription.status === "canceled") return false;
  const defaults = COMMERCIAL_PLAN_DEFAULTS[subscription.planCode];
  if (!defaults || !defaults.featureFlags.includes(feature)) return false;
  const now = input.now || new Date();
  const nowMs = now.getTime();
  if (subscription.status === "trialing" && tenant.trialEndsAt) {
    const trialEnd = Date.parse(tenant.trialEndsAt);
    if (Number.isFinite(trialEnd) && trialEnd <= nowMs) return false;
  }
  if (subscription.currentPeriodEnd) {
    const periodEnd = Date.parse(`${subscription.currentPeriodEnd}T23:59:59.999Z`);
    if (Number.isFinite(periodEnd) && periodEnd <= nowMs) return false;
  }
  // Keep the core product available during a billing recovery window, but do
  // not allow additional premium consumption while an invoice is past due.
  if (subscription.status === "past_due" && feature !== "core") return false;
  return true;
}

export async function commercialFeatureEnabled(tenantId: string, feature: string) {
  const [tenant, subscription] = await Promise.all([
    getCommercialTenant(tenantId),
    getCommercialSubscription(tenantId),
  ]);
  return subscriptionAllowsFeature({tenant, subscription, feature});
}

/** A conservative request-size estimate used for metering provider calls that stream tokens. */
export function estimateAiUsageUnits(messages: Array<{ content?: string }> | undefined) {
  const chars = (messages || []).reduce((total, message) => total + String(message.content || "").length, 0);
  return Math.max(1, Math.ceil(chars / 4));
}

export { DEFAULT_STORE_ID, DEFAULT_STORE_NAME, DEFAULT_STORE_TIMEZONE, DEFAULT_TENANT_ID, DEFAULT_TENANT_NAME, DEFAULT_TENANT_SLUG };
