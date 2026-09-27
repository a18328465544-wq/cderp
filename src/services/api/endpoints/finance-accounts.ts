import {adaptFinanceAccountLedgerPage, adaptFinanceAccountMutation, adaptFinanceAccountPage, mergeFinanceAccountPages, toFinanceAccountCreateRequest, toFinanceAccountReconcileRequest} from "../adapters/finance-account.adapter";
import {apiRequest} from "../client";
import type {FinanceAccountLedgerResponseDto, FinanceAccountListResponseDto, FinanceAccountMutationResponseDto} from "../dto/finance-account.dto";
import type {FinanceAccountCreateValues, FinanceAccountReconcileValues} from "@/src/types/finance-account";

const accountPageSize = 200;

async function readAccountPage(page: number, signal?: AbortSignal) {
  const response = await apiRequest<FinanceAccountListResponseDto>(`/api/gpu_erp/finance/settlement-accounts?page=${page}&pageSize=${accountPageSize}`, {signal});
  return adaptFinanceAccountPage(response);
}

export const financeAccountsApi = {
  async listAll(signal?: AbortSignal) {
    const first = await readAccountPage(1, signal);
    const pageCount = Math.ceil(first.total / accountPageSize);
    if (pageCount <= 1) return first;
    const rest = await Promise.all(Array.from({length: pageCount - 1}, (_, index) => readAccountPage(index + 2, signal)));
    return mergeFinanceAccountPages([first, ...rest]);
  },

  async ledger(accountId: string, page = 1, pageSize = 20, signal?: AbortSignal) {
    const params = new URLSearchParams({accountId, page: String(page), pageSize: String(pageSize)});
    const response = await apiRequest<FinanceAccountLedgerResponseDto>(`/api/gpu_erp/finance/settlement-ledger?${params.toString()}`, {signal});
    return adaptFinanceAccountLedgerPage(response);
  },

  async create(values: FinanceAccountCreateValues, signal?: AbortSignal) {
    const response = await apiRequest<FinanceAccountMutationResponseDto>("/api/gpu_erp/finance/settlement-account/create", {method: "POST", body: JSON.stringify(toFinanceAccountCreateRequest(values)), signal});
    return adaptFinanceAccountMutation(response);
  },

  async reconcile(id: string, values: FinanceAccountReconcileValues, signal?: AbortSignal) {
    const response = await apiRequest<FinanceAccountMutationResponseDto>(`/api/gpu_erp/finance/settlement-account/${encodeURIComponent(id)}/reconcile`, {method: "PATCH", body: JSON.stringify(toFinanceAccountReconcileRequest(values)), signal});
    return adaptFinanceAccountMutation(response);
  },

  async remove(id: string, signal?: AbortSignal) {
    const response = await apiRequest<FinanceAccountMutationResponseDto>(`/api/gpu_erp/finance/settlement-account/${encodeURIComponent(id)}`, {method: "DELETE", signal});
    return adaptFinanceAccountMutation(response);
  },
};
