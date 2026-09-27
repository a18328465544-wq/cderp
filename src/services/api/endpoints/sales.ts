import {apiRequest} from "../client";
import {adaptSalesCustomers, adaptSalesInventoryCandidates, adaptSalesInvoice, adaptSalesListState, adaptSalesMutationResponse, adaptSalesOutboundPreflight, adaptSalesOutboundResult, adaptSalesOutboundState, adaptSalesProductCandidates, adaptSalesSettlementAccounts, toCreateSalesRequest, toSalesOutboundRequestDto, toSalesUpdateRequestDto} from "../adapters/sales.adapter";
import type {SalesCreateResponseDto, SalesCustomerListResponseDto, SalesInventoryListResponseDto, SalesListStateResponseDto, SalesOutboundPreflightResponseDto, SalesOutboundResponseDto, SalesProductCandidatesResponseDto, SalesSettlementAccountsResponseDto} from "../dto/sales.dto";
import type {SalesFormValues, SalesCustomerOption, SalesInventoryCandidate, SalesInvoiceResult, SalesListDataset, SalesListFilters, SalesListItem, SalesMutationResult, SalesOutboundDataset, SalesOutboundFilters, SalesOutboundPreflightResult, SalesOutboundRequest, SalesOutboundResult, SalesProductCandidate, SalesSettlementAccountOption} from "@/src/types/sales";
import {ApiError} from "../errors";
import type {SalesApiPermissions} from "../adapters/sales.adapter";

export function toSalesCustomerQueryParams(keyword: string, page = 1, pageSize = 20) {
  const params = new URLSearchParams({page: String(page), pageSize: String(pageSize)});
  if (keyword.trim()) params.set("keyword", keyword.trim());
  return params;
}

export function toSalesInventoryQueryParams(keyword: string, page = 1, pageSize = 20) {
  const params = new URLSearchParams({page: String(page), pageSize: String(pageSize), activeOnly: "true", includeSold: "false", sortKey: "entryTime", sortDirection: "desc"});
  if (keyword.trim()) params.set("keyword", keyword.trim());
  return params;
}

