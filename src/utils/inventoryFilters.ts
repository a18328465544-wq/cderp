import type { CardInventory } from "../types";
import {inventoryReturnBlockedStatusValues, inventorySellableStatusValues} from "../types/inventory";
import { matchesKeyword } from "./search";
import { storeDate, storeDateDiffDays } from "./storeTime";

export type InventoryRiskFilter = "mined" | "upturned" | "high";

export type InventoryListFilters = {
  includeSold?: boolean;
  activeOnly?: boolean;
  /** Only include physical units that can be reserved by a sales order. */
  sellableOnly?: boolean;
  category?: string;
  status?: string;
  brand?: string;
  model?: string;
  condition?: string;
  warehouseLocation?: string;
  entryStart?: string;
  entryEnd?: string;
  keyword?: string;
  risk?: InventoryRiskFilter;
  minStorageDays?: number;
  maxStorageDays?: number;
  minProfitMargin?: number;
};

/**
 * A sales order can reserve inventory only after inspection has completed. Keep
 * this list in the shared inventory filter module so list views and sales
 * planning do not slowly drift into different definitions of "可售".
 */
export const inventorySellableStatuses = inventorySellableStatusValues;

export function isInventorySellableStatus(status: string | null | undefined): status is typeof inventorySellableStatuses[number] {
  return typeof status === "string" && inventorySellableStatuses.includes(status as typeof inventorySellableStatuses[number]);
}

export const inventoryInactiveStatuses: Set<CardInventory["status"]> = new Set(inventoryReturnBlockedStatusValues);

export function isInventoryInactiveStatus(status: string | null | undefined): boolean {
  return typeof status === "string" && inventoryInactiveStatuses.has(status as CardInventory["status"]);
}

function parseBooleanFilter(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const normalized = String(value).trim().toLocaleLowerCase("en-US");
  if (["true", "1", "yes"].includes(normalized)) return true;
  if (["false", "0", "no", ""].includes(normalized)) return false;
  return undefined;
}

function parseNumberFilter(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Normalize URL/query values before applying inventory filters.
 *
 * Express exposes query parameters as strings. Passing those strings straight
 * into a boolean filter makes `includeSold: "false"` truthy, which can leak
 * sold/non-sellable stock into sales cost averages. This boundary function is
 * intentionally exported so every state-snapshot caller can share the same
 * coercion rules.
 */
export function normalizeInventoryListFilters(filters: InventoryListFilters | Record<string, unknown> = {}): InventoryListFilters {
  const raw = filters && typeof filters === "object" ? filters as Record<string, unknown> : {};
  const normalized: InventoryListFilters = {};
  const includeSold = parseBooleanFilter(raw.includeSold);
  const activeOnly = parseBooleanFilter(raw.activeOnly);
  const sellableOnly = parseBooleanFilter(raw.sellableOnly);
  if (includeSold !== undefined) normalized.includeSold = includeSold;
  if (activeOnly !== undefined) normalized.activeOnly = activeOnly;
  if (sellableOnly !== undefined) normalized.sellableOnly = sellableOnly;

  for (const key of ["category", "status", "brand", "model", "condition", "warehouseLocation", "entryStart", "entryEnd", "keyword"] as const) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) normalized[key] = value.trim();
  }
  if (raw.risk === "mined" || raw.risk === "upturned" || raw.risk === "high") normalized.risk = raw.risk;

  const minStorageDays = parseNumberFilter(raw.minStorageDays);
  const maxStorageDays = parseNumberFilter(raw.maxStorageDays);
  const minProfitMargin = parseNumberFilter(raw.minProfitMargin);
  if (minStorageDays !== undefined) normalized.minStorageDays = minStorageDays;
  if (maxStorageDays !== undefined) normalized.maxStorageDays = maxStorageDays;
  if (minProfitMargin !== undefined) normalized.minProfitMargin = minProfitMargin;
  return normalized;
}

