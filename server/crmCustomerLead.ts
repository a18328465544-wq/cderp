import type { CrmFollowUpRecord, CustomerCard, CustomerLevel } from "../src/types.ts";
import {customerLevels} from "../src/types/customer.ts";
import {crmContactMethodValues, crmIntentValues} from "../src/types/crm.ts";
import { customerSuggestedLevel, normalizeCustomerLevel } from "./store.ts";
import { QuickCaptureValidationError } from "./crmQuickCapture.ts";

export const CUSTOMER_LEAD_LEVELS = customerLevels;
export const CUSTOMER_LEAD_SOURCES = ["微信私域", "闲鱼", "抖音", "电话", "到店", "同行介绍", "淘宝", "其他"] as const;
export const CUSTOMER_LEAD_ACTIONS = ["电话沟通", "微信联系", "到店拜访", "发送报价", "发送方案", "其他"] as const;

export type CustomerLeadLevel = typeof CUSTOMER_LEAD_LEVELS[number];
export type CustomerLeadSource = typeof CUSTOMER_LEAD_SOURCES[number];
export type CustomerLeadAction = typeof CUSTOMER_LEAD_ACTIONS[number];

export type CustomerLeadInput = {
  name: string;
  contact: string;
  phone?: string;
  wechat?: string;
  qq?: string;
  city?: string;
  company?: string;
  source: string;
  firstChannel: string;
  owner?: string;
  type?: CustomerCard["type"];
  level: CustomerLevel;
  isCoreCustomer: boolean;
  riskReason?: string;
  intent: NonNullable<CustomerCard["intent"]>;
  budget: number;
  estimatedAmount: number;
  dealProbability: number;
  nextFollowTime?: string;
  nextFollowUpAt?: string;
  nextAction?: string;
  contactMethod?: CrmFollowUpRecord["contactMethod"];
  remarks?: string;
  tags: string[];
  fromCrm: true;
};

export type CustomerLeadPreview = {
  suggestedLevel: CustomerLeadLevel;
  suggestedLevelReason: string;
  conversionProbability: number;
  estimatedAmount: number;
  expectedCycle: string;
  recommendedAction: CustomerLeadAction;
  recommendedTime: string;
  actions: Array<{ label: string; done: boolean }>;
  warnings: string[];
  source: "rules";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").replace(/\u0000/g, "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function requiredText(value: unknown, label: string, maxLength: number) {
  const text = cleanText(value, maxLength);
  if (!text) throw new QuickCaptureValidationError(`${label}不能为空`, "CRM_CUSTOMER_LEAD_REQUIRED");
  return text;
}

function numberValue(value: unknown, fallback = 0, max = Number.MAX_SAFE_INTEGER) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(String(value).replace(/[,，￥¥\s]/g, ""));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(0, Math.round(parsed * 100) / 100));
}

function normalizeDateTime(value: unknown) {
  const text = cleanText(value, 40);
  if (!text) return undefined;
  if (/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?$/.test(text)) return text.replace("T", " ");
  return undefined;
}

function normalizeTags(value: unknown) {
  return Array.isArray(value)
    ? Array.from(new Set(value.map(item => cleanText(item, 24)).filter(Boolean))).slice(0, 12)
    : ["新建建卡"];
}

function readLeadSource(source: Record<string, unknown>) {
  return cleanText(source.firstChannel ?? source.source ?? source.channel, 32) || "其他";
}

/**
 * Normalize and validate the payload accepted by the CRM lead create endpoint.
 * The owner is intentionally not trusted here; the route overwrites it with the
 * authenticated CRM actor before calling the store action.
 */
export function normalizeCustomerLeadInput(value: unknown): CustomerLeadInput {
  const source = isRecord(value) ? value : {};
  const name = requiredText(source.name ?? source.customerName, "客户名称", 80);
  const contact = requiredText(source.contact ?? source.phone ?? source.wechat ?? source.qq, "联系方式", 80);
  const firstChannel = readLeadSource(source);
  const rawLevel = cleanText(source.level, 12);
  const level = normalizeCustomerLevel(rawLevel) as CustomerLevel;
  const isCoreCustomer = Boolean(source.isCoreCustomer) || level === "S级";
  const riskReason = cleanText(source.riskReason, 160) || undefined;
  if (level === "S级" && !isCoreCustomer) {
    throw new QuickCaptureValidationError("S级仅用于核心客户，请先标记为核心客户", "CRM_CUSTOMER_LEAD_CORE_REQUIRED");
  }
  if (level === "R级" && !riskReason) {
    throw new QuickCaptureValidationError("R级客户必须填写风险原因", "CRM_CUSTOMER_LEAD_RISK_REASON_REQUIRED");
  }
  const intent = crmIntentValues.includes(String(source.intent) as (typeof crmIntentValues)[number])
    ? String(source.intent) as CustomerLeadInput["intent"]
    : "中";
  const budget = numberValue(source.budget);
  const estimatedAmount = numberValue(source.estimatedAmount, budget);
  const dealProbability = numberValue(source.dealProbability, 30, 100);
  const nextFollowTime = normalizeDateTime(source.nextFollowTime ?? source.nextFollowUpAt);
  const nextAction = cleanText(source.nextAction, 80) || undefined;
  const contactMethod = crmContactMethodValues.includes(String(source.contactMethod) as (typeof crmContactMethodValues)[number])
    ? String(source.contactMethod) as CrmFollowUpRecord["contactMethod"]
    : undefined;
  return {
    name,
    contact,
    phone: cleanText(source.phone, 32) || (/^1[3-9]\d{9}$/.test(contact) ? contact : undefined),
    wechat: cleanText(source.wechat, 48) || undefined,
    qq: cleanText(source.qq, 24) || undefined,
    city: cleanText(source.city, 32) || undefined,
    company: cleanText(source.company ?? source.companyName, 80) || undefined,
    source: firstChannel,
    firstChannel,
    type: (source.type as CustomerCard["type"]) || "个人买家客户",
    level,
    isCoreCustomer,
    riskReason,
    intent,
    budget,
    estimatedAmount,
    dealProbability,
    nextFollowTime,
    nextFollowUpAt: nextFollowTime,
    nextAction,
    contactMethod,
    remarks: cleanText(source.remarks ?? source.note, 200) || undefined,
    tags: normalizeTags(source.tags),
    fromCrm: true,
  };
}

