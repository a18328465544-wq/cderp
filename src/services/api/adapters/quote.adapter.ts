import type {PermissionModel} from "../endpoints/auth";
import type {MarketQuoteCreateRequestDto, MarketQuoteSnapshotResponseDto, MarketQuoteUpdateRequestDto} from "../dto/quote.dto";
import type {MarketQuoteFormValues, MarketQuoteImportResult, MarketQuoteItem, MarketQuoteSnapshot, QuoteHistoryPoint, QuoteTrend} from "@/src/types/quote";
import {inventoryQuoteStatusValues} from "@/src/types/inventory";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : value === undefined || value === null ? fallback : String(value);
}

function optionalNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function trend(value: unknown, change?: number): QuoteTrend {
  if (value === "up" || value === "down" || value === "stable") return value;
  return (change || 0) > 0 ? "up" : (change || 0) < 0 ? "down" : "stable";
}

function history(value: unknown, permissions: Pick<PermissionModel, "showCost" | "showProfit">): QuoteHistoryPoint[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const point = record(entry);
    return {
      date: text(point.date),
      buyPrice: permissions.showCost ? optionalNumber(point.buyPrice) : undefined,
      sellPrice: permissions.showProfit ? optionalNumber(point.sellPrice) : undefined,
    };
  }).filter((point) => Boolean(point.date));
}

type InventoryAggregate = {count: number; totalCost: number; maximumCost: number};

function inventoryIndex(value: unknown, showCost: boolean) {
  const byProduct = new Map<string, InventoryAggregate>();
  const active = new Set<string>(inventoryQuoteStatusValues);
  if (!Array.isArray(value)) return byProduct;
  value.forEach((raw) => {
    const item = record(raw);
    const productId = text(item.productId).trim();
    if (!productId || !active.has(text(item.status))) return;
    const current = byProduct.get(productId) || {count: 0, totalCost: 0, maximumCost: 0};
    const cost = showCost ? optionalNumber(item.costPrice) || 0 : 0;
    byProduct.set(productId, {count: current.count + 1, totalCost: current.totalCost + cost, maximumCost: Math.max(current.maximumCost, cost)});
  });
  return byProduct;
}

export function adaptMarketQuote(value: unknown, permissions: Pick<PermissionModel, "showCost" | "showProfit">, stock?: InventoryAggregate): MarketQuoteItem {
  const dto = record(value);
  const changeAmount = optionalNumber(dto.changeAmount);
  const buyPrice = optionalNumber(dto.refBuyPrice) ?? optionalNumber(dto.todayBuyPrice) ?? optionalNumber(dto.yestBuyPrice);
  const sellPrice = optionalNumber(dto.refSellPrice) ?? optionalNumber(dto.todaySellPrice) ?? optionalNumber(dto.maxPrice);
  return {
    id: text(dto.id),
    productId: text(dto.productId) || undefined,
    productName: text(dto.productName, text(dto.model, "未命名型号")),
    model: text(dto.model, text(dto.productName, "未命名型号")),
    brand: text(dto.brand, "未标注"),
    version: text(dto.version) || undefined,
    buyPrice: permissions.showCost ? buyPrice : undefined,
    sellPrice: permissions.showProfit ? sellPrice : undefined,
    previousBuyPrice: permissions.showCost ? optionalNumber(dto.yestBuyPrice) : undefined,
    changeAmount: permissions.showCost ? changeAmount : undefined,
    changeRatio: permissions.showCost ? optionalNumber(dto.changeRatio) : undefined,
    trend: trend(dto.trend, changeAmount),
    note: text(dto.fluctuation, text(dto.remarks)) || undefined,
    updateTime: text(dto.updateTime, text(dto.date)) || undefined,
    history: history(dto.history, permissions),
    stockCount: stock?.count || 0,
    averageStockCost: permissions.showCost && stock?.count ? Math.round(stock.totalCost / stock.count) : undefined,
    maximumStockCost: permissions.showCost && stock?.count ? stock.maximumCost : undefined,
  };
}

export function adaptMarketQuoteSnapshot(response: MarketQuoteSnapshotResponseDto, permissions: Pick<PermissionModel, "showCost" | "showProfit">): MarketQuoteSnapshot {
  const payload = record(response.data);
  const stocks = inventoryIndex(payload.inventory, permissions.showCost);
  const rawQuotes = Array.isArray(payload.marketQuotes) ? payload.marketQuotes : [];
  const quotes = rawQuotes.map((value) => {
    const dto = record(value);
    return adaptMarketQuote(value, permissions, stocks.get(text(dto.productId)));
  }).filter((item) => Boolean(item.id));
  return {quotes, brands: Array.from(new Set(quotes.map((item) => item.brand).filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-CN"))};
}

export function toMarketQuoteCreateRequest(values: MarketQuoteFormValues, date: string): MarketQuoteCreateRequestDto {
  return {model: values.model.trim(), brand: values.brand.trim(), refBuyPrice: values.buyPrice, refSellPrice: values.sellPrice, trend: values.trend, ...(values.note.trim() ? {fluctuation: values.note.trim()} : {}), updateTime: date};
}

export function toMarketQuoteUpdateRequest(values: MarketQuoteFormValues): MarketQuoteUpdateRequestDto {
  return {todayBuyPrice: values.buyPrice, todaySellPrice: values.sellPrice, ...(values.note.trim() ? {remarks: values.note.trim()} : {})};
}

export function adaptMarketQuoteMutation(response: MarketQuoteSnapshotResponseDto, permissions: Pick<PermissionModel, "showCost" | "showProfit">) {
  const quote = adaptMarketQuote(response.data, permissions);
  if (!quote.id) throw new Error("行情接口没有返回有效记录");
  return quote;
}

export function adaptMarketQuoteImportResult(response: MarketQuoteSnapshotResponseDto): MarketQuoteImportResult {
  const data = record(response.data);
  return {created: optionalNumber(data.created) || 0, updated: optionalNumber(data.updated) || 0, skipped: optionalNumber(data.skipped) || 0};
}
