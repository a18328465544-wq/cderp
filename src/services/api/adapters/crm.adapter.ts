import type {CrmFollowUpCreateRequestDto} from "../dto/crm.dto";
import type {CrmAccount, CrmAccountPage, CrmFollowUpFormValues, CrmSummary, CrmTimelinePage} from "@/src/types/crm";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : value === undefined || value === null ? fallback : String(value);
}

function optionalText(value: unknown) {
  const valueText = text(value).trim();
  return valueText || undefined;
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

export function adaptCrmAccount(value: unknown): CrmAccount {
  const dto = record(value);
  const legacy = record(dto.legacyCustomer);
  const legacyStatus = optionalText(legacy.crmStatus);
  const normalizedStatus = text(dto.status, "active");
  const rawLevel = optionalText(dto.level) || optionalText(legacy.level) || optionalText(legacy.suggestedLevel);
  const isCoreCustomer = legacy.isCoreCustomer === true || rawLevel === "S级";
  return {
    id: text(dto.id),
    legacyCustomerId: optionalText(legacy.id),
    accountType: dto.accountType === "company" ? "company" : "individual",
    displayName: text(dto.displayName, text(legacy.name, "未命名客户")),
    businessStatus: legacyStatus || (numberValue(legacy.buyCount) > 0 ? "已成交" : "线索"),
    normalizedStatus,
    stage: optionalText(legacy.crmStage),
    level: isCoreCustomer ? "S级" : rawLevel,
    isCoreCustomer,
    owner: optionalText(dto.ownerId) || optionalText(legacy.owner),
    intent: optionalText(legacy.intent),
    source: optionalText(dto.source) || optionalText(legacy.source),
    phone: optionalText(dto.primaryPhone) || optionalText(legacy.phone),
    wechat: optionalText(dto.primaryWechat) || optionalText(legacy.wechat),
    qq: optionalText(dto.primaryQq) || optionalText(legacy.qq),
    city: optionalText(dto.city) || optionalText(legacy.city),
    companyName: optionalText(dto.companyName) || optionalText(legacy.company),
    roles: stringList(dto.roles),
    contactCount: numberValue(dto.contactCount),
    lastContactAt: optionalText(legacy.lastContactAt) || optionalText(legacy.lastFollowTime),
    nextFollowAt: optionalText(legacy.nextFollowUpAt) || optionalText(legacy.nextFollowTime),
    nextAction: optionalText(legacy.nextAction),
    dealProbability: optionalNumber(legacy.dealProbability),
    estimatedAmount: optionalNumber(legacy.estimatedAmount) ?? optionalNumber(legacy.budget),
    remarks: optionalText(legacy.remarks),
    tags: stringList(legacy.tags),
    updatedAt: text(dto.updatedAt),
  };
}

export function adaptCrmAccountPage(value: unknown): CrmAccountPage {
  const envelope = record(value);
  const data = record(envelope.data);
  const meta = record(data.meta);
  const items = Array.isArray(data.items) ? data.items.map(adaptCrmAccount).filter((item) => Boolean(item.id)) : [];
  return {
    items,
    page: Math.max(1, numberValue(meta.page, 1)),
    pageSize: Math.max(1, numberValue(meta.pageSize, 20)),
    total: Math.max(0, numberValue(meta.total, items.length)),
  };
}

export function adaptCrmTimelinePage(value: unknown): CrmTimelinePage {
  const envelope = record(value);
  const data = record(envelope.data);
  const meta = record(data.meta);
  const rows = Array.isArray(data.items) ? data.items : [];
  const items = rows.map((row) => {
    const dto = record(row);
    return {
      id: text(dto.id),
      eventType: text(dto.eventType),
      sourceType: text(dto.sourceType),
      sourceId: text(dto.sourceId),
      summary: text(dto.summary, "CRM 事件"),
      actorId: optionalText(dto.actorId),
      occurredAt: text(dto.occurredAt),
    };
  }).filter((item) => Boolean(item.id));
  return {items, page: Math.max(1, numberValue(meta.page, 1)), pageSize: Math.max(1, numberValue(meta.pageSize, 50)), total: Math.max(0, numberValue(meta.total, items.length))};
}

export function adaptCrmSummary(value: unknown): CrmSummary {
  const envelope = record(value);
  const data = record(envelope.data);
  const totals = record(data.totals);
  const ownerRows = Array.isArray(data.ownerSummary) ? data.ownerSummary : [];
  return {
    totals: {
      customers: numberValue(totals.customers),
      leads: numberValue(totals.leads),
      following: numberValue(totals.following),
      deals: numberValue(totals.deals),
      highIntent: numberValue(totals.highIntent),
      pendingFollowUps: numberValue(totals.pendingFollowUps),
      requirements: numberValue(totals.requirements),
    },
    owners: ownerRows.map((row) => {
      const dto = record(row);
      return {owner: text(dto.owner, "未分配"), customers: numberValue(dto.customers), followUps: numberValue(dto.followUps), requirements: numberValue(dto.requirements), highIntent: numberValue(dto.highIntent)};
    }),
  };
}

export function toCrmFollowUpRequest(values: CrmFollowUpFormValues): CrmFollowUpCreateRequestDto {
  const nextFollowTime = values.nextFollowTime.trim() || undefined;
  const nextAction = values.nextAction.trim() || undefined;
  const remarks = values.remarks.trim() || undefined;
  return {
    customerId: values.customerId.trim(),
    contactMethod: values.contactMethod,
    content: values.content.trim(),
    result: values.result,
    ...(nextFollowTime ? {nextFollowTime, nextFollowUpAt: nextFollowTime} : {}),
    ...(nextAction ? {nextAction} : {}),
    ...(values.dealProbability > 0 ? {dealProbability: values.dealProbability} : {}),
    ...(values.estimatedAmount > 0 ? {estimatedAmount: values.estimatedAmount} : {}),
    ...(remarks ? {remarks} : {}),
  };
}