function previewDraft(value: unknown) {
  const source = isRecord(value) ? value : {};
  const level = normalizeCustomerLevel(cleanText(source.level, 12)) as CustomerLeadLevel;
  const riskReason = cleanText(source.riskReason, 160) || undefined;
  const intent = crmIntentValues.includes(String(source.intent) as (typeof crmIntentValues)[number]) ? String(source.intent) as CustomerCard["intent"] : "中";
  const budget = numberValue(source.budget);
  const estimatedAmount = numberValue(source.estimatedAmount, budget);
  const dealProbability = numberValue(source.dealProbability, 30, 100);
  const action = CUSTOMER_LEAD_ACTIONS.includes(cleanText(source.nextAction, 24) as CustomerLeadAction)
    ? cleanText(source.nextAction, 24) as CustomerLeadAction
    : intent === "高" ? "电话沟通" : "微信联系";
  return { level, riskReason, intent, budget, estimatedAmount, dealProbability, action, nextFollowTime: normalizeDateTime(source.nextFollowTime ?? source.nextFollowUpAt) };
}

export function buildCustomerLeadPreview(value: unknown): CustomerLeadPreview {
  const draft = previewDraft(value);
  const calculatedSuggestedLevel = customerSuggestedLevel({ crmStatus: "线索", buyCount: 0, recycleCount: 0, totalAmount: 0, totalProfit: 0, aftersalesCount: 0, receivableBalance: 0, debtBalance: 0, riskReason: draft.riskReason });
  const suggestedLevel = (draft.level === "S级" || Boolean((value as Record<string, unknown> | null)?.isCoreCustomer))
    ? "S级"
    : CUSTOMER_LEAD_LEVELS.includes(calculatedSuggestedLevel as CustomerLeadLevel)
      ? calculatedSuggestedLevel as CustomerLeadLevel
      : "C级";
  const probabilityBase = draft.intent === "高" ? 60 : draft.intent === "低" ? 20 : 40;
  const conversionProbability = Math.min(95, Math.max(5, Math.round((probabilityBase + (draft.budget > 0 ? 5 : 0) + (draft.nextFollowTime ? 5 : 0) + (draft.dealProbability - 30) * 0.2))));
  const expectedAmount = draft.estimatedAmount || Math.round(draft.budget * conversionProbability / 100);
  const warnings: string[] = [];
  if (!cleanText((value as Record<string, unknown> | null)?.name, 80)) warnings.push("补充客户名称后才能保存");
  if (!cleanText((value as Record<string, unknown> | null)?.contact, 80)) warnings.push("补充联系方式，便于建立可追溯的客户档案");
  if (suggestedLevel === "R级" && !draft.riskReason) warnings.push("R级客户需要填写风险原因");
  if (!draft.nextFollowTime) warnings.push("建议设置下一次跟进时间，避免线索沉睡");
  const suggestedLevelReason = suggestedLevel === "S级" ? "核心客户，等级固定为 S 级" : suggestedLevel === "R级" ? "存在风险信息，建议先完成风险核验" : "新线索暂无历史交易，按当前等级规则建议 C 级";
  return {
    suggestedLevel,
    suggestedLevelReason,
    conversionProbability,
    estimatedAmount: expectedAmount,
    expectedCycle: conversionProbability >= 60 ? "7–15 天" : conversionProbability >= 40 ? "15–30 天" : "30 天以上",
    recommendedAction: draft.action,
    recommendedTime: draft.nextFollowTime ? draft.nextFollowTime.replace(" ", " ") : "建议今天 10:00–11:00",
    actions: [
      { label: "已填写联系方式", done: Boolean(cleanText((value as Record<string, unknown> | null)?.contact, 80)) },
      { label: "已设置预算或预计金额", done: draft.budget > 0 || draft.estimatedAmount > 0 },
      { label: "已安排下一次跟进", done: Boolean(draft.nextFollowTime) },
    ],
    warnings,
    source: "rules",
  };
}
