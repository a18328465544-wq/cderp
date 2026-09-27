import {apiRequest} from "../client";
import {adaptInventoryJourney, adaptInventoryModelSummaries, adaptInventoryPage, adaptInventorySummary} from "../adapters/inventory.adapter";
import {adaptProductLedgerPage} from "../adapters/product-ledger.adapter";
import type {InventoryJourneyResponseDto, InventoryPageResponseDto, InventorySummaryResponseDto} from "../dto/inventory.dto";
import type {ProductLedgerPageResponseDto} from "../dto/product-ledger.dto";
import type {InventoryFilters, InventoryJourney, InventoryListResult, InventoryModelSummary, InventorySummary} from "@/src/types/inventory";
import type {ProductLedgerFilters, ProductLedgerPage} from "@/src/types/product-ledger";

export interface InventoryPermissions {
  showCost: boolean;
  showProfit: boolean;
}

export function toInventoryQueryParams(filters: InventoryFilters, includePaging = true) {
  const params = new URLSearchParams();
  const set = (key: string, value: string | number | boolean | undefined) => {
    if (value === undefined || value === "" || value === false) return;
    params.set(key, String(value));
  };
  if (includePaging) {
    set("page", filters.page);
    set("pageSize", filters.pageSize);
  }
  set("keyword", filters.keyword);
  set("category", filters.category);
  set("brand", filters.brand);
  set("model", filters.model);
  set("warehouseLocation", filters.warehouseLocation);
  set("status", filters.status || filters.inspectionStatus);
  set("condition", filters.condition);
  set("entryStart", filters.entryStart);
  set("entryEnd", filters.entryEnd);
  set("risk", filters.risk);
  set("minStorageDays", filters.minStorageDays);
  set("maxStorageDays", filters.maxStorageDays);
  set("minProfitMargin", filters.minProfitMargin);
  set("activeOnly", filters.activeOnly);
  set("includeSold", filters.includeSold);
  set("sortKey", filters.sortKey);
  set("sortDirection", filters.sortDirection);
  return params;
}

export function toProductLedgerQueryParams(productSkuId: string, filters: ProductLedgerFilters) {
  const params = new URLSearchParams();
  params.set("productSkuId", productSkuId);
  params.set("page", String(filters.page));
  params.set("pageSize", String(filters.pageSize));
  if (filters.documentNo.trim()) params.set("documentNo", filters.documentNo.trim());
  if (filters.createdBy.trim()) params.set("createdBy", filters.createdBy.trim());
  if (filters.documentType) params.set("documentType", filters.documentType);
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
  return params;
}

export const inventoryApi = {
  async list(filters: InventoryFilters, permissions: InventoryPermissions, signal?: AbortSignal): Promise<InventoryListResult> {
    const params = toInventoryQueryParams(filters);
    const response = await apiRequest<InventoryPageResponseDto>(`/api/inventory/items?${params.toString()}`, {signal});
    return adaptInventoryPage(response, permissions);
  },

  async summary(filters: InventoryFilters, permissions: InventoryPermissions, signal?: AbortSignal): Promise<InventorySummary> {
    const params = toInventoryQueryParams(filters, false);
    const response = await apiRequest<InventorySummaryResponseDto>(`/api/inventory/summary?${params.toString()}`, {signal});
    return adaptInventorySummary(response, permissions);
  },

  async modelSummaries(filters: InventoryFilters, permissions: InventoryPermissions, signal?: AbortSignal): Promise<InventoryModelSummary[]> {
    const params = toInventoryQueryParams(filters, false);
    const response = await apiRequest<InventorySummaryResponseDto>(`/api/inventory/summary?${params.toString()}`, {signal});
    return adaptInventoryModelSummaries(response, permissions);
  },

  async detail(id: string, permissions: InventoryPermissions, signal?: AbortSignal) {
    const filters: InventoryFilters = {
      keyword: id,
      category: "",
      brand: "",
      model: "",
      warehouseLocation: "",
      condition: "",
      inspectionStatus: "",
      status: "",
      entryStart: "",
      entryEnd: "",
      risk: "",
      minStorageDays: "",
      maxStorageDays: "",
      minProfitMargin: "",
      activeOnly: false,
      includeSold: true,
      page: 1,
      pageSize: 1,
      sortKey: "entryTime",
      sortDirection: "desc",
    };
    const params = toInventoryQueryParams(filters);
    const response = await apiRequest<InventoryPageResponseDto>(`/api/inventory/items?${params.toString()}`, {signal});
    const page = adaptInventoryPage(response, permissions);
    return {item: page.data.find((item) => item.id === id) || null, fallback: true};
  },

  async journey(id: string, permissions: InventoryPermissions, signal?: AbortSignal): Promise<InventoryJourney> {
    const response = await apiRequest<InventoryJourneyResponseDto>(`/api/inventory/items/${encodeURIComponent(id)}/journey`, {signal});
    return adaptInventoryJourney(response, permissions);
  },

  async productLedger(productSkuId: string, filters: ProductLedgerFilters, permissions: InventoryPermissions, signal?: AbortSignal): Promise<ProductLedgerPage> {
    const params = toProductLedgerQueryParams(productSkuId, filters);
    const response = await apiRequest<ProductLedgerPageResponseDto>(`/api/inventory/product-ledger?${params.toString()}`, {signal});
    return adaptProductLedgerPage(response, permissions);
  },
};
