import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { CrmFollowUpRecord, CrmRequirement, CustomerCard, Vendor } from "../src/types.ts";
import { acquireStateWriteLock, withDatabaseTransaction } from "./db.ts";

type LegacySourceType = "customer" | "vendor";

type LegacySource = {
  sourceType: LegacySourceType;
  id: string;
  name: string;
  phone?: string;
  wechat?: string;
  contactPerson?: string;
  category?: string;
  source?: string;
  owner?: string;
  level?: string;
  isCoreCustomer?: boolean;
  type?: string;
  remarks?: string;
};

export type CrmMigrationAccount = {
  id: string;
  accountType: "individual" | "company";
  displayName: string;
  normalizedName: string;
  source: string;
  level?: string;
  ownerId?: string;
  primaryPhone?: string;
  primaryWechat?: string;
  notes?: string;
  legacyCustomerId?: string;
  legacyVendorId?: string;
};

export type CrmMigrationContact = {
  id: string;
  accountId: string;
  name: string;
  phone?: string;
  wechat?: string;
  contactRole: string;
  isPrimary: boolean;
  notes?: string;
};

export type CrmMigrationRole = {
  accountId: string;
  role: "customer" | "supplier" | "peer" | "recycle_source" | "buyer" | "seller";
};

export type CrmMigrationMap = {
  sourceType: LegacySourceType;
  sourceId: string;
  accountId: string;
};

export type CrmMigrationRequirement = {
  id: string;
  accountId: string;
  title: string;
  productDemand: string;
  budget: number | null;
  intent: string;
  stage: string;
  source: string;
  ownerId: string;
  expectedDealAt: string | null;
  status: "open" | "won" | "lost" | "closed" | "archived";
  remarks?: string;
  legacyId: string;
};

export type CrmMigrationFollowUp = {
  id: string;
  accountId: string;
  contactMethod: string;
  content: string;
  result: string;
  handlerId: string;
  followTime: string;
  nextFollowTime: string | null;
  remarks?: string;
  legacyId: string;
};

export type CrmMigrationTimelineEvent = {
  id: string;
  accountId: string;
  eventType: string;
  sourceType: string;
  sourceId: string;
  summary: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  occurredAt: string;
};

export type CrmMigrationPlan = {
  accounts: CrmMigrationAccount[];
  contacts: CrmMigrationContact[];
  roles: CrmMigrationRole[];
  legacyMap: CrmMigrationMap[];
  requirements: CrmMigrationRequirement[];
  followups: CrmMigrationFollowUp[];
  timelineEvents: CrmMigrationTimelineEvent[];
  warnings: string[];
};

export type CrmMigrationReport = {
  dryRun: boolean;
  sourceCounts: { customers: number; vendors: number; followups: number; requirements: number };
  plannedCounts: {
    accounts: number;
    contacts: number;
    roles: number;
    legacyMap: number;
    requirements: number;
    followups: number;
    timelineEvents: number;
  };
  warnings: string[];
};

type LegacyCrmData = {
  customers: CustomerCard[];
  vendors: Vendor[];
  followups: CrmFollowUpRecord[];
  requirements: CrmRequirement[];
};

function normalized(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase("zh-CN").replace(/\s+/g, " ");
}

export function normalizeCrmIdentity(value: unknown) {
  return normalized(value).replace(/[\s\-+()（）]/g, "");
}

