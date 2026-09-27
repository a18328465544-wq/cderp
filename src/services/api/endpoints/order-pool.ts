import {apiRequest} from "../client";
import {adaptOrderPoolCollaborators, adaptOrderPoolCollection, adaptOrderPoolMutation} from "../adapters/order-pool.adapter";
import type {OrderPoolCollaboratorsResponseDto, OrderPoolCollectionResponseDto, OrderPoolMutationResponseDto} from "../dto/order-pool.dto";
import type {CustomerOrder, OrderPoolCollection, OrderPoolCollaboratorOption, OrderPoolCreateInput, OrderPoolDocumentLinkInput, OrderPoolEventInput, OrderPoolFilters, OrderPoolUpdateInput} from "@/src/types/order-pool";

export const orderPoolApi = {
  async listCollaborators(signal?: AbortSignal): Promise<OrderPoolCollaboratorOption[]> {
    return adaptOrderPoolCollaborators(await apiRequest<OrderPoolCollaboratorsResponseDto>("/api/order-pool/collaborators", {signal}));
  },
  async list(filters: OrderPoolFilters, signal?: AbortSignal): Promise<OrderPoolCollection> {
    const params = new URLSearchParams({page: String(filters.page), pageSize: String(filters.pageSize), orderType: filters.orderType, mainStage: filters.mainStage, queue: filters.queue});
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.owner.trim()) params.set("owner", filters.owner.trim());
    return adaptOrderPoolCollection(await apiRequest<OrderPoolCollectionResponseDto>(`/api/order-pool?${params.toString()}`, {signal}));
  },
  async create(input: OrderPoolCreateInput, signal?: AbortSignal): Promise<CustomerOrder> {
    return adaptOrderPoolMutation(await apiRequest<OrderPoolMutationResponseDto>("/api/order-pool", {method: "POST", body: JSON.stringify(input), signal}));
  },
  async update(id: string, input: OrderPoolUpdateInput, signal?: AbortSignal): Promise<CustomerOrder> {
    return adaptOrderPoolMutation(await apiRequest<OrderPoolMutationResponseDto>(`/api/order-pool/${encodeURIComponent(id)}`, {method: "PATCH", body: JSON.stringify(input), signal}));
  },
  async addNote(id: string, input: OrderPoolEventInput, signal?: AbortSignal): Promise<CustomerOrder> {
    return adaptOrderPoolMutation(await apiRequest<OrderPoolMutationResponseDto>(`/api/order-pool/${encodeURIComponent(id)}/events`, {method: "POST", body: JSON.stringify(input), signal}));
  },
  async linkDocument(id: string, input: OrderPoolDocumentLinkInput, signal?: AbortSignal): Promise<CustomerOrder> {
    return adaptOrderPoolMutation(await apiRequest<OrderPoolMutationResponseDto>(`/api/order-pool/${encodeURIComponent(id)}/links`, {method: "POST", body: JSON.stringify(input), signal}));
  },
};
