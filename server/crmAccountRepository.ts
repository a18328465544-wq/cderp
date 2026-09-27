import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { CustomerCard } from "../src/types.ts";
import { currentCrmTenantId, scopedCrmSourceId } from "./crmTenant.ts";

export type CrmCustomerSyncMode = "created" | "updated";

export type CrmCustomerProjection = {
  accountId: string;
  contactId: string;
  displayName: string;
  normalizedName: string;
  source: string;
  level?: string;
  ownerId?: string;
  primaryPhone?: string;
  primaryWechat?: string;
  primaryQq?: string;
  city?: string;
  companyName?: string;
  notes?: string;
  contactRole: string;
  sourceHash: string;
  eventId: string;
  eventType: "customer_created" | "customer_updated";
  idempotencyKey: string;
};

function stableHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeCrmAccountName(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase("zh-CN").replace(/\s+/g, " ");
}

export function crmCustomerAccountId(customerId: string, tenantId = currentCrmTenantId()) {
  const key = tenantId === "tenant_default" ? `customer:${customerId}` : `${tenantId}:customer:${customerId}`;
  return `CRM-${stableHash(key).slice(0, 16)}`;
}

export function canReuseMappedCrmCustomerAccount(customerId: string, mappedLegacyCustomerId?: string | null) {
  return !mappedLegacyCustomerId || mappedLegacyCustomerId === customerId;
}

export function buildCrmCustomerProjection(
  customer: Pick<CustomerCard, "id" | "name" | "phone" | "wechat" | "qq" | "city" | "company" | "contact" | "source" | "firstChannel" | "level" | "owner" | "remarks" | "type">,
  mode: CrmCustomerSyncMode,
  tenantId = currentCrmTenantId(),
): CrmCustomerProjection {
  const displayName = String(customer.name || "").trim();
  const primaryPhone = String(customer.phone || customer.contact || "").trim() || undefined;
  const primaryWechat = String(customer.wechat || "").trim() || undefined;
  const primaryQq = String(customer.qq || "").trim() || undefined;
  const source = String(customer.firstChannel || customer.source || "CRM").trim() || "CRM";
  const contactRole = String(customer.type || "客户联系人").trim() || "客户联系人";
  const sourceHash = stableHash(JSON.stringify({
    name: displayName,
    phone: primaryPhone || "",
    wechat: primaryWechat || "",
    qq: primaryQq || "",
    city: customer.city || "",
    company: customer.company || "",
    source,
    level: customer.level || "",
    owner: customer.owner || "",
    remarks: customer.remarks || "",
  }));
  const scopedSourceId = scopedCrmSourceId("customer", customer.id, tenantId);
  const idempotencyKey = `legacy:crm_customer:${mode}:${scopedSourceId}:${sourceHash}`;

  return {
    accountId: crmCustomerAccountId(customer.id, tenantId),
    contactId: `CRM-CONTACT-${stableHash(tenantId === "tenant_default" ? `customer:${customer.id}` : `${tenantId}:customer:${customer.id}`).slice(0, 16)}`,
    displayName,
    normalizedName: normalizeCrmAccountName(displayName),
    source,
    level: customer.level || undefined,
    ownerId: customer.owner || undefined,
    primaryPhone,
    primaryWechat,
    primaryQq,
    city: String(customer.city || "").trim() || undefined,
    companyName: String(customer.company || "").trim() || undefined,
    notes: customer.remarks?.trim() || undefined,
    contactRole,
    sourceHash,
    eventId: `CRM-TL-${stableHash(idempotencyKey).slice(0, 16)}`,
    eventType: mode === "created" ? "customer_created" : "customer_updated",
    idempotencyKey,
  };
}

async function findExistingAccountId(client: PoolClient, customerId: string, tenantId: string) {
  const legacy = await client.query<{ id: string }>(
    `SELECT id
     FROM gpu_crm_accounts
     WHERE legacy_customer_id = $1
       AND tenant_id = $2
       AND deleted_at IS NULL
     ORDER BY updated_at DESC, id ASC
     LIMIT 1`,
    [customerId, tenantId],
  );
  if (legacy.rows[0]?.id) return legacy.rows[0].id;

  const scopedSourceId = scopedCrmSourceId("customer", customerId, tenantId);
  const mapped = await client.query<{ account_id: string; legacy_customer_id: string | null }>(
    `SELECT legacy_map.account_id, account.legacy_customer_id
     FROM gpu_crm_legacy_map legacy_map
     JOIN gpu_crm_accounts account
       ON account.id = legacy_map.account_id
      AND account.tenant_id = legacy_map.tenant_id
      AND account.deleted_at IS NULL
     WHERE legacy_map.source_type = 'customer'
       AND legacy_map.source_id = $1
       AND legacy_map.tenant_id = $2
     LIMIT 1`,
    [scopedSourceId, tenantId],
  );
  const mappedRow = mapped.rows[0];
  // Older deduplicating migrations could map several customer archive ids to
  // one CRM account. Reusing that account here would overwrite its canonical
  // legacy_customer_id and make the previously-linked customer disappear from
  // sales search. Allocate this customer its deterministic one-to-one account
  // unless the mapped account is unclaimed or already belongs to this archive.
  if (mappedRow?.account_id && canReuseMappedCrmCustomerAccount(customerId, mappedRow.legacy_customer_id)) {
    return mappedRow.account_id;
  }
  return undefined;
}

