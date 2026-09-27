import type { PoolClient } from "pg";
import type { CrmLead, CrmTask, QuickCaptureParseResult, QuickCaptureSourceType } from "../src/types.ts";
import { withDatabaseTransaction } from "./db.ts";
import { currentCrmTenantId } from "./crmTenant.ts";

type QuickCaptureAuditStatus = "parsed" | "confirmed" | "failed";

function toDatabaseDate(value?: string) {
  if (!value) return null;
  const normalized = String(value).trim();
  // Store dates are intentionally timezone-free strings in the legacy state. CRM
  // timestamps are timestamptz, so bind them explicitly as Asia/Shanghai values
  // instead of depending on the server process timezone.
  const storeMatch = normalized.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?$/);
  const parsed = new Date(storeMatch ? `${storeMatch[1]}T${storeMatch[2]}:00+08:00` : normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export type QuickCaptureAuditInput = {
  id: string;
  rawText: string;
  sourceType: QuickCaptureSourceType;
  parsed: QuickCaptureParseResult;
  actorId: string;
  model?: string;
  status?: QuickCaptureAuditStatus;
};

export type QuickCaptureAuditRecord = {
  id: string;
  rawText: string;
  sourceType: QuickCaptureParseResult["sourceType"];
  status: QuickCaptureAuditStatus;
  actorId?: string;
  leadId?: string;
};

export type QuickCaptureLeadInsert = Omit<CrmLead, "customerName" | "createdAt" | "updatedAt"> & {
  accountId: string;
  matchedAccountId?: string;
  idempotencyKey: string;
};

export type QuickCaptureTaskInsert = Omit<CrmTask, "createdAt" | "status"> & {
  accountId: string;
  status?: CrmTask["status"];
};

function mapLead(row: Record<string, unknown>): CrmLead {
  return {
    id: String(row.id),
    customerId: String(row.legacy_customer_id || row.customer_id || ""),
    customerName: String(row.customer_name || ""),
    sourceType: String(row.source_type || "manual") as CrmLead["sourceType"],
    source: row.source ? String(row.source) : undefined,
    intentType: row.intent_type ? String(row.intent_type) as CrmLead["intentType"] : undefined,
    productCategory: row.product_category ? String(row.product_category) as CrmLead["productCategory"] : undefined,
    productName: row.product_name ? String(row.product_name) : undefined,
    productModel: row.product_model ? String(row.product_model) : undefined,
    productId: row.product_id ? String(row.product_id) : undefined,
    quantity: row.quantity === null || row.quantity === undefined ? undefined : Number(row.quantity),
    expectedPrice: row.expected_price === null || row.expected_price === undefined ? undefined : Number(row.expected_price),
    quotedPrice: row.quoted_price === null || row.quoted_price === undefined ? undefined : Number(row.quoted_price),
    transactionType: row.transaction_type ? String(row.transaction_type) as CrmLead["transactionType"] : undefined,
    deliveryMethod: row.delivery_method ? String(row.delivery_method) as CrmLead["deliveryMethod"] : undefined,
    followUpTime: row.follow_up_at ? new Date(String(row.follow_up_at)).toISOString() : undefined,
    priority: String(row.priority || "中") as CrmLead["priority"],
    stage: String(row.stage || "新线索") as CrmLead["stage"],
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    note: row.note ? String(row.note) : undefined,
    rawText: row.raw_text ? String(row.raw_text) : undefined,
    confidence: Number(row.confidence || 0),
    missingFields: Array.isArray(row.missing_fields) ? row.missing_fields.map(String) : [],
    conflicts: Array.isArray(row.conflicts) ? row.conflicts as CrmLead["conflicts"] : [],
    matchedCustomerId: row.matched_legacy_customer_id ? String(row.matched_legacy_customer_id) : undefined,
    createdBy: String(row.created_by || "系统"),
    createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString() : new Date().toISOString(),
  };
}

function mapTask(row: Record<string, unknown>): CrmTask {
  return {
    id: String(row.id),
    leadId: String(row.lead_id),
    customerId: String(row.legacy_customer_id || row.customer_id || ""),
    title: String(row.title || "客户跟进"),
    taskType: String(row.task_type || "客户跟进") as CrmTask["taskType"],
    dueAt: row.due_at ? new Date(String(row.due_at)).toISOString() : undefined,
    status: String(row.status || "待处理") as CrmTask["status"],
    assignee: row.assignee_id ? String(row.assignee_id) : undefined,
    createdBy: String(row.created_by || "系统"),
    createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : new Date().toISOString(),
    completedAt: row.completed_at ? new Date(String(row.completed_at)).toISOString() : undefined,
  };
}

export async function saveQuickCaptureAudit(input: QuickCaptureAuditInput) {
  return withDatabaseTransaction(async client => saveQuickCaptureAuditInTransaction(client, input));
}

export async function saveQuickCaptureAuditInTransaction(client: PoolClient, input: QuickCaptureAuditInput) {
  const tenantId = currentCrmTenantId();
  await client.query(
    `INSERT INTO gpu_crm_quick_capture_audits
       (id, tenant_id, raw_text, source_type, parsed_payload, status, model_version, source_page, actor_id)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, 'crm', $8)
     ON CONFLICT (id) DO UPDATE SET
       raw_text = EXCLUDED.raw_text,
       source_type = EXCLUDED.source_type,
       parsed_payload = EXCLUDED.parsed_payload,
       status = EXCLUDED.status,
       model_version = EXCLUDED.model_version,
       actor_id = EXCLUDED.actor_id
     WHERE gpu_crm_quick_capture_audits.tenant_id = EXCLUDED.tenant_id`,
    [input.id, tenantId, input.rawText, input.sourceType, JSON.stringify(input.parsed), input.status || "parsed", input.model || null, input.actorId],
  );
}

export async function findQuickCaptureAudit(id: string): Promise<QuickCaptureAuditRecord | null> {
  return withDatabaseTransaction(async client => {
    const tenantId = currentCrmTenantId();
    const result = await client.query<Record<string, unknown>>(
      `SELECT id, raw_text, source_type, status, actor_id, lead_id
       FROM gpu_crm_quick_capture_audits
       WHERE id = $1 AND tenant_id = $2
       LIMIT 1`,
      [id, tenantId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: String(row.id),
      rawText: String(row.raw_text || ""),
      sourceType: String(row.source_type || "manual") as QuickCaptureParseResult["sourceType"],
      status: String(row.status || "parsed") as QuickCaptureAuditStatus,
      actorId: row.actor_id ? String(row.actor_id) : undefined,
      leadId: row.lead_id ? String(row.lead_id) : undefined,
    };
  });
}

export async function findLeadByIdempotencyKey(idempotencyKey: string) {
  return withDatabaseTransaction(async client => {
    const tenantId = currentCrmTenantId();
    const scopedKey = tenantId === "tenant_default" ? idempotencyKey : `${tenantId}:${idempotencyKey}`;
    const result = await client.query<Record<string, unknown>>(
      `SELECT l.*, a.legacy_customer_id, a.display_name AS customer_name,
              matched.legacy_customer_id AS matched_legacy_customer_id
       FROM gpu_crm_leads l
       JOIN gpu_crm_accounts a ON a.id = l.account_id AND a.tenant_id = l.tenant_id
       LEFT JOIN gpu_crm_accounts matched ON matched.id = l.matched_account_id AND matched.tenant_id = l.tenant_id
       WHERE l.idempotency_key = $1 AND l.tenant_id = $2
       LIMIT 1`,
      [scopedKey, tenantId],
    );
    return result.rows[0] ? mapLead(result.rows[0]) : null;
  });
}

export async function insertQuickCaptureLead(client: PoolClient, input: QuickCaptureLeadInsert): Promise<CrmLead> {
  const tenantId = currentCrmTenantId();
  const scopedKey = tenantId === "tenant_default" ? input.idempotencyKey : `${tenantId}:${input.idempotencyKey}`;
  const result = await client.query<Record<string, unknown>>(
    `INSERT INTO gpu_crm_leads
       (id, tenant_id, account_id, matched_account_id, source_type, source, intent_type, product_category,
        product_name, product_model, product_id, quantity, expected_price, quoted_price,
        transaction_type, delivery_method, follow_up_at, priority, stage, tags, note, raw_text,
        confidence, missing_fields, conflicts, idempotency_key, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
             $19, $20, $21, $22, $23, $24::jsonb, $25::jsonb, $26, $27)
     RETURNING *`,
    [
      input.id,
      tenantId,
      input.accountId,
      input.matchedAccountId || null,
      input.sourceType,
      input.source || null,
      input.intentType || null,
      input.productCategory || null,
      input.productName || null,
      input.productModel || null,
      input.productId || null,
      input.quantity ?? null,
      input.expectedPrice ?? null,
      input.quotedPrice ?? null,
      input.transactionType || null,
      input.deliveryMethod || null,
      toDatabaseDate(input.followUpTime),
      input.priority,
      input.stage,
      input.tags || [],
      input.note || null,
      input.rawText || null,
      input.confidence,
      JSON.stringify(input.missingFields || []),
      JSON.stringify(input.conflicts || []),
      scopedKey,
      input.createdBy,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error("创建 CRM 线索失败");
  return mapLead(row);
}

export async function insertQuickCaptureTask(client: PoolClient, input: QuickCaptureTaskInsert): Promise<CrmTask> {
  const tenantId = currentCrmTenantId();
  const result = await client.query<Record<string, unknown>>(
    `INSERT INTO gpu_crm_tasks
       (id, tenant_id, lead_id, account_id, task_type, title, due_at, status, assignee_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [input.id, tenantId, input.leadId, input.accountId, input.taskType, input.title, toDatabaseDate(input.dueAt), input.status || "待处理", input.assignee || null, input.createdBy],
  );
  const row = result.rows[0];
  if (!row) throw new Error("创建 CRM 提醒任务失败");
  return mapTask(row);
}

export async function confirmQuickCaptureAuditInTransaction(
  client: PoolClient,
  input: { id: string; finalPayload: unknown; status: QuickCaptureAuditStatus; leadId?: string },
) {
  const tenantId = currentCrmTenantId();
  await client.query(
    `UPDATE gpu_crm_quick_capture_audits
     SET final_payload = $2::jsonb,
         status = $3,
         lead_id = COALESCE($4, lead_id),
         confirmed_at = CASE WHEN $3 = 'confirmed' THEN NOW() ELSE confirmed_at END
     WHERE id = $1 AND tenant_id = $5`,
    [input.id, JSON.stringify(input.finalPayload), input.status, input.leadId || null, tenantId],
  );
}

export async function listQuickCaptureLeads(options: { page?: number; pageSize?: number; keyword?: string; stage?: string } = {}) {
  return withDatabaseTransaction(async client => {
    const tenantId = currentCrmTenantId();
    const page = Math.max(1, Math.floor(Number(options.page || 1)));
    const pageSize = Math.min(100, Math.max(1, Math.floor(Number(options.pageSize || 20))));
    const values: unknown[] = [];
    const clauses = ["l.stage NOT IN ('已关闭')", `l.tenant_id = $${values.length + 1}`];
    values.push(tenantId);
    const bind = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };
    if (options.stage?.trim()) clauses.push(`l.stage = ${bind(options.stage.trim())}`);
    if (options.keyword?.trim()) clauses.push(`CONCAT_WS(' ', a.display_name, l.product_name, l.product_model, l.source, l.note) ILIKE ${bind(`%${options.keyword.trim()}%`)}`);
    const where = clauses.join(" AND ");
    const rows = await client.query<Record<string, unknown>>(
      `SELECT l.*, a.legacy_customer_id, a.display_name AS customer_name,
              matched.legacy_customer_id AS matched_legacy_customer_id
       FROM gpu_crm_leads l
       JOIN gpu_crm_accounts a ON a.id = l.account_id AND a.tenant_id = l.tenant_id
       LEFT JOIN gpu_crm_accounts matched ON matched.id = l.matched_account_id AND matched.tenant_id = l.tenant_id
       WHERE ${where}
       ORDER BY l.priority DESC, l.updated_at DESC, l.id DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, (page - 1) * pageSize],
    );
    const count = await client.query<{ total: string }>(`SELECT COUNT(*)::text AS total FROM gpu_crm_leads l JOIN gpu_crm_accounts a ON a.id = l.account_id AND a.tenant_id = l.tenant_id WHERE ${where}`, values);
    return {
      items: rows.rows.map(mapLead),
      meta: { page, pageSize, total: Number(count.rows[0]?.total || 0) },
    };
  });
}
