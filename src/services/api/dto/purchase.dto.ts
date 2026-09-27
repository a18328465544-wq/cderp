import type {ProductCategory, SourceType} from "@/src/types/core";
import type {PurchaseCondition, PurchasePartnerType, PurchasePaymentStatus} from "@/src/types/purchase";

/** Raw purchase line sent to the existing purchase-invoice endpoint. */
export interface PurchaseLineRequestDto {
  tempId?: string;
  productId: string;
  productName: string;
  category?: ProductCategory;
  model: string;
  brand: string;
  version: string;
  vram: string;
  sn: string;
  condition: PurchaseCondition;
  inWarranty: boolean;
  warrantyDate?: string;
  repaired: boolean;
  gpuRisk: boolean;
  fullBox: boolean;
  /** Request rows are physical units, therefore this is always 1 after adaptation. */
  quantity: number;
  buyPrice: number;
  estSellPrice: number;
  warehouseLocation: string;
  remarks?: string;
}

/** Request shape mirrors the V1 `PurchaseInvoice` create payload. */
export interface PurchaseCreateRequestDto {
  date: string;
  sourceType: SourceType;
  sourcePartnerId?: string;
  sourcePartnerType?: PurchasePartnerType;
  supplierName: string;
  contact: string;
  expressNo?: string;
  paymentMethod: string;
  isPaid: boolean;
  vendorCreditAppliedAmount?: number;
  paidAmount: number;
  unpaidAmount: number;
  settlementAccountId?: string;
  settlementAccountName?: string;
  paymentHandler?: string;
  paymentStatus?: PurchasePaymentStatus;
  handleBy: string;
  remarks?: string;
  /** Existing media URLs only; the server binds them to the created purchase invoice. */
  images?: string[];
  items: PurchaseLineRequestDto[];
}

export type PurchaseUpdateRequestDto = Partial<PurchaseCreateRequestDto> & {
  expectedRecordVersion: number;
};

export interface PurchaseCreateResponseDto {
  data?: unknown;
  state?: unknown;
  stateMerge?: unknown;
  stateDelete?: unknown;
  meta?: unknown;
}

/** Feature-scoped purchase reference snapshot. */
export interface PurchaseReferenceStateResponseDto {
  data?: unknown;
  meta?: unknown;
}

/** Feature-scoped purchase detail snapshot. */
export interface PurchaseDetailStateResponseDto {
  data?: unknown;
  meta?: unknown;
}

/** Feature-scoped purchase list snapshot. */
export interface PurchaseListStateResponseDto {
  data?: unknown;
  meta?: unknown;
}

/** Raw response DTO is deliberately permissive; adapters are the only place that parse it. */
export interface PurchaseInvoiceResponseDto {
  id?: unknown;
  invoiceNo?: unknown;
  recordVersion?: unknown;
  date?: unknown;
  sourceType?: unknown;
  sourcePartnerId?: unknown;
  sourcePartnerType?: unknown;
  supplierName?: unknown;
  contact?: unknown;
  expressNo?: unknown;
  paymentMethod?: unknown;
  isPaid?: unknown;
  vendorCreditAppliedAmount?: unknown;
  paidAmount?: unknown;
  unpaidAmount?: unknown;
  settlementAccountId?: unknown;
  settlementAccountName?: unknown;
  paymentHandler?: unknown;
  paymentStatus?: unknown;
  handleBy?: unknown;
  remarks?: unknown;
  images?: unknown;
  items?: unknown;
  totalCount?: unknown;
  totalCost?: unknown;
  estTotalSell?: unknown;
  estTotalProfit?: unknown;
}