function stableId(prefix: string, value: string) {
  return `${prefix}-${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

function identityKey(source: LegacySource) {
  const phone = normalizeCrmIdentity(source.phone);
  if (phone) return `phone:${phone}`;
  const wechat = normalizeCrmIdentity(source.wechat);
  if (wechat) return `wechat:${wechat}`;
  return `name:${normalized(source.name)}`;
}

function customerSource(customer: CustomerCard): LegacySource {
  return {
    sourceType: "customer",
    id: customer.id,
    name: customer.name,
    phone: customer.phone || customer.contact,
    wechat: customer.wechat,
    source: customer.source || customer.firstChannel,
    owner: customer.owner,
    level: customer.level,
    isCoreCustomer: customer.isCoreCustomer,
    type: customer.type,
    remarks: customer.remarks,
  };
}

function vendorSource(vendor: Vendor): LegacySource {
  return {
    sourceType: "vendor",
    id: vendor.id,
    name: vendor.name,
    phone: vendor.phone,
    contactPerson: vendor.contactPerson,
    category: vendor.partnerCategory,
    source: vendor.partnerCategory,
    level: vendor.level,
    isCoreCustomer: vendor.isCoreCustomer,
    type: vendor.type,
    remarks: vendor.remarks,
  };
}

function rolesFor(source: LegacySource): CrmMigrationRole["role"][] {
  const type = `${source.type || ""} ${source.category || ""}`;
  if (source.sourceType === "customer") {
    const roles: CrmMigrationRole["role"][] = ["customer"];
    if (/同行/.test(type)) roles.push("peer");
    if (/回收|卖家|置换/.test(type)) roles.push("recycle_source");
    return roles;
  }
  const roles: CrmMigrationRole["role"][] = ["supplier"];
  if (/同行/.test(type)) roles.push("peer");
  if (/采购|批发/.test(type)) roles.push("buyer");
  if (/卖货|供应|货源/.test(type)) roles.push("seller");
  return roles;
}

function requirementStatus(stage: string): CrmMigrationRequirement["status"] {
  if (stage === "已成交") return "won";
  if (stage === "已关闭") return "closed";
  return "open";
}

function toIsoOrNull(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function toDateOrNull(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

export function buildCrmMigrationPlan(data: LegacyCrmData): CrmMigrationPlan {
  const groups = new Map<string, LegacySource[]>();
  const sources = [...data.customers.map(customerSource), ...data.vendors.map(vendorSource)];
  for (const source of sources) {
    const key = identityKey(source);
    groups.set(key, [...(groups.get(key) || []), source]);
  }

  const accounts: CrmMigrationAccount[] = [];
  const contacts: CrmMigrationContact[] = [];
  const roles: CrmMigrationRole[] = [];
  const legacyMap: CrmMigrationMap[] = [];
  const accountByLegacyId = new Map<string, string>();
  const warnings: string[] = [];

  for (const [key, group] of groups) {
    const customer = group.find((source) => source.sourceType === "customer");
    const vendor = group.find((source) => source.sourceType === "vendor");
    const primary = customer || vendor || group[0];
    if (!primary) {
      warnings.push(`跳过空的 CRM 分组：${key}`);
      continue;
    }
    const accountId = stableId("CRM", key);
    const aliases = Array.from(new Set(group.map((source) => source.name.trim()).filter(Boolean)));
    const primaryPhone = group.find((source) => normalizeCrmIdentity(source.phone))?.phone?.trim();
    const primaryWechat = group.find((source) => normalizeCrmIdentity(source.wechat))?.wechat?.trim();
    const level = group.find((source) => source.isCoreCustomer || source.level === "S级")?.level
      || group.find((source) => source.level)?.level;
    const owner = group.find((source) => source.owner)?.owner?.trim();
    const account: CrmMigrationAccount = {
      id: accountId,
      accountType: vendor ? "company" : "individual",
      displayName: primary.name.trim(),
      normalizedName: normalized(primary.name),
      source: primary.source || primary.category || "legacy",
      level,
      ownerId: owner || undefined,
      primaryPhone,
      primaryWechat,
      notes: aliases.length > 1 ? `旧档案别名：${aliases.join("、")}` : primary.remarks,
      legacyCustomerId: customer?.id,
      legacyVendorId: vendor?.id,
    };
    accounts.push(account);

    group.forEach((source, index) => {
      accountByLegacyId.set(`${source.sourceType}:${source.id}`, accountId);
      legacyMap.push({ sourceType: source.sourceType, sourceId: source.id, accountId });
      for (const role of rolesFor(source)) {
        if (!roles.some((item) => item.accountId === accountId && item.role === role)) roles.push({ accountId, role });
      }
      contacts.push({
        id: stableId("CRM-CONTACT", `${source.sourceType}:${source.id}`),
        accountId,
        name: source.contactPerson?.trim() || source.name.trim(),
        phone: source.phone?.trim() || undefined,
        wechat: source.wechat?.trim() || undefined,
        contactRole: source.sourceType === "vendor" ? "同行/供应商联系人" : source.type || "客户联系人",
        isPrimary: index === 0,
        notes: source.remarks,
      });
    });

    const phones = new Set(group.map((source) => normalizeCrmIdentity(source.phone)).filter(Boolean));
    const wechats = new Set(group.map((source) => normalizeCrmIdentity(source.wechat)).filter(Boolean));
    if (phones.size > 1 || wechats.size > 1) {
      warnings.push(`主体 ${account.displayName} 存在多个联系方式，已保留为多个联系人`);
    }
  }

  const requirements: CrmMigrationRequirement[] = [];
  const followups: CrmMigrationFollowUp[] = [];
  const timelineEvents: CrmMigrationTimelineEvent[] = [];
  for (const requirement of data.requirements) {
    const accountId = accountByLegacyId.get(`customer:${requirement.customerId}`);
    if (!accountId) {
      warnings.push(`需求 ${requirement.id} 找不到客户映射，已跳过`);
      continue;
    }
    const normalizedRequirement: CrmMigrationRequirement = {
      id: stableId("CRM-REQ", requirement.id),
      accountId,
      title: requirement.productDemand.trim() || "客户需求",
      productDemand: requirement.productDemand,
      budget: Number.isFinite(Number(requirement.budget)) ? Number(requirement.budget) : null,
      intent: requirement.intent,
      stage: requirement.stage,
      source: requirement.source,
      ownerId: requirement.handler,
      expectedDealAt: toDateOrNull(requirement.expectedDealTime),
      status: requirementStatus(requirement.stage),
      remarks: requirement.remarks,
      legacyId: requirement.id,
    };
    requirements.push(normalizedRequirement);
    timelineEvents.push({
      id: stableId("CRM-TL", `requirement:${requirement.id}`),
      accountId,
      eventType: "requirement_created",
      sourceType: "crm_requirement",
      sourceId: normalizedRequirement.id,
      summary: `新增需求：${normalizedRequirement.title}`,
      payload: { legacyId: requirement.id, stage: requirement.stage, budget: normalizedRequirement.budget },
      idempotencyKey: `legacy:crm_requirement:${requirement.id}`,
      occurredAt: toIsoOrNull(requirement.createTime) || new Date(0).toISOString(),
    });
  }

  for (const followup of data.followups) {
    const accountId = accountByLegacyId.get(`customer:${followup.customerId}`);
    if (!accountId) {
      warnings.push(`跟进 ${followup.id} 找不到客户映射，已跳过`);
      continue;
    }
    const normalizedFollowup: CrmMigrationFollowUp = {
      id: stableId("CRM-FOLLOWUP", followup.id),
      accountId,
      contactMethod: followup.contactMethod,
      content: followup.content,
      result: followup.result,
      handlerId: followup.handler,
      followTime: toIsoOrNull(followup.followTime) || new Date(0).toISOString(),
      nextFollowTime: toIsoOrNull(followup.nextFollowTime),
      remarks: followup.remarks,
      legacyId: followup.id,
    };
    followups.push(normalizedFollowup);
    timelineEvents.push({
      id: stableId("CRM-TL", `followup:${followup.id}`),
      accountId,
      eventType: "followup_recorded",
      sourceType: "crm_followup",
      sourceId: normalizedFollowup.id,
      summary: `跟进记录：${followup.result}`,
      payload: { legacyId: followup.id, contactMethod: followup.contactMethod },
      idempotencyKey: `legacy:crm_followup:${followup.id}`,
      occurredAt: normalizedFollowup.followTime,
    });
  }

  return { accounts, contacts, roles, legacyMap, requirements, followups, timelineEvents, warnings };
}

async function readLegacyCollection<T>(client: PoolClient, table: string): Promise<T[]> {
  const result = await client.query<{ data: T }>(`SELECT data FROM ${table} ORDER BY id ASC`);
  return result.rows.map((row) => row.data);
}

export async function readLegacyCrmData(client: PoolClient): Promise<LegacyCrmData> {
  // A single PoolClient must execute queries sequentially. Parallel Promise.all
  // would race on the same connection and is rejected by newer pg versions.
  const customers = await readLegacyCollection<CustomerCard>(client, "gpu_customers");
  const vendors = await readLegacyCollection<Vendor>(client, "gpu_vendors");
  const followups = await readLegacyCollection<CrmFollowUpRecord>(client, "gpu_crm_follow_ups");
  const requirements = await readLegacyCollection<CrmRequirement>(client, "gpu_crm_requirements");
  return { customers, vendors, followups, requirements };
}

export function migrationReport(plan: CrmMigrationPlan, sourceCounts: CrmMigrationReport["sourceCounts"], dryRun: boolean): CrmMigrationReport {
  return {
    dryRun,
    sourceCounts,
    plannedCounts: {
      accounts: plan.accounts.length,
      contacts: plan.contacts.length,
      roles: plan.roles.length,
      legacyMap: plan.legacyMap.length,
      requirements: plan.requirements.length,
      followups: plan.followups.length,
      timelineEvents: plan.timelineEvents.length,
    },
    warnings: plan.warnings,
  };
}

export async function applyCrmMigrationPlan(client: PoolClient, plan: CrmMigrationPlan) {
  for (const account of plan.accounts) {
    await client.query(`
      INSERT INTO gpu_crm_accounts
        (id, account_type, display_name, normalized_name, source, level, owner_id, primary_phone, primary_wechat, notes, legacy_customer_id, legacy_vendor_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        account_type = EXCLUDED.account_type,
        display_name = EXCLUDED.display_name,
        normalized_name = EXCLUDED.normalized_name,
        source = EXCLUDED.source,
        level = EXCLUDED.level,
        owner_id = EXCLUDED.owner_id,
        primary_phone = EXCLUDED.primary_phone,
        primary_wechat = EXCLUDED.primary_wechat,
        notes = EXCLUDED.notes,
        legacy_customer_id = EXCLUDED.legacy_customer_id,
        legacy_vendor_id = EXCLUDED.legacy_vendor_id,
        updated_at = NOW(),
        deleted_at = NULL
    `, [account.id, account.accountType, account.displayName, account.normalizedName, account.source, account.level || null, account.ownerId || null, account.primaryPhone || null, account.primaryWechat || null, account.notes || null, account.legacyCustomerId || null, account.legacyVendorId || null]);
  }
  for (const role of plan.roles) {
    await client.query(`
      INSERT INTO gpu_crm_account_roles (account_id, role) VALUES ($1, $2)
      ON CONFLICT (account_id, role) DO NOTHING
    `, [role.accountId, role.role]);
  }
  for (const contact of plan.contacts) {
    await client.query(`
      INSERT INTO gpu_crm_contacts (id, account_id, name, phone, wechat, contact_role, is_primary, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET
        account_id = EXCLUDED.account_id,
        name = EXCLUDED.name,
        phone = EXCLUDED.phone,
        wechat = EXCLUDED.wechat,
        contact_role = EXCLUDED.contact_role,
        is_primary = EXCLUDED.is_primary,
        notes = EXCLUDED.notes,
        updated_at = NOW()
    `, [contact.id, contact.accountId, contact.name, contact.phone || null, contact.wechat || null, contact.contactRole, contact.isPrimary, contact.notes || null]);
  }
  for (const mapping of plan.legacyMap) {
    await client.query(`
      INSERT INTO gpu_crm_legacy_map (source_type, source_id, account_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (source_type, source_id) DO UPDATE SET account_id = EXCLUDED.account_id, migrated_at = NOW()
    `, [mapping.sourceType, mapping.sourceId, mapping.accountId]);
  }
  for (const requirement of plan.requirements) {
    await client.query(`
      INSERT INTO gpu_crm_account_requirements
        (id, account_id, title, product_demand, budget, intent, stage, source, owner_id, expected_deal_at, status, remarks, legacy_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (id) DO UPDATE SET
        account_id = EXCLUDED.account_id,
        title = EXCLUDED.title,
        product_demand = EXCLUDED.product_demand,
        budget = EXCLUDED.budget,
        intent = EXCLUDED.intent,
        stage = EXCLUDED.stage,
        source = EXCLUDED.source,
        owner_id = EXCLUDED.owner_id,
        expected_deal_at = EXCLUDED.expected_deal_at,
        status = EXCLUDED.status,
        remarks = EXCLUDED.remarks,
        legacy_id = EXCLUDED.legacy_id,
        updated_at = NOW()
    `, [requirement.id, requirement.accountId, requirement.title, requirement.productDemand, requirement.budget, requirement.intent, requirement.stage, requirement.source, requirement.ownerId, requirement.expectedDealAt, requirement.status, requirement.remarks || null, requirement.legacyId]);
  }
  for (const followup of plan.followups) {
    await client.query(`
      INSERT INTO gpu_crm_followups
        (id, account_id, contact_method, content, result, handler_id, follow_time, next_follow_time, remarks, legacy_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        account_id = EXCLUDED.account_id,
        contact_method = EXCLUDED.contact_method,
        content = EXCLUDED.content,
        result = EXCLUDED.result,
        handler_id = EXCLUDED.handler_id,
        follow_time = EXCLUDED.follow_time,
        next_follow_time = EXCLUDED.next_follow_time,
        remarks = EXCLUDED.remarks,
        legacy_id = EXCLUDED.legacy_id,
        updated_at = NOW()
    `, [followup.id, followup.accountId, followup.contactMethod, followup.content, followup.result, followup.handlerId, followup.followTime, followup.nextFollowTime, followup.remarks || null, followup.legacyId]);
  }
  for (const event of plan.timelineEvents) {
    await client.query(`
      INSERT INTO gpu_crm_timeline_events
        (id, account_id, event_type, source_type, source_id, summary, payload, idempotency_key, occurred_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
      ON CONFLICT (idempotency_key) DO UPDATE SET
        account_id = EXCLUDED.account_id,
        event_type = EXCLUDED.event_type,
        source_type = EXCLUDED.source_type,
        source_id = EXCLUDED.source_id,
        summary = EXCLUDED.summary,
        payload = EXCLUDED.payload,
        occurred_at = EXCLUDED.occurred_at
    `, [event.id, event.accountId, event.eventType, event.sourceType, event.sourceId, event.summary, JSON.stringify(event.payload), event.idempotencyKey, event.occurredAt]);
  }
}

export async function runCrmMigration(dryRun = true): Promise<CrmMigrationReport> {
  // Hold the same cross-process advisory lock as normal business writes so a
  // backfill cannot race with a customer/vendor edit or a new CRM record.
  const releaseLock = await acquireStateWriteLock();
  try {
    return await withDatabaseTransaction(async (client) => {
      const legacy = await readLegacyCrmData(client);
      const plan = buildCrmMigrationPlan(legacy);
      const sourceCounts = {
        customers: legacy.customers.length,
        vendors: legacy.vendors.length,
        followups: legacy.followups.length,
        requirements: legacy.requirements.length,
      };
      if (!dryRun) await applyCrmMigrationPlan(client, plan);
      return migrationReport(plan, sourceCounts, dryRun);
    });
  } finally {
    await releaseLock();
  }
}
