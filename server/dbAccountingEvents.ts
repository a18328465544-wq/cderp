import type {Pool, PoolClient} from "pg";
import type {
  AccountingEvent,
  AccountingEventLine,
  AccountingEventLink,
  AccountingEventStatus,
  AccountingEventType,
  AccountingReversalDocument,
} from "../src/types/accounting.ts";
import {normalizeAccountingDocumentStatus} from "../src/types/accounting.ts";

type AccountingEventDependencies = {
  initializePostgres: () => Promise<void>;
  getPool: () => Pool;
  scopedTenantId: (tenantId?: string) => string;
  scopedStoreId: (storeId?: string) => string;
};

type SourceConfig = {
  sourceType: string;
  eventType: AccountingEventType;
  direction: "income" | "expense" | "memo";
};

const sourceConfigs: Record<string, SourceConfig> = {
  purchaseInvoices: {sourceType: "purchaseInvoices", eventType: "采购单", direction: "expense"},
  salesInvoices: {sourceType: "salesInvoices", eventType: "销售单", direction: "income"},
  returnOrders: {sourceType: "returnOrders", eventType: "退货单", direction: "memo"},
  paymentInRecords: {sourceType: "paymentInRecords", eventType: "收款单", direction: "income"},
  paymentOutRecords: {sourceType: "paymentOutRecords", eventType: "付款单", direction: "expense"},
  accountTransfers: {sourceType: "accountTransfers", eventType: "资金调拨", direction: "memo"},
  financeLedger: {sourceType: "financeLedger", eventType: "财务流水", direction: "memo"},
  settlementLedger: {sourceType: "settlementLedger", eventType: "账户流水", direction: "memo"},
  purchaseCommissions: {sourceType: "purchaseCommissions", eventType: "员工提成", direction: "expense"},
  aftersales: {sourceType: "aftersales", eventType: "售后单", direction: "memo"},
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value === undefined || value === null ? "" : String(value).trim();
}

function numberValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = text(value).replace(/[￥¥,\s]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstText(data: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = text(data[key]);
    if (value) return value;
  }
  return "";
}

