import {apiRequest} from "../client";
import {adaptFinanceTransferCollection, adaptFinanceTransferMutation, toFinanceTransferRequest} from "../adapters/finance-transfer.adapter";
import type {FinanceTransferListResponseDto, FinanceTransferMutationResponseDto} from "../dto/finance-transfer.dto";
import type {FinanceTransferFilters, FinanceTransferFormValues} from "@/src/types/finance-transfer";

type FinanceMutationOptions = {signal?: AbortSignal; idempotencyKey?: string};

export const financeTransfersApi = {
  async list(filters: FinanceTransferFilters, signal?: AbortSignal) {
    const params = new URLSearchParams({page: String(filters.page), pageSize: String(filters.pageSize), accountId: filters.accountId});
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.handler.trim()) params.set("handler", filters.handler.trim());
    if (filters.startDate) params.set("startDate", filters.startDate);
    if (filters.endDate) params.set("endDate", filters.endDate);
    if (filters.sortKey) {params.set("sortKey", filters.sortKey); params.set("sortDirection", filters.sortDirection || "desc");}
    const response = await apiRequest<FinanceTransferListResponseDto>(`/api/gpu_erp/finance/account-transfers?${params.toString()}`, {signal});
    return adaptFinanceTransferCollection(response, filters);
  },
  async create(values: FinanceTransferFormValues, handler: string, options: FinanceMutationOptions = {}) {
    const response = await apiRequest<FinanceTransferMutationResponseDto>("/api/gpu_erp/finance/account-transfer/create", {method: "POST", body: JSON.stringify(toFinanceTransferRequest(values, handler)), signal: options.signal, headers: options.idempotencyKey ? {"Idempotency-Key": options.idempotencyKey} : undefined});
    return adaptFinanceTransferMutation(response);
  },
  async update(id: string, values: FinanceTransferFormValues, handler: string, options: FinanceMutationOptions = {}) {
    const response = await apiRequest<FinanceTransferMutationResponseDto>(`/api/gpu_erp/finance/account-transfer/${encodeURIComponent(id)}`, {method: "PUT", body: JSON.stringify(toFinanceTransferRequest(values, handler)), signal: options.signal, headers: options.idempotencyKey ? {"Idempotency-Key": options.idempotencyKey} : undefined});
    return adaptFinanceTransferMutation(response);
  },
  async remove(id: string, signal?: AbortSignal) {
    const response = await apiRequest<FinanceTransferMutationResponseDto>(`/api/gpu_erp/finance/account-transfer/${encodeURIComponent(id)}`, {method: "DELETE", signal});
    return adaptFinanceTransferMutation(response);
  },
  async reverse(id: string, signal?: AbortSignal) {
    const response = await apiRequest<FinanceTransferMutationResponseDto>(`/api/gpu_erp/finance/account-transfer/${encodeURIComponent(id)}/reverse`, {method: "POST", signal});
    return adaptFinanceTransferMutation(response);
  },
};