export const salesApi = {
  async list(filters: SalesListFilters, permissions: SalesApiPermissions, signal?: AbortSignal): Promise<SalesListDataset> {
    const params = new URLSearchParams(); Object.entries(filters).forEach(([key, value]) => {if (value !== "") params.set(key, String(value));});
    const response = await apiRequest<SalesListStateResponseDto>(`/api/sales-invoices?${params.toString()}`, {signal});
    return adaptSalesListState(response, permissions);
  },

  /** Resolve a drawer reference independently of the currently visible page. */
  async findByReference(reference: string, permissions: SalesApiPermissions, signal?: AbortSignal): Promise<SalesListItem | null> {
    const keyword = reference.trim();
    if (!keyword) return null;
    const params = new URLSearchParams({page: "1", pageSize: "1", keyword});
    const response = await apiRequest<SalesListStateResponseDto>(`/api/sales-invoices?${params.toString()}`, {signal});
    const dataset = adaptSalesListState(response, permissions);
    return dataset.items.find((item) => item.id === keyword || item.invoiceNo === keyword || item.lines.some((line) => line.id === keyword || line.sn === keyword)) || null;
  },

  /**
   * Sales currently has no dedicated detail route. Resolve by the exact id or
   * invoice number through the paged read model, then keep the adapter as the
   * single permission boundary for detail/edit consumers.
   */
  async detail(id: string, permissions: SalesApiPermissions, signal?: AbortSignal): Promise<SalesListItem> {
    const item = await this.findByReference(id, permissions, signal);
    if (!item) throw new ApiError(404, "销售单不存在，或当前账号无权查看该单据");
    return item;
  },

  async listAllForReport(permissions: SalesApiPermissions, signal?: AbortSignal): Promise<SalesListDataset> {
    const base: SalesListFilters = {keyword: "", channel: "", paymentStatus: "", outboundStatus: "", dateStart: "", dateEnd: "", page: 1, pageSize: 200, sortKey: "date", sortDirection: "desc"};
    const first = await this.list(base, permissions, signal);
    const totalPages = first.selection?.meta.totalPages || 1;
    if (totalPages <= 1) return first;
    const items = [...first.items];
    // This is an explicit whole-period finance report, not an interactive list. Walk the
    // database pages sequentially so a long history cannot create an unbounded request burst.
    for (let page = 2; page <= totalPages; page += 1) {
      const next = await this.list({...base, page}, permissions, signal);
      items.push(...next.items);
    }
    return {items, source: "database-page"};
  },

  async outbound(filters: SalesOutboundFilters, signal?: AbortSignal): Promise<SalesOutboundDataset> {
    const params = new URLSearchParams({page: String(filters.page), pageSize: String(filters.pageSize)});
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    const response = await apiRequest<SalesListStateResponseDto>(`/api/sales-invoices/outbound?${params.toString()}`, {signal});
    return adaptSalesOutboundState(response);
  },

  async confirmOutbound(invoiceId: string, values: SalesOutboundRequest, signal?: AbortSignal, idempotencyKey?: string): Promise<SalesOutboundResult> {
    const request = toSalesOutboundRequestDto(values);
    const response = await apiRequest<SalesOutboundResponseDto>(`/api/sales-invoices/${encodeURIComponent(invoiceId)}/outbound`, {method: "POST", body: JSON.stringify(request), signal, headers: idempotencyKey ? {"Idempotency-Key": idempotencyKey} : undefined});
    return adaptSalesOutboundResult(response.data);
  },

  async preflightOutbound(invoiceId: string, values: SalesOutboundRequest, signal?: AbortSignal): Promise<SalesOutboundPreflightResult> {
    const request = toSalesOutboundRequestDto(values);
    const response = await apiRequest<SalesOutboundPreflightResponseDto>(`/api/sales-invoices/${encodeURIComponent(invoiceId)}/outbound/preflight`, {method: "POST", body: JSON.stringify(request), signal});
    return adaptSalesOutboundPreflight(response.data);
  },

  async searchCustomers(keyword: string, signal?: AbortSignal): Promise<SalesCustomerOption[]> {
    const params = toSalesCustomerQueryParams(keyword, 1, 200);
    const response = await apiRequest<SalesCustomerListResponseDto>(`/api/sales/customers?${params.toString()}`, {signal});
    return adaptSalesCustomers(response);
  },

  async searchInventory(keyword: string, permissions: SalesApiPermissions, signal?: AbortSignal): Promise<SalesInventoryCandidate[]> {
    const params = toSalesInventoryQueryParams(keyword);
    const response = await apiRequest<SalesInventoryListResponseDto>(`/api/inventory/items?${params.toString()}`, {signal});
    return adaptSalesInventoryCandidates(response, permissions);
  },

  async searchProductCandidates(keyword: string, permissions: SalesApiPermissions, signal?: AbortSignal): Promise<SalesProductCandidate[]> {
    const params = new URLSearchParams();
    if (keyword.trim()) params.set("keyword", keyword.trim());
    const response = await apiRequest<SalesProductCandidatesResponseDto>(`/api/sales/product-candidates?${params.toString()}`, {signal});
    return adaptSalesProductCandidates(response, permissions);
  },

  async settlementAccounts(signal?: AbortSignal): Promise<SalesSettlementAccountOption[]> {
    const response = await apiRequest<SalesSettlementAccountsResponseDto>("/api/gpu_erp/finance/settlement-accounts?page=1&pageSize=100", {signal});
    return adaptSalesSettlementAccounts(response);
  },

  async create(values: SalesFormValues, account?: SalesSettlementAccountOption, signal?: AbortSignal, idempotencyKey?: string): Promise<SalesInvoiceResult> {
    const request = toCreateSalesRequest(values, account);
    const response = await apiRequest<SalesCreateResponseDto>("/api/sales-invoices", {method: "POST", body: JSON.stringify(request), signal, headers: idempotencyKey ? {"Idempotency-Key": idempotencyKey} : undefined});
    return adaptSalesInvoice(response.data);
  },

  async update(id: string, values: SalesFormValues, account: SalesSettlementAccountOption | undefined, mode: "full" | "metadata", permissions: SalesApiPermissions, signal?: AbortSignal): Promise<SalesMutationResult> {
    const request = toSalesUpdateRequestDto(values, account, mode);
    const response = await apiRequest<SalesCreateResponseDto>(`/api/sales-invoices/${encodeURIComponent(id)}`, {method: "PUT", body: JSON.stringify(request), signal});
    return adaptSalesMutationResponse(response, permissions);
  },

  async remove(id: string, signal?: AbortSignal): Promise<SalesInvoiceResult> {
    const response = await apiRequest<SalesCreateResponseDto>(`/api/sales-invoices/${encodeURIComponent(id)}`, {method: "DELETE", signal});
    return adaptSalesInvoice(response.data);
  },
};

export type {SalesApiPermissions, SalesCreateResponseDto};
