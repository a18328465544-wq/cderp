export interface InventoryItemDto {
  id?: unknown;
  productId?: unknown;
  productName?: unknown;
  category?: unknown;
  model?: unknown;
  brand?: unknown;
  version?: unknown;
  vram?: unknown;
  sn?: unknown;
  expressNo?: unknown;
  sourceType?: unknown;
  supplierName?: unknown;
  costPrice?: unknown;
  estSellPrice?: unknown;
  marketPrice?: unknown;
  actualProfit?: unknown;
  priceSource?: unknown;
  priceUpdatedAt?: unknown;
  status?: unknown;
  condition?: unknown;
  inWarranty?: unknown;
  warrantyDate?: unknown;
  repaired?: unknown;
  gpuRisk?: unknown;
  fullBox?: unknown;
  warehouseLocation?: unknown;
  entryTime?: unknown;
  storageDays?: unknown;
  remarks?: unknown;
  salesPrice?: unknown;
  salesTime?: unknown;
  salesInvoiceId?: unknown;
  buyerName?: unknown;
  imageUrls?: unknown;
}

export interface InventoryPageResponseDto {
  data?: unknown;
  meta?: unknown;
}

export interface InventoryJourneyResponseDto {
  data?: unknown;
}

export interface InventorySummaryRowDto {
  key?: unknown;
  productName?: unknown;
  category?: unknown;
  brand?: unknown;
  model?: unknown;
  version?: unknown;
  vram?: unknown;
  warehouseLocation?: unknown;
  warehouseLocations?: unknown;
  totalCount?: unknown;
  availableCount?: unknown;
  pendingCount?: unknown;
  lockedCount?: unknown;
  soldCount?: unknown;
  repairCount?: unknown;
  totalCost?: unknown;
  totalEstSell?: unknown;
  avgCost?: unknown;
  avgEstSell?: unknown;
  lastEntryTime?: unknown;
}

export interface InventorySummaryResponseDto {
  data?: unknown;
}

export interface AuthUserDto {
  id?: unknown;
  username?: unknown;
  displayName?: unknown;
  role?: unknown;
  enabled?: unknown;
  permissionOverrides?: unknown;
}

export interface AuthLoginResponseDto {
  data?: unknown;
  state?: unknown;
}

export interface AuthMeResponseDto {
  data?: unknown;
}

export interface PublicStateResponseDto {
  data?: unknown;
}