/**
 * Synchronize one legacy customer into the normalized CRM主体 model.
 * The caller must execute this hook inside the same transaction as the legacy JSONB patch.
 */
export async function upsertCrmCustomerAccount(
  client: PoolClient,
  customer: Pick<CustomerCard, "id" | "name" | "phone" | "wechat" | "qq" | "city" | "company" | "contact" | "source" | "firstChannel" | "level" | "owner" | "remarks" | "type">,
  mode: CrmCustomerSyncMode,
  actorId?: string,
  options: { writeTimeline?: boolean } = {},
) {
  const tenantId = currentCrmTenantId();
  const projection = buildCrmCustomerProjection(customer, mode, tenantId);
  const accountId = (await findExistingAccountId(client, customer.id, tenantId)) || projection.accountId;

  await client.query(
    `INSERT INTO gpu_crm_accounts
       (id, tenant_id, account_type, display_name, normalized_name, status, level, owner_id, source, primary_phone, primary_wechat, primary_qq, city, company_name, notes, legacy_customer_id)
     VALUES ($1, $2, 'individual', $3, $4, 'active', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (id) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       normalized_name = EXCLUDED.normalized_name,
       status = 'active',
       level = EXCLUDED.level,
       owner_id = EXCLUDED.owner_id,
       source = EXCLUDED.source,
       primary_phone = EXCLUDED.primary_phone,
       primary_wechat = EXCLUDED.primary_wechat,
       primary_qq = EXCLUDED.primary_qq,
       city = EXCLUDED.city,
       company_name = EXCLUDED.company_name,
       notes = EXCLUDED.notes,
       legacy_customer_id = EXCLUDED.legacy_customer_id,
       updated_at = NOW(),
       deleted_at = NULL
     WHERE gpu_crm_accounts.tenant_id = EXCLUDED.tenant_id`,
    [
      accountId,
      tenantId,
      projection.displayName,
      projection.normalizedName,
      projection.level || null,
      projection.ownerId || null,
      projection.source,
      projection.primaryPhone || null,
      projection.primaryWechat || null,
      projection.primaryQq || null,
      projection.city || null,
      projection.companyName || null,
      projection.notes || null,
      customer.id,
    ],
  );

  await client.query(
    `INSERT INTO gpu_crm_account_roles (account_id, tenant_id, role)
     VALUES ($1, $2, 'customer')
     ON CONFLICT (account_id, role) DO NOTHING`,
    [accountId, tenantId],
  );

  await client.query(
    `INSERT INTO gpu_crm_legacy_map (source_type, source_id, tenant_id, account_id, source_hash)
     VALUES ('customer', $1, $2, $3, $4)
     ON CONFLICT (source_type, source_id) DO UPDATE SET
       tenant_id = EXCLUDED.tenant_id,
       account_id = EXCLUDED.account_id,
       source_hash = EXCLUDED.source_hash,
       migrated_at = NOW()`,
    [scopedCrmSourceId("customer", customer.id, tenantId), tenantId, accountId, projection.sourceHash],
  );

  await client.query(
    `UPDATE gpu_crm_contacts
     SET is_primary = FALSE, updated_at = NOW()
     WHERE account_id = $1 AND tenant_id = $3 AND id <> $2`,
    [accountId, projection.contactId, tenantId],
  );
  await client.query(
    `INSERT INTO gpu_crm_contacts
       (id, tenant_id, account_id, name, phone, wechat, qq, contact_role, is_primary, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9)
     ON CONFLICT (id) DO UPDATE SET
       account_id = EXCLUDED.account_id,
       name = EXCLUDED.name,
       phone = EXCLUDED.phone,
       wechat = EXCLUDED.wechat,
       qq = EXCLUDED.qq,
       contact_role = EXCLUDED.contact_role,
       is_primary = TRUE,
       notes = EXCLUDED.notes,
       updated_at = NOW()
     WHERE gpu_crm_contacts.tenant_id = EXCLUDED.tenant_id`,
    [
      projection.contactId,
      tenantId,
      accountId,
      projection.displayName,
      projection.primaryPhone || null,
      projection.primaryWechat || null,
      projection.primaryQq || null,
      projection.contactRole,
      projection.notes || null,
    ],
  );

  if (options.writeTimeline !== false) {
    await client.query(
      `INSERT INTO gpu_crm_timeline_events
         (id, tenant_id, account_id, event_type, source_type, source_id, summary, payload, actor_id, idempotency_key)
       VALUES ($1, $2, $3, $4, 'legacy_customer', $5, $6, $7::jsonb, $8, $9)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        projection.eventId,
        tenantId,
        accountId,
        projection.eventType,
        scopedCrmSourceId("customer", customer.id, tenantId),
        mode === "created" ? `新增客户：${projection.displayName}` : `更新客户档案：${projection.displayName}`,
        JSON.stringify({ legacyCustomerId: customer.id, mode, sourceHash: projection.sourceHash }),
        actorId || null,
        projection.idempotencyKey,
      ],
    );
  }

  return { accountId, projection };
}

/** Ensure a legacy customer has a normalized主体 before writing a child CRM record. */
export async function ensureCrmCustomerAccount(
  client: PoolClient,
  customer: Pick<CustomerCard, "id" | "name" | "phone" | "wechat" | "qq" | "city" | "company" | "contact" | "source" | "firstChannel" | "level" | "owner" | "remarks" | "type">,
) {
  return upsertCrmCustomerAccount(client, customer, "updated", undefined, { writeTimeline: false });
}
