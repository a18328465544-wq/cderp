import type {FinanceIncomeListResponseDto, FinanceIncomeMutationResponseDto, FinanceIncomeRequestDto} from "../dto/finance-income.dto";
import type {FinanceIncomeCollection, FinanceIncomeFilters, FinanceIncomeFormValues, FinanceIncomeItem} from "@/src/types/finance-income";
import {normalizeAccountingDocumentStatus} from "@/src/types/accounting";

function record(value: unknown): Record<string, unknown> {return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};}
function text(value: unknown, fallback = "") {return typeof value === "string" ? value : value === undefined || value === null ? fallback : String(value);}
function optionalText(value: unknown) {const result = text(value).trim(); return result || undefined;}
function amount(value: unknown) {const result = Number(value); return Number.isFinite(result) ? result : 0;}
function stringArray(value: unknown) {return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];}

export function isNonOperatingIncomeDto(value: unknown) {
  const dto = record(value);
  const relatedDocType = text(dto.relatedDocType);
  const relatedDocNo = text(dto.relatedDocNo);
  return relatedDocType !== "销售单" && relatedDocType !== "采购单" && relatedDocType !== "退货单" &&
    !["XS", "JH", "TH"].some((prefix) => relatedDocNo.startsWith(prefix)) &&
    text(dto.businessType) !== "销售收款" && text(dto.businessType) !== "采购退款";
}

export function adaptFinanceIncome(value: unknown): FinanceIncomeItem {
  const dto = record(value);
  const relatedDocNo = optionalText(dto.relatedDocNo);
  const businessType = text(dto.businessType, "其他收入");
  const accountingStatus = normalizeAccountingDocumentStatus(dto.accountingStatus);
  const editable = accountingStatus !== "作废" && !relatedDocNo && businessType !== "采购退款";
  return {
    id: text(dto.id), accountingStatus, source: text(dto.customerName || dto.supplierName, "未记录来源"), accountId: text(dto.accountId), accountName: text(dto.accountName, "未记录账户"), amount: amount(dto.amount), handler: text(dto.handler, "未记录"), paymentMethod: text(dto.paymentMethod, "其他"), businessType, referenceNo: optionalText(dto.referenceNo), time: text(dto.time), images: stringArray(dto.images), remarks: optionalText(dto.remarks), editable, deletable: editable,
    ...(!editable ? {restrictionReason: accountingStatus === "作废" ? "已作废记录仅保留审计，不可继续编辑或冲销" : relatedDocNo ? "关联业务单据的收入必须从原业务流程调整" : "采购退款必须从采购退货流程调整"} : {}),
  };
}

export function adaptFinanceIncomeSnapshot(response: FinanceIncomeListResponseDto): FinanceIncomeItem[] {
  const state = record(response.data);
  const raw = Array.isArray(state.paymentInRecords) ? state.paymentInRecords : [];
  return raw.filter(isNonOperatingIncomeDto).map(adaptFinanceIncome).filter((item) => Boolean(item.id) && item.accountingStatus !== "作废").sort((a, b) => b.time.localeCompare(a.time));
}

export function filterFinanceIncomeCollection(snapshot: FinanceIncomeItem[], filters: FinanceIncomeFilters): FinanceIncomeCollection {
  const keyword = filters.keyword.trim().toLowerCase();
  const items = snapshot.filter((item) => {
    const date = item.time.slice(0, 10);
    const haystack = [item.id, item.source, item.businessType, item.referenceNo, item.accountName, item.handler, item.remarks].filter(Boolean).join(" ").toLowerCase();
    return (!keyword || haystack.includes(keyword)) && (filters.businessType === "all" || item.businessType === filters.businessType) && (filters.accountId === "all" || item.accountId === filters.accountId) && (!filters.handler || item.handler === filters.handler) && (!filters.startDate || date >= filters.startDate) && (!filters.endDate || date <= filters.endDate);
  });
  const start = (filters.page - 1) * filters.pageSize;
  return {items: items.slice(start, start + filters.pageSize), total: items.length, totalAmount: items.reduce((sum, item) => sum + item.amount, 0), page: filters.page, pageSize: filters.pageSize, source: "authorized-full-state"};
}

export function adaptFinanceIncomeCollection(response: FinanceIncomeListResponseDto, filters: FinanceIncomeFilters): FinanceIncomeCollection {
  if (!Array.isArray(response.data)) return filterFinanceIncomeCollection(adaptFinanceIncomeSnapshot(response), filters);
  const meta = record(response.meta);
  // Keep this guard even when the API is paged. It protects the non-operating
  // income screen from stale/older servers that may still return business
  // refund rows in a page.
  const items = response.data.filter(isNonOperatingIncomeDto).map(adaptFinanceIncome).filter((item) => Boolean(item.id) && item.accountingStatus !== "作废");
  return {items, total: Math.max(items.length, amount(meta.total)), totalAmount: amount(meta.totalAmount), page: Math.max(1, amount(meta.page) || filters.page), pageSize: Math.max(1, amount(meta.pageSize) || filters.pageSize), source: "database-page"};
}

export function toFinanceIncomeRequest(values: FinanceIncomeFormValues, handler: string): FinanceIncomeRequestDto {
  const dateTime = `${values.date} 12:00:00`;
  return {customerName: values.source.trim(), accountId: values.accountId, amount: Number(values.amount), handler, paymentMethod: values.paymentMethod, businessType: values.businessType, ...(values.referenceNo.trim() ? {referenceNo: values.referenceNo.trim()} : {}), time: dateTime, images: values.images.filter((url) => url.startsWith("/api/media/assets/")), ...(values.remarks.trim() ? {remarks: values.remarks.trim()} : {})};
}

export function adaptFinanceIncomeMutation(response: FinanceIncomeMutationResponseDto) {
  if (!response.data) throw new Error("收入登记接口未返回记录数据");
  return adaptFinanceIncome(response.data);
}
