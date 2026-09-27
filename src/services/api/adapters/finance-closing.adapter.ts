import type {FinanceDailyClosingResponseDto} from "../dto/finance-closing.dto";
import type {FinanceDailyClosing, FinanceDailyClosingCollection, FinanceDailyClosingRequest} from "@/src/types/finance-closing";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : value === null || value === undefined ? fallback : String(value);
}

function optionalText(value: unknown) {
  const normalized = text(value).trim();
  return normalized || undefined;
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateValue(value: unknown) {
  const normalized = text(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : normalized.slice(0, 10);
}

export function adaptFinanceDailyClosing(value: unknown): FinanceDailyClosing | null {
  const dto = record(value);
  const id = text(dto.id).trim();
  const date = dateValue(dto.date);
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const snapshot = record(dto.snapshot);
  return {
    id,
    date,
    closedAt: text(dto.closedAt, date),
    closedBy: text(dto.closedBy, "系统"),
    remarks: optionalText(dto.remarks),
    snapshot: {
      income: numberValue(snapshot.income),
      expense: numberValue(snapshot.expense),
      netCash: numberValue(snapshot.netCash),
      salesCount: Math.max(0, numberValue(snapshot.salesCount)),
      purchaseCount: Math.max(0, numberValue(snapshot.purchaseCount)),
      receivable: Math.max(0, numberValue(snapshot.receivable)),
      payable: Math.max(0, numberValue(snapshot.payable)),
      unreviewed: Math.max(0, numberValue(snapshot.unreviewed)),
      accountReconciliationDifferences: Math.max(0, numberValue(snapshot.accountReconciliationDifferences)),
    },
  };
}

export function adaptFinanceDailyClosings(response: FinanceDailyClosingResponseDto): FinanceDailyClosingCollection {
  const values = Array.isArray(response.data) ? response.data : [];
  const items = values.map(adaptFinanceDailyClosing).filter((value): value is FinanceDailyClosing => Boolean(value));
  return {items, source: "daily-closing-api"};
}

export function adaptFinanceDailyClosingMutation(response: FinanceDailyClosingResponseDto): FinanceDailyClosing {
  const closing = adaptFinanceDailyClosing(response.data);
  if (!closing) throw new Error("日结接口未返回有效快照");
  return closing;
}

export function toFinanceDailyClosingRequest(values: FinanceDailyClosingRequest): FinanceDailyClosingRequest {
  const date = values.date.trim();
  const remarks = values.remarks?.trim();
  return remarks ? {date, remarks} : {date};
}