export function hasInventoryMarketLoss(card: Pick<CardInventory, "marketPrice" | "costPrice">) {
  const marketPrice = Number(card.marketPrice || 0);
  return marketPrice > 0 && marketPrice < Number(card.costPrice || 0);
}

export function hasInventoryProfitMargin(card: Pick<CardInventory, "costPrice" | "estSellPrice">, minimum: number) {
  const costPrice = Number(card.costPrice || 0);
  return costPrice > 0 && Number(card.estSellPrice || 0) >= costPrice * (1 + minimum);
}

export function matchesInventoryListFilters(
  card: CardInventory,
  filters: InventoryListFilters | Record<string, unknown> = {},
  referenceDate = storeDate(),
) {
  const normalizedFilters = normalizeInventoryListFilters(filters);
  const selectedStatus = normalizedFilters.status?.trim();
  const selectedSoldStatus = selectedStatus === "已售出";
  if (normalizedFilters.sellableOnly && !isInventorySellableStatus(card.status)) return false;
  if (!selectedStatus && normalizedFilters.activeOnly) {
    const excludedStatuses = normalizedFilters.includeSold
      ? new Set([...inventoryInactiveStatuses].filter((status) => status !== "已售出"))
      : inventoryInactiveStatuses;
    if (excludedStatuses.has(card.status)) return false;
  } else if (!selectedSoldStatus && !normalizedFilters.includeSold && card.status === "已售出") {
    return false;
  }
  if (normalizedFilters.status && normalizedFilters.status !== "all" && card.status !== normalizedFilters.status) return false;
  if (normalizedFilters.category && normalizedFilters.category !== "all" && (card.category || "显卡") !== normalizedFilters.category) return false;
  if (normalizedFilters.brand && normalizedFilters.brand !== "all" && card.brand !== normalizedFilters.brand) return false;
  if (normalizedFilters.model && normalizedFilters.model !== "all" && card.model !== normalizedFilters.model) return false;
  if (normalizedFilters.condition && normalizedFilters.condition !== "all" && card.condition !== normalizedFilters.condition) return false;
  if (normalizedFilters.warehouseLocation && normalizedFilters.warehouseLocation !== "all" && card.warehouseLocation !== normalizedFilters.warehouseLocation) return false;
  const entryDate = String(card.entryTime || "").slice(0, 10);
  if (normalizedFilters.entryStart && (!entryDate || entryDate < normalizedFilters.entryStart)) return false;
  if (normalizedFilters.entryEnd && (!entryDate || entryDate > normalizedFilters.entryEnd)) return false;
  if (!matchesKeyword([
    card.id,
    card.productId,
    card.productName,
    card.model,
    card.brand,
    card.version,
    card.vram,
    card.sn,
    card.expressNo,
    card.supplierName,
    card.warehouseLocation,
    card.remarks,
  ], normalizedFilters.keyword)) return false;

  const marketLoss = hasInventoryMarketLoss(card);
  if (normalizedFilters.risk === "mined" && !card.gpuRisk) return false;
  if (normalizedFilters.risk === "upturned" && !marketLoss) return false;
  if (normalizedFilters.risk === "high" && !card.gpuRisk && !marketLoss) return false;

  const storageDays = storeDateDiffDays(card.entryTime, referenceDate);
  const minStorageDays = Number(normalizedFilters.minStorageDays);
  if (Number.isFinite(minStorageDays) && minStorageDays > 0 && storageDays < minStorageDays) return false;
  const maxStorageDays = Number(normalizedFilters.maxStorageDays);
  if (Number.isFinite(maxStorageDays) && maxStorageDays >= 0 && storageDays > maxStorageDays) return false;
  const minProfitMargin = Number(normalizedFilters.minProfitMargin);
  if (Number.isFinite(minProfitMargin) && minProfitMargin > 0 && !hasInventoryProfitMargin(card, minProfitMargin)) return false;
  return true;
}
