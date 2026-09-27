import {adaptCrmAccountPage, adaptCrmSummary, adaptCrmTimelinePage, toCrmFollowUpRequest} from "../adapters/crm.adapter";
import {apiRequest} from "../client";
import type {CrmApiEnvelopeDto} from "../dto/crm.dto";
import type {QuickCaptureConfirmInput, QuickCaptureParseResult, QuickCaptureSourceType} from "@/src/types/crm";
import type {CrmAccountFilters, CrmFollowUpFormValues} from "@/src/types/crm";

export function toCrmAccountQueryParams(filters: CrmAccountFilters) {
  const params = new URLSearchParams({page: String(filters.page), pageSize: String(filters.pageSize), role: "customer"});
  if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
  if (filters.owner.trim()) params.set("ownerId", filters.owner.trim());
  return params;
}

export function toCrmSummaryQueryParams(filters: Pick<CrmAccountFilters, "keyword" | "owner">) {
  const params = new URLSearchParams();
  if (filters.keyword.trim()) params.set("customerName", filters.keyword.trim());
  if (filters.owner.trim()) params.set("owner", filters.owner.trim());
  return params;
}

export const crmApi = {
  async accounts(filters: CrmAccountFilters, signal?: AbortSignal) {
    const params = toCrmAccountQueryParams(filters);
    return adaptCrmAccountPage(await apiRequest<CrmApiEnvelopeDto>(`/api/gpu_erp/crm/accounts?${params.toString()}`, {signal}));
  },
  async timeline(accountId: string, signal?: AbortSignal) {
    return adaptCrmTimelinePage(await apiRequest<CrmApiEnvelopeDto>(`/api/gpu_erp/crm/accounts/${encodeURIComponent(accountId)}/timeline?page=1&pageSize=50`, {signal}));
  },
  async summary(filters: Pick<CrmAccountFilters, "keyword" | "owner">, signal?: AbortSignal) {
    const params = toCrmSummaryQueryParams(filters);
    return adaptCrmSummary(await apiRequest<CrmApiEnvelopeDto>(`/api/gpu_erp/crm/summary${params.size ? `?${params.toString()}` : ""}`, {signal}));
  },
  async createFollowUp(values: CrmFollowUpFormValues, signal?: AbortSignal) {
    return apiRequest<CrmApiEnvelopeDto>("/api/gpu_erp/crm/follow-up/create", {method: "POST", body: JSON.stringify(toCrmFollowUpRequest(values)), signal});
  },
  async parseQuickCapture(rawText: string, sourceType: QuickCaptureSourceType, signal?: AbortSignal) {
    const response = await apiRequest<{data?: QuickCaptureParseResult}>("/api/gpu_erp/crm/quick-capture/parse", {method: "POST", body: JSON.stringify({rawText, sourceType}), signal});
    if (!response.data) throw new Error("CRM 解析接口未返回结果");
    return response.data;
  },
  async confirmQuickCapture(input: QuickCaptureConfirmInput, signal?: AbortSignal) {
    return apiRequest<{data?: unknown; state?: unknown}>("/api/gpu_erp/crm/quick-capture/confirm", {method: "POST", body: JSON.stringify(input), signal});
  },
};