function effectiveDate(data: Record<string, unknown>) {
  const candidate = firstText(data, ["date", "businessDate", "paymentDate", "returnDate", "entryDate", "time", "completedAt", "createdAt"]);
  if (/^\d{4}-\d{2}-\d{2}/.test(candidate)) return candidate.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function amountFor(sourceKey: string, data: Record<string, unknown>) {
  const keys = sourceKey === "purchaseInvoices"
    ? ["totalCost", "totalAmount", "amount"]
    : sourceKey === "salesInvoices"
      ? ["totalAmount", "salesAmount", "amount"]
      : sourceKey === "returnOrders"
        ? ["refundAmount", "returnAmount", "totalAmount", "amount"]
        : ["amount", "totalAmount", "totalCost", "refundAmount", "changeAmount"];
  return keys.map((key) => data[key]).find((value) => value !== undefined && value !== null && value !== "") === undefined
    ? 0
    : numberValue(keys.map((key) => data[key]).find((value) => value !== undefined && value !== null && value !== ""));
}

function sourceNo(data: Record<string, unknown>, id: string) {
  return firstText(data, ["invoiceNo", "returnNo", "recordNo", "transferNo", "commissionNo", "id"]) || id;
}

function eventIdFor(sourceKey: string, data: Record<string, unknown>, id: string) {
  return text(data.accountingEventId) || `AE-legacy-${sourceKey}-${id}`;
}

function safePayload(data: Record<string, unknown>, id: string, config: SourceConfig, amount: number, no: string) {
  const keys = [
    "status", "accountingStatus", "businessType", "paymentStatus", "settlementMode", "sourceType",
    "customerId", "supplierId", "accountId", "relatedDocNo", "relatedDocType", "handler", "operator",
  ];
  return {
    sourceType: config.sourceType,
    sourceId: id,
    sourceNo: no,
    eventType: config.eventType,
    direction: config.direction,
    amount,
    ...Object.fromEntries(keys.filter((key) => data[key] !== undefined && data[key] !== null).map((key) => [key, data[key]])),
  } satisfies Record<string, unknown>;
}

export type AccountingEventProjection = {
  event: {
    id: string;
    eventType: AccountingEventType;
    status: AccountingEventStatus;
    effectiveDate: string;
    totalAmount: number;
    reversalOfEventId?: string;
    actor?: string;
    sourceType: string;
    sourceId: string;
    sourceNo: string;
    payload: Record<string, unknown>;
  };
  link: AccountingEventLink;
  line: Omit<AccountingEventLine, "id" | "eventId">;
};

export function accountingEventLineId(eventId: string, lineKey: string) {
  return `AEL-${eventId}-${lineKey}`;
}

export function projectAccountingRecord(sourceKey: string, item: unknown): AccountingEventProjection | null {
  const config = sourceConfigs[sourceKey];
  if (!config) return null;
  const data = record(item);
  const id = text(data.id);
  if (!id) return null;
  const amount = amountFor(sourceKey, data);
  const no = sourceNo(data, id);
  const eventId = eventIdFor(sourceKey, data, id);
  const status = normalizeAccountingDocumentStatus(data.accountingStatus);
  const actor = firstText(data, ["handler", "operator", "createdBy"]) || undefined;
  const payload = safePayload(data, id, config, amount, no);
  return {
    event: {
      id: eventId,
      eventType: config.eventType,
      status,
      effectiveDate: effectiveDate(data),
      totalAmount: amount,
      ...(text(data.reversalOfEventId) ? {reversalOfEventId: text(data.reversalOfEventId)} : {}),
      ...(actor ? {actor} : {}),
      sourceType: config.sourceType,
      sourceId: id,
      sourceNo: no,
      payload,
    },
    link: {eventId, sourceType: config.sourceType, sourceId: id, sourceNo: no, role: "source"},
    line: {
      lineKey: "total",
      lineType: "document_total",
      direction: config.direction,
      amount,
      description: `${config.eventType}合计`,
      sourceType: config.sourceType,
      sourceId: id,
    },
  };
}

function mapEventRow(row: Record<string, unknown>): AccountingEvent {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    storeId: String(row.store_id),
    eventType: row.event_type as AccountingEventType,
    status: row.status as AccountingEventStatus,
    effectiveDate: row.effective_date instanceof Date ? row.effective_date.toISOString().slice(0, 10) : String(row.effective_date),
    totalAmount: numberValue(row.total_amount),
    currency: String(row.currency || "CNY"),
    ...(row.reversal_of_event_id ? {reversalOfEventId: String(row.reversal_of_event_id)} : {}),
    ...(row.actor ? {actor: String(row.actor)} : {}),
    sourceType: String(row.source_type),
    sourceId: String(row.source_id),
    ...(row.source_no ? {sourceNo: String(row.source_no)} : {}),
    payload: record(row.payload),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

function mapReversalRow(row: Record<string, unknown>): AccountingReversalDocument {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    storeId: String(row.store_id),
    originalEventId: String(row.original_event_id),
    reversalEventId: String(row.reversal_event_id),
    sourceType: String(row.source_type),
    sourceId: String(row.source_id),
    status: row.status as AccountingReversalDocument["status"],
    ...(row.reason ? {reason: String(row.reason)} : {}),
    actor: String(row.actor),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

export function createAccountingEventOperations({
  initializePostgres,
  getPool,
  scopedTenantId,
  scopedStoreId,
}: AccountingEventDependencies) {
  async function syncAccountingEventsForRecordsInTransaction(client: PoolClient, sourceKey: string, items: unknown[], tenantId?: string, storeId?: string) {
    const scope = scopedTenantId(tenantId);
    const storeScope = scopedStoreId(storeId);
    for (const item of items) {
      const projection = projectAccountingRecord(sourceKey, item);
      if (!projection) continue;
      const {event, link, line} = projection;
      await client.query(
        `INSERT INTO gpu_accounting_events
          (id, tenant_id, store_id, event_type, status, effective_date, total_amount, currency,
           reversal_of_event_id, actor, source_type, source_id, source_no, payload, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'CNY', $8, $9, $10, $11, $12, $13::jsonb, NOW(), NOW())
         ON CONFLICT (id) DO UPDATE SET
           tenant_id = EXCLUDED.tenant_id, store_id = EXCLUDED.store_id,
           status = EXCLUDED.status, effective_date = EXCLUDED.effective_date,
           total_amount = EXCLUDED.total_amount, reversal_of_event_id = EXCLUDED.reversal_of_event_id,
           actor = EXCLUDED.actor, payload = gpu_accounting_events.payload || EXCLUDED.payload,
           updated_at = NOW()`,
        [event.id, scope, storeScope, event.eventType, event.status, event.effectiveDate, event.totalAmount, event.reversalOfEventId || null, event.actor || null, event.sourceType, event.sourceId, event.sourceNo, JSON.stringify(event.payload)],
      );
      await client.query(
        `INSERT INTO gpu_accounting_event_links
          (event_id, tenant_id, store_id, source_type, source_id, source_no, role, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
         ON CONFLICT (tenant_id, store_id, source_type, source_id) DO UPDATE SET
           event_id = EXCLUDED.event_id, source_no = EXCLUDED.source_no, payload = EXCLUDED.payload`,
        [link.eventId, scope, storeScope, link.sourceType, link.sourceId, link.sourceNo || null, link.role, JSON.stringify({sourceKey})],
      );
      await client.query(
        `INSERT INTO gpu_accounting_event_lines
          (id, tenant_id, store_id, event_id, line_key, line_type, direction, amount, description, source_type, source_id, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
         ON CONFLICT (tenant_id, store_id, event_id, line_key) DO UPDATE SET
           event_id = EXCLUDED.event_id, direction = EXCLUDED.direction, amount = EXCLUDED.amount,
           description = EXCLUDED.description, payload = EXCLUDED.payload, updated_at = NOW()`,
        [accountingEventLineId(event.id, line.lineKey), scope, storeScope, event.id, line.lineKey, line.lineType, line.direction, line.amount, line.description || null, line.sourceType, line.sourceId, JSON.stringify({sourceKey})],
      );
    }
  }

  async function listAccountingEvents(input: {limit?: number; status?: string; keyword?: string; tenantId?: string; storeId?: string} = {}) {
    await initializePostgres();
    const limit = Math.max(1, Math.min(500, Math.floor(Number(input.limit) || 100)));
    const params: unknown[] = [scopedTenantId(input.tenantId), scopedStoreId(input.storeId)];
    const conditions = ["tenant_id = $1", "store_id = $2"];
    if (input.status && ["草稿", "已提交", "已入账", "作废"].includes(input.status)) {
      params.push(input.status);
      conditions.push(`status = $${params.length}`);
    }
    if (input.keyword?.trim()) {
      params.push(`%${input.keyword.trim()}%`);
      conditions.push(`(id ILIKE $${params.length} OR source_id ILIKE $${params.length} OR COALESCE(source_no, '') ILIKE $${params.length} OR event_type ILIKE $${params.length})`);
    }
    params.push(limit);
    const result = await getPool().query<Record<string, unknown>>(
      `SELECT id, tenant_id, store_id, event_type, status, effective_date, total_amount, currency,
              reversal_of_event_id, actor, source_type, source_id, source_no, payload, created_at, updated_at
         FROM gpu_accounting_events
        WHERE ${conditions.join(" AND ")}
        ORDER BY effective_date DESC, created_at DESC, id DESC
        LIMIT $${params.length}`,
      params,
    );
    return result.rows.map(mapEventRow);
  }

  async function getAccountingEvent(id: string, tenantId?: string, storeId?: string) {
    await initializePostgres();
    const scope = scopedTenantId(tenantId);
    const storeScope = scopedStoreId(storeId);
    const result = await getPool().query<Record<string, unknown>>(
      `SELECT id, tenant_id, store_id, event_type, status, effective_date, total_amount, currency,
              reversal_of_event_id, actor, source_type, source_id, source_no, payload, created_at, updated_at
         FROM gpu_accounting_events WHERE tenant_id = $1 AND store_id = $2 AND id = $3`,
      [scope, storeScope, id],
    );
    const row = result.rows[0];
    if (!row) return null;
    const event = mapEventRow(row);
    const [lines, links, reversals] = await Promise.all([
      getPool().query<Record<string, unknown>>(`SELECT id, event_id, line_key, line_type, direction, amount, description, source_type, source_id FROM gpu_accounting_event_lines WHERE tenant_id = $1 AND store_id = $2 AND event_id = $3 ORDER BY id`, [scope, storeScope, id]),
      getPool().query<Record<string, unknown>>(`SELECT event_id, source_type, source_id, source_no, role FROM gpu_accounting_event_links WHERE tenant_id = $1 AND store_id = $2 AND event_id = $3 ORDER BY source_type, source_id`, [scope, storeScope, id]),
      getPool().query<Record<string, unknown>>(`SELECT id, tenant_id, store_id, original_event_id, reversal_event_id, source_type, source_id, status, reason, actor, created_at FROM gpu_accounting_reversal_documents WHERE tenant_id = $1 AND store_id = $2 AND (original_event_id = $3 OR reversal_event_id = $3) ORDER BY created_at DESC`, [scope, storeScope, id]),
    ]);
    event.lines = lines.rows.map((line) => ({
      id: String(line.id), eventId: String(line.event_id), lineKey: String(line.line_key), lineType: String(line.line_type), direction: line.direction as AccountingEventLine["direction"], amount: numberValue(line.amount), ...(line.description ? {description: String(line.description)} : {}), sourceType: String(line.source_type), sourceId: String(line.source_id),
    }));
    event.links = links.rows.map((link) => ({eventId: String(link.event_id), sourceType: String(link.source_type), sourceId: String(link.source_id), ...(link.source_no ? {sourceNo: String(link.source_no)} : {}), role: link.role as AccountingEventLink["role"]}));
    (event as AccountingEvent & {reversals?: AccountingReversalDocument[]}).reversals = reversals.rows.map(mapReversalRow);
    return event;
  }

  async function createAccountingReversalDocumentInTransaction(client: PoolClient, input: {
    originalEventId: string;
    reversalEventId: string;
    sourceType: string;
    sourceId: string;
    reason?: string;
    actor: string;
    effectiveDate?: string;
  }, tenantId?: string, storeId?: string) {
    const scope = scopedTenantId(tenantId);
    const storeScope = scopedStoreId(storeId);
    const original = await client.query<Record<string, unknown>>(
      `SELECT event_type, status, effective_date, total_amount, currency, source_no, payload
         FROM gpu_accounting_events WHERE tenant_id = $1 AND store_id = $2 AND id = $3 FOR UPDATE`,
      [scope, storeScope, input.originalEventId],
    );
    const base = original.rows[0];
    const date = input.effectiveDate || (base?.effective_date instanceof Date ? base.effective_date.toISOString().slice(0, 10) : base?.effective_date ? String(base.effective_date).slice(0, 10) : new Date().toISOString().slice(0, 10));
    const amount = -numberValue(base?.total_amount);
    await client.query(
      `INSERT INTO gpu_accounting_events
        (id, tenant_id, store_id, event_type, status, effective_date, total_amount, currency,
         reversal_of_event_id, actor, source_type, source_id, source_no, payload)
       VALUES ($1, $2, $3, '冲销单', '已入账', $4, $5, $6, $7, $8, 'reversal', $9, $10, $11::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [input.reversalEventId, scope, storeScope, date, amount, String(base?.currency || "CNY"), input.originalEventId, input.actor, input.sourceId, input.sourceId, JSON.stringify({sourceType: input.sourceType, sourceId: input.sourceId, reason: input.reason || "", originalEventId: input.originalEventId})],
    );
    const result = await client.query<Record<string, unknown>>(
      `INSERT INTO gpu_accounting_reversal_documents
        (id, tenant_id, store_id, original_event_id, reversal_event_id, source_type, source_id, status, reason, actor)
       VALUES ($1, $2, $3, $4, $5, $6, $7, '已入账', $8, $9)
       ON CONFLICT (tenant_id, store_id, original_event_id, reversal_event_id) DO NOTHING
       RETURNING id, tenant_id, store_id, original_event_id, reversal_event_id, source_type, source_id, status, reason, actor, created_at`,
      [`ARD-${input.reversalEventId}`, scope, storeScope, input.originalEventId, input.reversalEventId, input.sourceType, input.sourceId, input.reason?.trim() || null, input.actor],
    );
    const row = result.rows[0] || (await client.query<Record<string, unknown>>(
      `SELECT id, tenant_id, store_id, original_event_id, reversal_event_id, source_type, source_id, status, reason, actor, created_at
         FROM gpu_accounting_reversal_documents
        WHERE tenant_id = $1 AND store_id = $2 AND original_event_id = $3 AND reversal_event_id = $4`,
      [scope, storeScope, input.originalEventId, input.reversalEventId],
    )).rows[0];
    if (!row) throw new Error("冲销单留痕写入失败");
    await client.query(
      `INSERT INTO gpu_accounting_event_links
        (event_id, tenant_id, store_id, source_type, source_id, source_no, role, payload)
       VALUES ($1, $2, $3, 'reversal', $4, $5, 'reversal', $6::jsonb)
       ON CONFLICT (tenant_id, store_id, source_type, source_id) DO NOTHING`,
      [input.reversalEventId, scope, storeScope, input.reversalEventId, base?.source_no ? String(base.source_no) : input.sourceId, JSON.stringify({originalEventId: input.originalEventId, sourceType: input.sourceType, sourceId: input.sourceId})],
    );
    await client.query(
      `INSERT INTO gpu_accounting_event_lines
        (id, tenant_id, store_id, event_id, line_key, line_type, direction, amount, description, source_type, source_id, payload)
       VALUES ($1, $2, $3, $4, 'total', 'reversal_total', 'memo', $5, '冲销合计', 'reversal', $6, $7::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [`AEL-reversal-${input.reversalEventId}-total`, scope, storeScope, input.reversalEventId, amount, input.sourceId, JSON.stringify({originalEventId: input.originalEventId})],
    );
    return mapReversalRow(row);
  }

  async function listReversalDocuments(limit = 100, tenantId?: string, storeId?: string) {
    await initializePostgres();
    const result = await getPool().query<Record<string, unknown>>(
      `SELECT id, tenant_id, store_id, original_event_id, reversal_event_id, source_type, source_id, status, reason, actor, created_at
         FROM gpu_accounting_reversal_documents WHERE tenant_id = $1 AND store_id = $2
        ORDER BY created_at DESC, id DESC LIMIT $3`,
      [scopedTenantId(tenantId), scopedStoreId(storeId), Math.max(1, Math.min(500, Math.floor(Number(limit) || 100)))],
    );
    return result.rows.map(mapReversalRow);
  }

  return {
    syncAccountingEventsForRecordsInTransaction,
    listAccountingEvents,
    getAccountingEvent,
    createAccountingReversalDocumentInTransaction,
    listReversalDocuments,
  };
}

export type {AccountingEventDependencies};
