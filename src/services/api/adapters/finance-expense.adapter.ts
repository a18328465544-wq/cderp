import type {FinanceExpenseListResponseDto, FinanceExpenseMutationResponseDto, FinanceExpenseRequestDto} from "../dto/finance-expense.dto";
import {financeExpenseCategories, type FinanceExpenseCollection, type FinanceExpenseFilters, type FinanceExpenseFormValues, type FinanceExpenseItem} from "@/src/types/finance-expense";
import {normalizeAccountingDocumentStatus} from "@/src/types/accounting";
function record(value: unknown): Record<string, unknown> {return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};}
function text(value: unknown, fallback = "") {return typeof value === "string" ? value : value === undefined || value === null ? fallback : String(value);}
function optionalText(value: unknown) {const result = text(value).trim(); return result || undefined;}
function numberValue(value: unknown) {const result = Number(value); return Number.isFinite(result) ? result : 0;}
function stringArray(value: unknown) {return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];}

export function isNonOperatingExpenseDto(value: unknown) {
  const dto = record(value); const type = text(dto.businessType); const relatedDocType = text(dto.relatedDocType); const relatedDocNo = text(dto.relatedDocNo);
  return relatedDocType !== "采购单" && !relatedDocNo.startsWith("JH") && type !== "采购付款" && type !== "回收付款";
}
export function adaptFinanceExpense(value: unknown): FinanceExpenseItem {
  const dto = record(value); const relatedDocNo = optionalText(dto.relatedDocNo); const businessType = text(dto.businessType, "其他支出"); const accountingStatus = normalizeAccountingDocumentStatus(dto.accountingStatus); const editable = accountingStatus !== "作废" && !relatedDocNo && financeExpenseCategories.includes(businessType as typeof financeExpenseCategories[number]);
  return {id: text(dto.id), accountingStatus, party: text(dto.supplierName || dto.customerName, "未记录对象"), accountId: text(dto.accountId), accountName: text(dto.accountName, "未记录账户"), amount: numberValue(dto.amount), handler: text(dto.handler, "未记录"), paymentMethod: text(dto.paymentMethod, "其他"), businessType, referenceNo: optionalText(dto.referenceNo), time: text(dto.time), images: stringArray(dto.images), remarks: optionalText(dto.remarks), editable, deletable: editable, ...(!editable ? {restrictionReason: accountingStatus === "作废" ? "已作废记录仅保留审计，不可继续编辑或冲销" : relatedDocNo ? "关联业务单据的支出必须从原业务流程调整" : "历史自动支出必须从对应退款、提成或业务流程调整"} : {})};
}
export function adaptFinanceExpenseSnapshot(response: FinanceExpenseListResponseDto): FinanceExpenseItem[] {const state = record(response.data); const raw = Array.isArray(state.paymentOutRecords) ? state.paymentOutRecords : []; return raw.filter(isNonOperatingExpenseDto).map(adaptFinanceExpense).filter((item) => Boolean(item.id) && item.accountingStatus !== "作废").sort((a, b) => b.time.localeCompare(a.time));}
export function filterFinanceExpenseCollection(snapshot: FinanceExpenseItem[], filters: FinanceExpenseFilters): FinanceExpenseCollection {
  const keyword = filters.keyword.trim().toLowerCase(); const items = snapshot.filter((item) => {const date = item.time.slice(0, 10); const haystack = [item.id, item.party, item.businessType, item.referenceNo, item.accountName, item.handler, item.remarks].filter(Boolean).join(" ").toLowerCase(); return (!keyword || haystack.includes(keyword)) && (filters.businessType === "all" || item.businessType === filters.businessType) && (filters.accountId === "all" || item.accountId === filters.accountId) && (!filters.handler || item.handler === filters.handler) && (!filters.startDate || date >= filters.startDate) && (!filters.endDate || date <= filters.endDate);});
  const start = (filters.page - 1) * filters.pageSize; return {items: items.slice(start, start + filters.pageSize), total: items.length, totalAmount: items.reduce((sum, item) => sum + item.amount, 0), page: filters.page, pageSize: filters.pageSize, source: "authorized-full-state"};
}
export function adaptFinanceExpenseCollection(response: FinanceExpenseListResponseDto, filters: FinanceExpenseFilters): FinanceExpenseCollection {
  if (!Array.isArray(response.data)) return filterFinanceExpenseCollection(adaptFinanceExpenseSnapshot(response), filters);
  const meta = record(response.meta); const items = response.data.map(adaptFinanceExpense).filter((item) => Boolean(item.id) && item.accountingStatus !== "作废");
  return {items, total: Math.max(items.length, numberValue(meta.total)), totalAmount: numberValue(meta.totalAmount), page: Math.max(1, numberValue(meta.page) || filters.page), pageSize: Math.max(1, numberValue(meta.pageSize) || filters.pageSize), source: "database-page"};
}
export function toFinanceExpenseRequest(values: FinanceExpenseFormValues, handler: string): FinanceExpenseRequestDto {return {supplierName: values.party.trim(), accountId: values.accountId, amount: Number(values.amount), handler, paymentMethod: values.paymentMethod, businessType: values.businessType, ...(values.referenceNo.trim() ? {referenceNo: values.referenceNo.trim()} : {}), time: `${values.date} 12:00:00`, images: values.images.filter((url) => url.startsWith("/api/media/assets/")), ...(values.remarks.trim() ? {remarks: values.remarks.trim()} : {})};}
export function adaptFinanceExpenseMutation(response: FinanceExpenseMutationResponseDto) {if (!response.data) throw new Error("支出登记接口未返回记录数据"); return adaptFinanceExpense(response.data);}
