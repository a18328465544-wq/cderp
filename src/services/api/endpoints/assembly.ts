import {apiRequest} from "../client";
import {adaptAssemblyList, adaptAssemblyOperation, adaptAssemblyReferenceData, toAssemblyCreateRequest} from "../adapters/assembly.adapter";
import type {AssemblyResponseDto} from "../dto/assembly.dto";
import type {PermissionModel} from "./auth";
import type {AssemblyFormValues, AssemblyOperationFilters} from "@/src/types/assembly";

export function toAssemblyQueryParams(filters: AssemblyOperationFilters) {
  const params = new URLSearchParams({page: String(filters.page), pageSize: String(filters.pageSize)});
  if (filters.keyword.trim()) params.set("search", filters.keyword.trim());
  if (filters.type !== "all") params.set("type", filters.type);
  if (filters.handler.trim()) params.set("handler", filters.handler.trim());
  return params;
}

export const assemblyApi = {
  async list(filters: AssemblyOperationFilters, permissions: Pick<PermissionModel, "showCost" | "showProfit">, signal?: AbortSignal) {
    const params = toAssemblyQueryParams(filters);
    return adaptAssemblyList(await apiRequest<AssemblyResponseDto>(`/api/assembly-operations?${params.toString()}`, {signal}), permissions);
  },
  async referenceData(permissions: Pick<PermissionModel, "showCost" | "showProfit">, signal?: AbortSignal) {
    return adaptAssemblyReferenceData(await apiRequest<AssemblyResponseDto>("/api/assembly-operations/reference", {signal}), permissions);
  },
  async create(values: AssemblyFormValues, permissions: Pick<PermissionModel, "showCost" | "showProfit">, signal?: AbortSignal) {
    const response = await apiRequest<AssemblyResponseDto>("/api/assembly-operations", {method: "POST", body: JSON.stringify(toAssemblyCreateRequest(values, permissions)), signal});
    const operation = adaptAssemblyOperation(response.data, permissions);
    if (!operation.id) throw new Error("组装拆卸接口没有返回有效操作单");
    return operation;
  },
  async remove(id: string, permissions: Pick<PermissionModel, "showCost" | "showProfit">, signal?: AbortSignal) {
    const response = await apiRequest<AssemblyResponseDto>(`/api/assembly-operations/${encodeURIComponent(id)}`, {method: "DELETE", signal});
    return adaptAssemblyOperation(response.data, permissions);
  },
};
