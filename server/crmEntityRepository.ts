import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { SalesInvoice } from "../src/types.ts";
import { currentCrmTenantId, scopedCrmSourceId } from "./crmTenant.ts";
import {isPersonalPurchaseSource} from "../src/utils/purchaseSources.ts";

type CrmEntitySourceType = "customer" | "vendor";

type CrmEntityLinkInput = {
  sourceType: CrmEntitySourceType;
  sourceId: string;
  entityType: string;
  entityId: string;
  relationType: string;
  summary: string;
  occurredAt?: string;
  actorId?: string;
  payload?: Record<string, unknown>;
};

function stableId(prefix: string, value: string, tenantId = currentCrmTenantId()) {
  const scopedValue = tenantId === "tenant_default" ? value : `${tenantId}:${value}`;
  return `${prefix}-${createHash("sha256").update(scopedValue).digest("hex").slice(0, 16)}`;
}

async function findAccountId(client: PoolClient, sourceType: CrmEntitySourceType, sourceId: string, tenantId: string) {
  const result = await client.query<{ account_id: string }>(
    `SELECT account_id
     FROM gpu_crm_legacy_map
     WHERE source_type = $1 AND source_id = $2 AND tenant_id = $3
     LIMIT 1`,
    [sourceType, scopedCrmSourceId(sourceType, sourceId, tenantId), tenantId],
  );
  return result.rows[0]?.account_id;
}

/** Link a legacy business document to a normalized CRM主体 and append one idempotent timeline event. */
export async function syncCrmEntityLink(client: PoolClient, input: CrmEntityLinkInput) {
  const tenantId = currentCrmTenantId();
  const accountId = await findAccountId(client, input.sourceType, input.sourceId, tenantId);
  if (!accountId) return null;

  const linkKey = `${input.sourceType}:${input.sourceId}:${input.entityType}:${input.entityId}:${input.relationType}`;
  await client.query(
    `INSERT INTO gpu_crm_entity_links
       (account_id, tenant_id, entity_type, entity_id, relation_type, occurred_at)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, NOW()))
     ON CONFLICT (account_id, entity_type, entity_id, relation_type) DO UPDATE SET
       occurred_at = EXCLUDED.occurred_at`,
    [accountId, tenantId, input.entityType, input.entityId, input.relationType, input.occurredAt || null],
  );

  await client.query(
    `INSERT INTO gpu_crm_timeline_events
       (id, tenant_id, account_id, event_type, source_type, source_id, summary, payload, actor_id, idempotency_key, occurred_at)
     VALUES ($1, $2, $3, 'business_entity_linked', $4, $5, $6, $7::jsonb, $8, $9, COALESCE($10::timestamptz, NOW()))
     ON CONFLICT (idempotency_key) DO UPDATE SET
       account_id = EXCLUDED.account_id,
       summary = EXCLUDED.summary,
       payload = EXCLUDED.payload,
       actor_id = EXCLUDED.actor_id,
       occurred_at = EXCLUDED.occurred_at`,
    [
      stableId("CRM-TL", `entity:${linkKey}`, tenantId),
      tenantId,
      accountId,
      input.entityType,
      input.entityId,
      input.summary,
      JSON.stringify({ sourceType: input.sourceType, sourceId: input.sourceId, relationType: input.relationType, ...(input.payload || {}) }),
      input.actorId || null,
      tenantId === "tenant_default" ? `entity:${linkKey}` : `${tenantId}:entity:${linkKey}`,
      input.occurredAt || null,
    ],
  );
  return accountId;
}

export async function syncCrmSalesInvoiceLink(client: PoolClient, invoice: SalesInvoice, actorId?: string) {
  if (!invoice.customerId) return null;
  const sourceType: CrmEntitySourceType = invoice.customerPartnerType === "vendor" ? "vendor" : "customer";
  return syncCrmEntityLink(client, {
    sourceType,
    sourceId: invoice.customerId,
    entityType: "sales_invoice",
    entityId: invoice.id,
    relationType: "sold_to",
    summary: `销售订单：${invoice.invoiceNo || invoice.id}`,
    occurredAt: invoice.date,
    actorId,
    payload: { invoiceNo: invoice.invoiceNo, customerName: invoice.customerName, totalAmount: invoice.totalAmount },
  });
}

export async function syncCrmPurchaseInvoiceLink(
  client: PoolClient,
  invoice: {
    id: string;
    invoiceNo: string;
    sourceType: string;
    sourcePartnerId?: string;
    sourcePartnerType?: "customer" | "vendor";
    supplierName: string;
    date?: string;
    totalCost?: number;
  },
  actorId?: string,
) {
  if (!invoice.sourcePartnerId) return null;
  const isCustomerSource = invoice.sourcePartnerType === "customer" || isPersonalPurchaseSource(invoice.sourceType);
  const sourceType: CrmEntitySourceType = isCustomerSource ? "customer" : "vendor";
  return syncCrmEntityLink(client, {
    sourceType,
    sourceId: invoice.sourcePartnerId,
    entityType: "purchase_invoice",
    entityId: invoice.id,
    relationType: isCustomerSource ? "recycle_from" : "purchased_from",
    summary: `${isCustomerSource ? invoice.sourceType : "采购订单"}：${invoice.invoiceNo || invoice.id}`,
    occurredAt: invoice.date,
    actorId,
    payload: { invoiceNo: invoice.invoiceNo, supplierName: invoice.supplierName, totalCost: invoice.totalCost, sourceType: invoice.sourceType },
  });
}
