import {adaptVendorDirectory, adaptVendorMutation, toVendorCreateRequest, toVendorUpdateRequest} from "../adapters/vendor.adapter";
import {apiRequest} from "../client";
import type {VendorDirectoryResponseDto, VendorMutationResponseDto} from "../dto/vendor.dto";
import type {VendorDirectoryFilters, VendorDirectorySnapshot, VendorRecordFormValues} from "@/src/types/vendor";

export const vendorsApi = {
  async list(filters: VendorDirectoryFilters, sorting: readonly {id: string; desc: boolean}[], permissions: {showProfit: boolean}, signal?: AbortSignal): Promise<VendorDirectorySnapshot> {
    const params = new URLSearchParams({page: String(filters.page), pageSize: String(filters.pageSize)});
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.type !== "all") params.set("type", filters.type);
    if (filters.level !== "all") params.set("level", filters.level);
    if (filters.balance !== "all") params.set("balance", filters.balance);
    if (sorting[0]) {params.set("sortKey", sorting[0].id); params.set("sortDirection", sorting[0].desc ? "desc" : "asc");}
    const response = await apiRequest<VendorDirectoryResponseDto>(`/api/vendors?${params.toString()}`, {signal});
    return adaptVendorDirectory(response, permissions);
  },

  async create(values: VendorRecordFormValues, permissions: {showProfit: boolean}, signal?: AbortSignal) {
    const response = await apiRequest<VendorMutationResponseDto>("/api/vendors", {method: "POST", body: JSON.stringify(toVendorCreateRequest(values)), signal});
    return adaptVendorMutation(response, permissions);
  },

  async update(id: string, values: VendorRecordFormValues, permissions: {showProfit: boolean}, signal?: AbortSignal) {
    const response = await apiRequest<VendorMutationResponseDto>(`/api/vendors/${encodeURIComponent(id)}`, {method: "PUT", body: JSON.stringify(toVendorUpdateRequest(values)), signal});
    return adaptVendorMutation(response, permissions);
  },

  async remove(id: string, signal?: AbortSignal) {
    await apiRequest<VendorMutationResponseDto>(`/api/vendors/${encodeURIComponent(id)}`, {method: "DELETE", signal});
  },
};
