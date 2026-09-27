import {adaptCustomerDirectory, adaptCustomerMutation, toCustomerCreateRequest, toCustomerUpdateRequest} from "../adapters/customer.adapter";
import {apiRequest} from "../client";
import type {CustomerDirectoryResponseDto, CustomerMutationResponseDto} from "../dto/customer.dto";
import type {CustomerDirectorySnapshot, CustomerRecordFormValues} from "@/src/types/customer";
import type {CustomerDirectoryFilters} from "@/src/types/customer";
import type {SortingState} from "@tanstack/react-table";

export const customersApi = {
  async list(filters: CustomerDirectoryFilters, sorting: SortingState, permissions: {showProfit: boolean}, signal?: AbortSignal): Promise<CustomerDirectorySnapshot> {
    const params = new URLSearchParams({page: String(filters.page), pageSize: String(filters.pageSize)});
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.type !== "all") params.set("type", filters.type);
    if (filters.channel !== "all") params.set("channel", filters.channel);
    if (filters.level !== "all") params.set("level", filters.level);
    const sort = sorting[0];
    if (sort) {
      params.set("sortKey", sort.id);
      params.set("sortDirection", sort.desc ? "desc" : "asc");
    }
    const response = await apiRequest<CustomerDirectoryResponseDto>(`/api/customers/page?${params.toString()}`, {signal});
    return adaptCustomerDirectory(response, permissions);
  },

  async create(values: CustomerRecordFormValues, permissions: {showProfit: boolean}, signal?: AbortSignal) {
    const response = await apiRequest<CustomerMutationResponseDto>("/api/customers", {method: "POST", body: JSON.stringify(toCustomerCreateRequest(values)), signal});
    return adaptCustomerMutation(response, permissions);
  },

  async update(id: string, values: CustomerRecordFormValues, permissions: {showProfit: boolean}, signal?: AbortSignal) {
    const response = await apiRequest<CustomerMutationResponseDto>(`/api/gpu_erp/crm/customer/${encodeURIComponent(id)}`, {method: "PATCH", body: JSON.stringify(toCustomerUpdateRequest(values)), signal});
    return adaptCustomerMutation(response, permissions);
  },

  async remove(id: string, signal?: AbortSignal) {
    await apiRequest<CustomerMutationResponseDto>(`/api/customers/${encodeURIComponent(id)}`, {method: "DELETE", signal});
  },
};
