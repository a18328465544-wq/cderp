import {apiRequest} from "../client";
import {adaptCommissionPage, adaptCommissionRules, adaptCustomerFunds, adaptLogs, adaptUserMutation, adaptUsers} from "../adapters/finance-remaining.adapter";
import type {CommissionPageResponseDto, CommissionRulesResponseDto, CommissionSettlementResponseDto, CustomerFundsResponseDto, LogsResponseDto, UserMutationResponseDto, UsersResponseDto} from "../dto/finance-remaining.dto";
import type {CommissionMode} from "@/src/types/commission";
import type {CommissionRules} from "@/src/types/legacy";
import type {CommissionRulesPatch} from "@/src/utils/commissionRules";
import type {FinanceCommissionPage, PagedCollection} from "@/src/types/finance-remaining";
import type {StoreRole} from "@/src/types/auth";

export interface CustomerFundsFilters {startDate: string; endDate: string; trendStartDate: string; trendEndDate: string}
export interface LogsFilters {page: number; pageSize: number; keyword: string}
export interface FinanceCommissionFilters {mode: CommissionMode; page: number; pageSize: number; keyword: string; status: string; handler: string; dateStart: string; dateEnd: string; sortKey: string; sortDirection: "asc" | "desc"}
export type PermissionOverridePatch = {
  allowedMenus?: string[] | null;
  showCost?: boolean | null;
  showProfit?: boolean | null;
  canDelete?: boolean | null;
  canEditHistory?: boolean | null;
  canManualOutbound?: boolean | null;
};
export interface UserMutationInput {
  username?: string;
  password?: string;
  displayName: string;
  role: StoreRole;
  enabled: boolean;
  remarks?: string;
  permissionOverrides?: PermissionOverridePatch;
}

export function toUserMutationRequest(input: UserMutationInput) {
  const body: Record<string, unknown> = {
    displayName: input.displayName.trim(),
    role: input.role,
    enabled: input.enabled,
    remarks: input.remarks?.trim() || undefined,
  };
  if (input.username !== undefined) body.username = input.username.trim();
  if (input.password?.trim()) body.password = input.password.trim();
  if (input.permissionOverrides !== undefined) body.permissionOverrides = input.permissionOverrides;
  return body;
}

export const customerFundsApi = { async snapshot(filters: CustomerFundsFilters, signal?: AbortSignal) { const params = new URLSearchParams({startDate: filters.startDate, endDate: filters.endDate, trendStartDate: filters.trendStartDate, trendEndDate: filters.trendEndDate}); return adaptCustomerFunds(await apiRequest<CustomerFundsResponseDto>(`/api/gpu_erp/finance/customer-funds?${params.toString()}`, {signal})); } };
export const usersApi = {
  async list(signal?: AbortSignal) { return adaptUsers(await apiRequest<UsersResponseDto>("/api/users", {signal})); },
  async create(input: UserMutationInput, signal?: AbortSignal) { return adaptUserMutation(await apiRequest<UserMutationResponseDto>("/api/users", {method: "POST", body: JSON.stringify(toUserMutationRequest(input)), signal})); },
  async update(id: string, input: UserMutationInput, signal?: AbortSignal) { return adaptUserMutation(await apiRequest<UserMutationResponseDto>(`/api/users/${encodeURIComponent(id)}`, {method: "PUT", body: JSON.stringify(toUserMutationRequest(input)), signal})); },
};
export const logsApi = { async list(filters: LogsFilters, signal?: AbortSignal): Promise<PagedCollection<import("@/src/types/finance-remaining").AuditLogItem>> { const params = new URLSearchParams({page: String(filters.page), pageSize: String(filters.pageSize)}); if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim()); return adaptLogs(await apiRequest<LogsResponseDto>(`/api/logs?${params.toString()}`, {signal})); } };
export const financeCommissionApi = {
  async getRules(signal?: AbortSignal): Promise<CommissionRules> {
    return adaptCommissionRules(await apiRequest<CommissionRulesResponseDto>("/api/finance/commission-rules", {signal}));
  },
  async updateRules(input: CommissionRulesPatch, signal?: AbortSignal): Promise<CommissionRules> {
    return adaptCommissionRules(await apiRequest<CommissionRulesResponseDto>("/api/finance/commission-rules", {method: "PUT", body: JSON.stringify(input), signal}));
  },
  async list(filters: FinanceCommissionFilters, signal?: AbortSignal): Promise<FinanceCommissionPage> {
    const params = new URLSearchParams({mode: filters.mode, page: String(filters.page), pageSize: String(filters.pageSize), sortKey: filters.sortKey, sortDirection: filters.sortDirection});
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.status) params.set("status", filters.status);
    if (filters.handler.trim()) params.set("handler", filters.handler.trim());
    if (filters.dateStart) params.set("dateStart", filters.dateStart);
    if (filters.dateEnd) params.set("dateEnd", filters.dateEnd);
    return adaptCommissionPage(await apiRequest<CommissionPageResponseDto>(`/api/finance/commissions?${params.toString()}`, {signal}), filters.mode);
  },
  async settle(mode: CommissionMode, ids: string[], note?: string, signal?: AbortSignal) {
    return apiRequest<CommissionSettlementResponseDto>("/api/finance/commissions/settle", {method: "POST", body: JSON.stringify({mode, ids, note: note?.trim() || undefined}), signal});
  },
};
