/** Shared domain primitives used by feature-specific models and adapters. */

/** Canonical product categories shared by UI forms, adapters and HTTP DTOs. */
export const productCategoryValues = [
  "显卡",
  "CPU",
  "主板",
  "内存",
  "硬盘",
  "电源",
  "散热",
  "机箱",
  "整机",
  "显示器",
  "组装拆卸",
  "其他配件",
] as const;

export type ProductCategory = (typeof productCategoryValues)[number];

/** Canonical physical-condition values used by inventory and purchase flows. */
export const inventoryConditionValues = [
  "全新",
  "99新",
  "95新",
  "90新",
  "85新",
  "轻微瑕疵",
  "损坏",
] as const;

export type InventoryCondition = (typeof inventoryConditionValues)[number];

/**
 * Canonical inventory lifecycle values shared by the API and Frontend V2.
 *
 * Keep this list as the single source of truth for filters, adapters and
 * server-side status predicates. The backend stores these values in the
 * inventory JSON projection, so changing one value is a contract migration.
 */
export const cardStatusValues = [
  "待检测",
  "检测中",
  "已入库",
  "已上架",
  "已锁定",
  "已售出",
  "已拆卸",
  "已组装",
  "退货中",
  "已退货",
  "售后中",
  "维修中",
  "已报废",
] as const;

export type CardStatus = (typeof cardStatusValues)[number];

/** Canonical source labels used by purchase and inventory records. */
export const sourceTypeValues = [
  "个人回收",
  "同行拿货",
  "批量采购",
  "客户置换",
  "门店自采",
  "门市自采",
] as const;

export type SourceType = (typeof sourceTypeValues)[number];

export interface CardInventory {
  id: string;
  productId: string;
  productName: string;
  category?: ProductCategory;
  model: string;
  brand: string;
  version: string;
  vram: string;
  sn: string;
  expressNo?: string;
  sourceType: SourceType;
  supplierName: string;
  purchaseHandler?: string;
  purchaseInvoiceNo?: string;
  costPrice: number;
  estSellPrice: number;
  marketPrice: number;
  priceSource?: string;
  priceUpdatedAt?: string;
  status: CardStatus;
  condition: InventoryCondition;
  inWarranty: boolean;
  warrantyDate?: string;
  repaired: boolean;
  gpuRisk: boolean;
  fullBox: boolean;
  warehouseLocation: string;
  entryTime: string;
  storageDays: number;
  remarks?: string;
  salesPrice?: number;
  salesTime?: string;
  salesInvoiceId?: string;
  buyerName?: string;
}
