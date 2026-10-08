import {adaptFinanceDashboardDataset} from "../adapters/finance.adapter";
import {apiRequest} from "../client";
import type {FinanceDashboardResponseDto} from "../dto/finance.dto";
import type {FinanceDashboardAccess} from "@/src/types/finance";
import type {FinanceDateRange} from "@/src/types/finance";
import {adaptFinanceProfitFlows} from "../adapters/finance-profit.adapter";
import type {FinanceProfitFlowsResponseDto} from "../dto/finance-profit.dto";
import type {FinanceProfitFilters, FinanceProfitReport} from "@/src/types/finance-profit-report";

export const financeApi = {
  async profitReport(filters: FinanceProfitFilters, signal?: AbortSignal, exportAll = false) {
    const params = new URLSearchParams({...Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])), exportAll: String(exportAll)});
    const response = await apiRequest<{data: FinanceProfitReport}>(`/api/finance/profit-report?${params}`, {signal});
    return response.data;
  },
  async dashboard(access: FinanceDashboardAccess, range: FinanceDateRange, signal?: AbortSignal) {const params = new URLSearchParams({startDate: range.startDate, endDate: range.endDate}); return adaptFinanceDashboardDataset(await apiRequest<FinanceDashboardResponseDto>(`/api/finance/dashboard?${params.toString()}`, {signal}), access);},
  async profitFlows(range: FinanceDateRange, signal?: AbortSignal) {
    const params = new URLSearchParams();
    if (range.startDate) params.set("dateStart", range.startDate);
    if (range.endDate) params.set("dateEnd", range.endDate);
    const query = params.toString();
    return adaptFinanceProfitFlows(await apiRequest<FinanceProfitFlowsResponseDto>(`/api/gpu_erp/finance/profit-flows${query ? `?${query}` : ""}`, {signal}));
  },
};
