import {apiRequest} from "../client";
import {adaptPurchaseCreateResponse, adaptPurchaseDetailState, adaptPurchaseListState, adaptPurchaseReferenceData, toPurchaseRequestDto, toPurchaseUpdateRequestDto} from "../adapters/purchase.adapter";
import type {PurchaseCreateResponseDto, PurchaseDetailStateResponseDto, PurchaseListStateResponseDto, PurchaseReferenceStateResponseDto} from "../dto/purchase.dto";
import type {PurchaseDetail, PurchaseFormValues, PurchaseListDataset, PurchaseListFilters, PurchaseReferenceData, PurchaseSettlementAccountOption, PurchaseCreateResult} from "@/src/types/purchase";
import type {PurchaseDetailPermissions, PurchaseListPermissions, PurchaseReferencePermissions} from "../adapters/purchase.adapter";
import {ApiError} from "../errors";

export const purchaseApi = {
  async list(filters: PurchaseListFilters, permissions: PurchaseListPermissions, signal?: AbortSignal): Promise<PurchaseListDataset> {
    const params = new URLSearchParams(); Object.entries(filters).forEach(([key, value]) => {if (value !== "") params.set(key, String(value));});
    const response = await apiRequest<PurchaseListStateResponseDto>(`/api/purchase-invoices?${params.toString()}`, {signal});
    return adaptPurchaseListState(response, permissions);
  },

  async referenceData(permissions: PurchaseReferencePermissions, signal?: AbortSignal): Promise<PurchaseReferenceData> {
    const response = await apiRequest<PurchaseReferenceStateResponseDto>("/api/purchase-invoices/reference", {signal});
    return adaptPurchaseReferenceData(response, permissions);
  },

  async searchProducts(keyword: string, permissions: PurchaseReferencePermissions, signal?: AbortSignal) {
    const response = await apiRequest<PurchaseReferenceStateResponseDto>(`/api/purchase-invoices/reference/products?keyword=${encodeURIComponent(keyword)}`, {signal});
    return adaptPurchaseReferenceData(response, permissions).products;
  },

  async searchSources(keyword: string, permissions: PurchaseReferencePermissions, signal?: AbortSignal) {
    const response = await apiRequest<PurchaseReferenceStateResponseDto>(`/api/purchase-invoices/reference/sources?keyword=${encodeURIComponent(keyword)}`, {signal});
    return adaptPurchaseReferenceData(response, permissions).sources;
  },

  async create(values: PurchaseFormValues, account?: PurchaseSettlementAccountOption, signal?: AbortSignal, idempotencyKey?: string): Promise<PurchaseCreateResult> {
    const request = toPurchaseRequestDto(values, account);
    const response = await apiRequest<PurchaseCreateResponseDto>("/api/purchase-invoices", {method: "POST", body: JSON.stringify(request), signal, headers: idempotencyKey ? {"Idempotency-Key": idempotencyKey} : undefined});
    return adaptPurchaseCreateResponse(response);
  },

  async update(id: string, values: PurchaseFormValues, account: PurchaseSettlementAccountOption | undefined, expectedRecordVersion: number, mode: "full" | "metadata", signal?: AbortSignal): Promise<PurchaseCreateResult> {
    const request = toPurchaseUpdateRequestDto(values, account, expectedRecordVersion, mode);
    const response = await apiRequest<PurchaseCreateResponseDto>(`/api/purchase-invoices/${encodeURIComponent(id)}`, {method: "PUT", body: JSON.stringify(request), signal});
    return adaptPurchaseCreateResponse(response);
  },

  async remove(id: string, signal?: AbortSignal): Promise<PurchaseCreateResult> {
    const response = await apiRequest<PurchaseCreateResponseDto>(`/api/purchase-invoices/${encodeURIComponent(id)}`, {method: "DELETE", signal});
    return adaptPurchaseCreateResponse(response);
  },

  async detail(id: string, permissions: PurchaseDetailPermissions, signal?: AbortSignal): Promise<PurchaseDetail> {
    const response = await apiRequest<PurchaseDetailStateResponseDto>(`/api/purchase-invoices/detail?id=${encodeURIComponent(id)}`, {signal});
    const detail = adaptPurchaseDetailState(response, id, permissions);
    if (!detail) throw new ApiError(404, "采购单不存在，或当前账号无权查看该单据");
    return detail;
  },
};
