import {apiRequest} from "../client";
import {adaptMarketQuoteImportResult, adaptMarketQuoteMutation, adaptMarketQuoteSnapshot, toMarketQuoteCreateRequest, toMarketQuoteUpdateRequest} from "../adapters/quote.adapter";
import type {MarketQuoteSnapshotResponseDto} from "../dto/quote.dto";
import type {PermissionModel} from "./auth";
import type {MarketQuoteFormValues, MarketQuoteImportRow} from "@/src/types/quote";
import {storeDate} from "@/src/utils/storeTime";

const today = () => storeDate();

export const quotesApi = {
  async list(permissions: Pick<PermissionModel, "showCost" | "showProfit">, signal?: AbortSignal) {
    return adaptMarketQuoteSnapshot(await apiRequest<MarketQuoteSnapshotResponseDto>("/api/market-quotes", {signal}), permissions);
  },
  async create(values: MarketQuoteFormValues, permissions: Pick<PermissionModel, "showCost" | "showProfit">, signal?: AbortSignal) {
    const response = await apiRequest<MarketQuoteSnapshotResponseDto>("/api/market-quotes", {method: "POST", body: JSON.stringify(toMarketQuoteCreateRequest(values, today())), signal});
    return adaptMarketQuoteMutation(response, permissions);
  },
  async update(id: string, values: MarketQuoteFormValues, permissions: Pick<PermissionModel, "showCost" | "showProfit">, signal?: AbortSignal) {
    const response = await apiRequest<MarketQuoteSnapshotResponseDto>(`/api/market-quotes/${encodeURIComponent(id)}`, {method: "PATCH", body: JSON.stringify(toMarketQuoteUpdateRequest(values)), signal});
    return adaptMarketQuoteMutation(response, permissions);
  },
  async importRows(rows: MarketQuoteImportRow[], signal?: AbortSignal) {
    const quotes = rows.map(({sourceLine: _sourceLine, ...values}) => toMarketQuoteCreateRequest(values, today()));
    return adaptMarketQuoteImportResult(await apiRequest<MarketQuoteSnapshotResponseDto>("/api/market-quotes/import", {method: "POST", body: JSON.stringify({quotes}), signal}));
  },
  async remove(id: string, signal?: AbortSignal) {
    await apiRequest<MarketQuoteSnapshotResponseDto>(`/api/market-quotes/${encodeURIComponent(id)}`, {method: "DELETE", signal});
  },
};
