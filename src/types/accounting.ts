export const accountingDocumentStatusValues = ["草稿", "已提交", "已入账", "作废"] as const;
export type AccountingDocumentStatus = (typeof accountingDocumentStatusValues)[number];

const accountingDocumentTransitions: Record<AccountingDocumentStatus, readonly AccountingDocumentStatus[]> = {
  草稿: ["草稿", "已提交", "作废"],
  已提交: ["已提交", "已入账", "作废"],
  已入账: ["已入账", "作废"],
  作废: ["作废"],
};

export function canTransitionAccountingDocument(from: AccountingDocumentStatus, to: AccountingDocumentStatus) {
  return accountingDocumentTransitions[from].includes(to);
}

/** Legacy records were created before the unified state existed and are already posted. */
export function normalizeAccountingDocumentStatus(value: unknown, fallback: AccountingDocumentStatus = "已入账"): AccountingDocumentStatus {
  return accountingDocumentStatusValues.includes(value as AccountingDocumentStatus)
    ? value as AccountingDocumentStatus
    : fallback;
}

export const accountingEventStatusValues = accountingDocumentStatusValues;
export type AccountingEventStatus = AccountingDocumentStatus;

export const accountingEventTypeValues = [
  "销售单",
  "采购单",
  "退货单",
  "收款单",
  "付款单",
  "资金调拨",
  "财务流水",
  "账户流水",
  "员工提成",
  "售后单",
  "冲销单",
] as const;
export type AccountingEventType = (typeof accountingEventTypeValues)[number];

export type AccountingEventLineDirection = "income" | "expense" | "memo";

export type AccountingEventLine = {
  id: string;
  eventId: string;
  lineKey: string;
  lineType: string;
  direction: AccountingEventLineDirection;
  amount: number;
  description?: string;
  sourceType: string;
  sourceId: string;
};

export type AccountingEventLink = {
  eventId: string;
  sourceType: string;
  sourceId: string;
  sourceNo?: string;
  role: "source" | "related" | "reversal";
};

/**
 * Normalized, append-only accounting projection. Business collections remain
 * the write model for now, while this projection gives finance a stable event
 * and reversal boundary for audit, snapshots and future posting engines.
 */
export type AccountingEvent = {
  id: string;
  tenantId: string;
  storeId: string;
  eventType: AccountingEventType;
  status: AccountingEventStatus;
  effectiveDate: string;
  totalAmount: number;
  currency: string;
  reversalOfEventId?: string;
  actor?: string;
  sourceType: string;
  sourceId: string;
  sourceNo?: string;
  payload?: Record<string, unknown>;
  lines?: AccountingEventLine[];
  links?: AccountingEventLink[];
  createdAt: string;
  updatedAt: string;
};

export type AccountingReversalDocument = {
  id: string;
  tenantId: string;
  storeId: string;
  originalEventId: string;
  reversalEventId: string;
  sourceType: string;
  sourceId: string;
  status: "已提交" | "已入账" | "作废";
  reason?: string;
  actor: string;
  createdAt: string;
};

export type FinanceIntegrityAlertStatus = "open" | "resolved";

export type FinanceIntegrityAlert = {
  fingerprint: string;
  code: string;
  severity: "error" | "warning";
  status: FinanceIntegrityAlertStatus;
  domain: string;
  entityId?: string;
  sourceEventId?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  message: string;
  payload?: Record<string, unknown>;
};
