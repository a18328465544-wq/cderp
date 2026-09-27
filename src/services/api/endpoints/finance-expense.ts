import {apiRequest} from "../client";
import {adaptFinanceExpenseCollection, adaptFinanceExpenseMutation, toFinanceExpenseRequest} from "../adapters/finance-expense.adapter";
import type {FinanceExpenseListResponseDto, FinanceExpenseMutationResponseDto} from "../dto/finance-expense.dto";
import type {FinanceExpenseFilters, FinanceExpenseFormValues} from "@/src/types/finance-expense";
type FinanceMutationOptions = {signal?: AbortSignal; idempotencyKey?: string};
export const financeExpenseApi = {
  async list(filters: FinanceExpenseFilters, signal?: AbortSignal) {
    const params = new URLSearchParams({page: String(filters.page), pageSize: String(filters.pageSize)});
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim()); if (filters.businessType !== "all") params.set("businessType", filters.businessType); if (filters.accountId !== "all") params.set("accountId", filters.accountId); if (filters.handler) params.set("handler", filters.handler); if (filters.startDate) params.set("startDate", filters.startDate); if (filters.endDate) params.set("endDate", filters.endDate); if (filters.sortKey) {params.set("sortKey", filters.sortKey); params.set("sortDirection", filters.sortDirection || "desc");}
    return adaptFinanceExpenseCollection(await apiRequest<FinanceExpenseListResponseDto>(`/api/gpu_erp/finance/payment-outs?${params.toString()}`, {signal}), filters);
  },
  async create(values: FinanceExpenseFormValues, handler: string, options: FinanceMutationOptions = {}) {return adaptFinanceExpenseMutation(await apiRequest<FinanceExpenseMutationResponseDto>("/api/gpu_erp/finance/payment-out/create", {method: "POST", body: JSON.stringify(toFinanceExpenseRequest(values, handler)), signal: options.signal, headers: options.idempotencyKey ? {"Idempotency-Key": options.idempotencyKey} : undefined}));},
  async update(id: string, values: FinanceExpenseFormValues, handler: string, options: FinanceMutationOptions = {}) {return adaptFinanceExpenseMutation(await apiRequest<FinanceExpenseMutationResponseDto>(`/api/gpu_erp/finance/payment-out/${encodeURIComponent(id)}`, {method: "PUT", body: JSON.stringify(toFinanceExpenseRequest(values, handler)), signal: options.signal, headers: options.idempotencyKey ? {"Idempotency-Key": options.idempotencyKey} : undefined}));},
  async remove(id: string, signal?: AbortSignal) {return adaptFinanceExpenseMutation(await apiRequest<FinanceExpenseMutationResponseDto>(`/api/gpu_erp/finance/payment-out/${encodeURIComponent(id)}`, {method: "DELETE", signal}));},
  async reverse(id: string, signal?: AbortSignal) {return adaptFinanceExpenseMutation(await apiRequest<FinanceExpenseMutationResponseDto>(`/api/gpu_erp/finance/payment-out/${encodeURIComponent(id)}/reverse`, {method: "POST", signal}));},
};
