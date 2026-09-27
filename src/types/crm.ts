export const crmBusinessStatusValues = ["线索", "跟进中", "已成交", "沉睡", "流失"] as const;
export const crmCustomerStageValues = ["新线索", "需求确认", "报价中", "已成交", "售后维护"] as const;
export const crmLeadStageValues = ["新线索", "需求确认", "报价中", "已成交", "已关闭"] as const;
export const crmRequirementStageValues = ["需求确认", "报价中", "已成交", "已关闭"] as const;
export const crmQuoteStatusValues = ["草稿", "已发送", "客户已确认", "已拒绝", "已过期"] as const;

export type CrmBusinessStatusValue = (typeof crmBusinessStatusValues)[number];
/** Preserve custom legacy status values while giving new code a closed list. */
export type CrmBusinessStatus = CrmBusinessStatusValue | string;
export type CrmCustomerStage = (typeof crmCustomerStageValues)[number];
export type CrmLeadStage = (typeof crmLeadStageValues)[number];
export type CrmRequirementStage = (typeof crmRequirementStageValues)[number];
export type CrmQuoteStatus = (typeof crmQuoteStatusValues)[number];
export type CrmIntent = "低" | "中" | "高" | string;

export interface CrmAccount {
  id: string;
  legacyCustomerId?: string;
  accountType: "individual" | "company";
  displayName: string;
  businessStatus: CrmBusinessStatus;
  normalizedStatus: string;
  stage?: string;
  level?: string;
  isCoreCustomer: boolean;
  owner?: string;
  intent?: CrmIntent;
  source?: string;
  phone?: string;
  wechat?: string;
  qq?: string;
  city?: string;
  companyName?: string;
  roles: string[];
  contactCount: number;
  lastContactAt?: string;
  nextFollowAt?: string;
  nextAction?: string;
  dealProbability?: number;
  estimatedAmount?: number;
  remarks?: string;
  tags: string[];
  updatedAt: string;
}

export interface CrmAccountFilters {
  keyword: string;
  owner: string;
  page: number;
  pageSize: number;
}

export interface CrmAccountPage {
  items: CrmAccount[];
  page: number;
  pageSize: number;
  total: number;
}

export interface CrmTimelineEvent {
  id: string;
  eventType: string;
  sourceType: string;
  sourceId: string;
  summary: string;
  actorId?: string;
  occurredAt: string;
}

export interface CrmTimelinePage {
  items: CrmTimelineEvent[];
  page: number;
  pageSize: number;
  total: number;
}

export interface CrmOwnerSummary {
  owner: string;
  customers: number;
  followUps: number;
  requirements: number;
  highIntent: number;
}

export interface CrmSummary {
  totals: {
    customers: number;
    leads: number;
    following: number;
    deals: number;
    highIntent: number;
    pendingFollowUps: number;
    requirements: number;
  };
  owners: CrmOwnerSummary[];
}

export const crmFollowUpResultValues = ["继续跟进", "已报价", "已成交", "暂缓", "无效线索", "售后维护"] as const;
export const crmContactMethodValues = ["电话", "微信", "闲鱼", "淘宝", "到店", "其他"] as const;
export const crmIntentValues = ["低", "中", "高"] as const;

export type CrmFollowUpResult = (typeof crmFollowUpResultValues)[number];
export type CrmContactMethod = (typeof crmContactMethodValues)[number];

export interface CrmFollowUpFormValues {
  customerId: string;
  contactMethod: CrmContactMethod;
  content: string;
  result: CrmFollowUpResult;
  nextFollowTime: string;
  nextAction: string;
  dealProbability: number;
  estimatedAmount: number;
  remarks: string;
}

export type QuickCaptureSourceType = "manual" | "chat" | "voice";
export const quickCaptureSourceTypeValues = ["manual", "chat", "voice"] as const;
export const crmLeadPriorityValues = crmIntentValues;
export const quickCaptureIntentValues = ["求购", "出售", "回收", "置换", "其他"] as const;
export const quickCaptureTransactionValues = ["销售", "回收", "采购", "置换", "其他"] as const;
export const quickCaptureDeliveryMethodValues = ["到店", "快递", "同城配送", "未知"] as const;

export type CrmLeadPriority = (typeof crmLeadPriorityValues)[number];
export type QuickCaptureIntentType = (typeof quickCaptureIntentValues)[number];
export type QuickCaptureTransactionType = (typeof quickCaptureTransactionValues)[number];
export type QuickCaptureDeliveryMethod = (typeof quickCaptureDeliveryMethodValues)[number];

export interface QuickCaptureConflict {
  field: string;
  values: string[];
  message: string;
}

export interface QuickCaptureFields {
  customerName?: string;
  phone?: string;
  wechat?: string;
  qq?: string;
  city?: string;
  company?: string;
  source?: string;
  intentType?: QuickCaptureIntentType;
  productCategory?: ProductCategory;
  productName?: string;
  productModel?: string;
  productId?: string;
  quantity?: number;
  expectedPrice?: number;
  quotedPrice?: number;
  transactionType?: QuickCaptureTransactionType;
  deliveryMethod?: QuickCaptureDeliveryMethod;
  followUpTime?: string;
  priority?: CrmLeadPriority;
  stage?: CrmLeadStage;
  tags: string[];
  note?: string;
}

export interface ProductMatchCandidate {
  productId: string;
  productName: string;
  model?: string;
  brand?: string;
  category?: ProductCategory;
  score: number;
  reasons: string[];
}

export interface CustomerMatchCandidate {
  customerId: string;
  name: string;
  contact?: string;
  wechat?: string;
  source?: string;
  level?: CustomerLevel;
  owner?: string;
  score: number;
  reasons: string[];
}

export interface QuickCaptureParseResult {
  parseId: string;
  rawText: string;
  sourceType: QuickCaptureSourceType;
  fields: QuickCaptureFields;
  confidence: number;
  missingFields: string[];
  conflicts: QuickCaptureConflict[];
  customerCandidates: CustomerMatchCandidate[];
  productCandidates: ProductMatchCandidate[];
  source: "ai" | "rules";
  model?: string;
  parsedAt: string;
}

export interface QuickCaptureConfirmInput {
  parseId: string;
  rawText: string;
  sourceType?: QuickCaptureSourceType;
  fields: QuickCaptureFields;
  confidence?: number;
  missingFields?: string[];
  conflicts?: QuickCaptureConflict[];
  matchAction: "link_existing" | "create_new";
  matchedCustomerId?: string;
  idempotencyKey?: string;
}
import type {CustomerLevel} from "./customer";
import type {ProductCategory} from "./core";
