import {adaptFinanceAccountLedgerPage} from "../adapters/finance-account.adapter";
import {apiRequest} from "../client";
import type {FinanceAccountLedgerResponseDto} from "../dto/finance-account.dto";
import type {FinanceLedgerFilters} from "@/src/types/finance-ledger";

export function toFinanceLedgerQueryParams(filters: FinanceLedgerFilters) {
  const params = new URLSearchParams({page: String(filters.page), pageSize: String(filters.pageSize)});
  if (filters.keyword) params.set("keyword", filters.keyword);
  if (filters.accountId !== "all") params.set("accountId", filters.accountId);
  if (filters.handler) params.set("handler", filters.handler);
  if (filters.businessType !== "all") params.set("businessType", filters.businessType);
  if (filters.direction !== "all") params.set("direction", filters.direction);
  if (filters.relatedDocNo) params.set("relatedDocNo", filters.relatedDocNo);
  if (filters.customerName) params.set("customerName", filters.customerName);
  if (filters.supplierName) params.set("supplierName", filters.supplierName);
  if (filters.dateStart) params.set("dateStart", filters.dateStart);
  if (filters.dateEnd) params.set("dateEnd", filters.dateEnd);
  return params;
}

export const financeLedgerApi = {
  async list(filters: FinanceLedgerFilters, signal?: AbortSignal) {
    const response = await apiRequest<FinanceAccountLedgerResponseDto>(`/api/gpu_erp/finance/settlement-ledger?${toFinanceLedgerQueryParams(filters).toString()}`, {signal});
    return adaptFinanceAccountLedgerPage(response);
  },
};
