import type {FinanceTransferListResponseDto, FinanceTransferMutationResponseDto, FinanceTransferRequestDto} from "../dto/finance-transfer.dto";
import type {FinanceTransferCollection, FinanceTransferFilters, FinanceTransferFormValues, FinanceTransferItem} from "@/src/types/finance-transfer";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : value === undefined || value === null ? fallback : String(value);
}

function optionalText(value: unknown) {
  const normalized = text(value).trim();
  return normalized || undefined;
}

function amount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function adaptFinanceTransfer(value: unknown): FinanceTransferItem {
  const dto = record(value);
  const transferAmount = Math.max(0, amount(dto.amount));
  const fee = Math.max(0, amount(dto.fee));
  return {
    id: text(dto.id),
    fromAccountId: text(dto.fromAccountId),
    fromAccountName: text(dto.fromAccountName, "未记录账户"),
    toAccountId: text(dto.toAccountId),
    toAccountName: text(dto.toAccountName, "未记录账户"),
    amount: transferAmount,
    fee,
    receivedAmount: Math.max(0, amount(dto.receivedAmount ?? transferAmount - fee)),
    handler: text(dto.handler, "未记录"),
    time: text(dto.time),
    remarks: optionalText(dto.remarks),
  };
}

export function adaptFinanceTransferSnapshot(response: FinanceTransferListResponseDto): FinanceTransferItem[] {
  const state = record(response.data);
  const rows = Array.isArray(state.accountTransfers) ? state.accountTransfers : [];
  return rows.map(adaptFinanceTransfer).filter((item) => Boolean(item.id)).sort((a, b) => b.time.localeCompare(a.time) || b.id.localeCompare(a.id));
}

export function filterFinanceTransferCollection(snapshot: FinanceTransferItem[], filters: FinanceTransferFilters): FinanceTransferCollection {
  const keyword = filters.keyword.trim().toLowerCase();
  const filtered = snapshot.filter((item) => {
    const date = item.time.slice(0, 10);
    const haystack = [item.id, item.fromAccountName, item.toAccountName, item.handler, item.remarks].filter(Boolean).join(" ").toLowerCase();
    const accountMatch = filters.accountId === "all" || item.fromAccountId === filters.accountId || item.toAccountId === filters.accountId;
    return (!keyword || haystack.includes(keyword)) && accountMatch && (!filters.handler || item.handler === filters.handler) && (!filters.startDate || date >= filters.startDate) && (!filters.endDate || date <= filters.endDate);
  });
  const start = (filters.page - 1) * filters.pageSize;
  return {
    items: filtered.slice(start, start + filters.pageSize),
    total: filtered.length,
    totalAmount: filtered.reduce((sum, item) => sum + item.amount, 0),
    totalFee: filtered.reduce((sum, item) => sum + item.fee, 0),
    totalReceived: filtered.reduce((sum, item) => sum + item.receivedAmount, 0),
    page: filters.page,
    pageSize: filters.pageSize,
    source: "authorized-full-state",
  };
}

export function adaptFinanceTransferCollection(response: FinanceTransferListResponseDto, filters: FinanceTransferFilters) {
  const meta = record(response.meta);
  const items = adaptFinanceTransferSnapshot(response);
  if (text(meta.source) !== "database-page") return filterFinanceTransferCollection(items, filters);
  return {
    items,
    total: Math.max(items.length, Math.floor(amount(meta.total))),
    totalAmount: amount(meta.totalAmount),
    totalFee: amount(meta.totalFee),
    totalReceived: amount(meta.totalReceived),
    page: Math.max(1, Math.floor(amount(meta.page) || filters.page)),
    pageSize: Math.max(1, Math.floor(amount(meta.pageSize) || filters.pageSize)),
    source: "database-page" as const,
  };
}

export function toFinanceTransferRequest(values: FinanceTransferFormValues, handler: string): FinanceTransferRequestDto {
  const amountValue = Number(values.amount);
  const feeValue = Number(values.fee || 0);
  const request: FinanceTransferRequestDto = {
    fromAccountId: values.fromAccountId,
    toAccountId: values.toAccountId,
    amount: amountValue,
    fee: feeValue,
    receivedAmount: Math.max(0, amountValue - feeValue),
    handler,
    time: `${values.date} 12:00:00`,
  };
  const remarks = values.remarks.trim();
  return remarks ? {...request, remarks} : request;
}

export function adaptFinanceTransferMutation(response: FinanceTransferMutationResponseDto) {
  if (!response.data) throw new Error("资金调拨接口未返回调拨记录");
  return adaptFinanceTransfer(response.data);
}
