import type {PaymentOutRecord} from "./finance-records";
import type {PurchaseItem} from "./purchase";
import type {SalesItem} from "./sales";
import type {AccountingDocumentStatus} from "./accounting";
import type {CardStatus} from "./core";

export const returnMenuValues = ["return_sales", "return_purchase", "return_orders"] as const;
export const returnOrderTypeValues = ["销售退货", "进货退货"] as const;
export const returnOrderStatusValues = ["待处理", "已完成", "已作废"] as const;
export const returnSettlementModeValues = ["原路退款", "抵扣账款", "直接冲销"] as const;
export const returnInventoryActionValues = ["退回待检测", "退回入库", "退回供应商", "直接报废"] as const;
export const salesReturnInventoryActionValues = ["退回待检测", "直接报废"] as const;
export const purchaseReturnInventoryActionValues = ["退回供应商", "直接报废"] as const;
export const returnResponsibilityValues = ["客户", "供应商", "平台", "本店", "其他"] as const;

export type ReturnOrderType = (typeof returnOrderTypeValues)[number];
export type ReturnOrderStatus = (typeof returnOrderStatusValues)[number];
export type ReturnSettlementMode = (typeof returnSettlementModeValues)[number];
export type ReturnInventoryAction = (typeof returnInventoryActionValues)[number];
export type ReturnResponsibility = (typeof returnResponsibilityValues)[number];

export interface ReturnRefundAllocation {
  sourcePaymentRecordId: string;
  accountId: string;
  accountName: string;
  paymentMethod: string;
  amount: number;
}

/**
 * Inventory lifecycle state captured before a completed return mutates the
 * card. It makes delete/reversal deterministic instead of guessing that every
 * returned purchase was already入库 or every returned sale belonged in发货区.
 */
export interface ReturnInventoryStateSnapshot {
  status: CardStatus;
  warehouseLocation: string;
  salesPrice?: number;
  salesTime?: string;
  salesInvoiceId?: string;
  buyerName?: string;
  remarks?: string;
}

/**
 * A return order may contain several physical inventory lines when the whole
 * source document is being returned. The snapshot is kept so a completed
 * return can still be reversed safely even after the source invoice changes.
 */
export interface ReturnOrderItem {
  sourceInventoryId: string;
  sourceSalesItemId?: string;
  sourceSalesItemIndex?: number;
  sourceSalesItemSnapshot?: SalesItem;
  sourcePurchaseItemId?: string;
  sourcePurchaseItemIndex?: number;
  sourcePurchaseItemSnapshot?: PurchaseItem;
  sourceInventorySnapshot?: ReturnInventoryStateSnapshot;
  productId?: string;
  productName?: string;
  sn?: string;
  amount: number;
}

export interface ReturnOrderBatchItemInput {
  sourceInventoryId: string;
  sourceSalesItemIndex?: number;
  sourcePurchaseItemIndex?: number;
}

/**
 * Safe, display-only projection of a physical line in a batch return.
 * Keep snapshots and settlement internals out of paginated list consumers.
 */
export interface ReturnOrderLineSummary {
  sourceInventoryId: string;
  sourceSalesItemIndex?: number;
  sourcePurchaseItemIndex?: number;
  productId?: string;
  productName: string;
  sn: string;
  amount: number;
}

export interface ReturnOrder {
  id: string;
  returnNo: string;
  accountingStatus?: AccountingDocumentStatus;
  accountingEventId?: string;
  type: ReturnOrderType;
  status: ReturnOrderStatus;
  date: string;
  relatedDocType: "销售单" | "采购单" | string;
  relatedDocNo: string;
  /** Present when one return order covers the whole source document. */
  batchMode?: "多件退货" | "整单退货";
  items?: ReturnOrderItem[];
  sourceInventoryId?: string;
  sourceSalesItemId?: string;
  sourceSalesItemIndex?: number;
  sourceSalesItemSnapshot?: SalesItem;
  sourcePurchaseItemId?: string;
  sourcePurchaseItemIndex?: number;
  sourcePurchaseItemSnapshot?: PurchaseItem;
  sourceInventorySnapshot?: ReturnInventoryStateSnapshot;
  productId?: string;
  productName?: string;
  sn?: string;
  partyId?: string;
  partyType?: "customer" | "vendor";
  partyName?: string;
  contact?: string;
  amount: number;
  settlementMode: ReturnSettlementMode;
  settlementAccountId?: string;
  settlementAccountName?: string;
  paymentRecordId?: string;
  refundPaymentRecordIds?: string[];
  refundAllocations?: ReturnRefundAllocation[];
  reversedPaymentSnapshot?: PaymentOutRecord;
  creditAmount?: number;
  vendorCreditAmount?: number;
  releasedVendorCreditAmount?: number;
  cashReleasedAmount?: number;
  handler: string;
  reason: string;
  responsibility?: ReturnResponsibility;
  inventoryAction: ReturnInventoryAction;
  completedAt?: string;
  remarks?: string;
}

export interface SalesReturnFormValues {
  date: string;
  relatedDocNo: string;
  sourceInventoryId: string;
  sourceSalesItemIndex: number;
  productId: string;
  productName: string;
  sn: string;
  partyName: string;
  partyId?: string;
  contact: string;
  amount: number;
  inventoryAction: Extract<ReturnInventoryAction, "退回待检测" | "直接报废">;
  reason: string;
  responsibility: "客户" | "供应商" | "平台" | "本店" | "其他";
  handler: string;
  remarks: string;
  returnScope?: "single" | "document";
  returnItems?: ReturnOrderBatchItemInput[];
}

export interface ReturnCreateResponse {
  data?: ReturnOrder;
  state?: unknown;
}

export type SalesReturnStatus = ReturnOrderStatus;

export interface SalesReturnListFilters {
  keyword: string;
  status: "" | SalesReturnStatus;
  page: number;
  pageSize: number;
  sortKey?: string;
  sortDirection?: "asc" | "desc";
}

export interface SalesReturnListItem {
  id: string;
  returnNo: string;
  type: "销售退货" | "进货退货";
  status: SalesReturnStatus;
  date: string;
  relatedDocNo: string;
  sourceInventoryId: string;
  /** All inventory cards covered by a whole-document return. */
  sourceInventoryIds?: string[];
  /** Batch marker preserved from the server so the list never looks like a single-item return. */
  batchMode?: "多件退货" | "整单退货";
  /** Physical lines projected for list/detail rendering. */
  returnItems?: ReturnOrderLineSummary[];
  productId: string;
  productName: string;
  sn: string;
  partyId: string;
  partyName: string;
  contact: string;
  amount: number;
  settlementMode: string;
  settlementAccountName: string;
  creditAmount: number;
  vendorCreditAmount: number;
  releasedVendorCreditAmount: number;
  cashReleasedAmount: number;
  handler: string;
  reason: string;
  responsibility: string;
  inventoryAction: string;
  completedAt: string;
  remarks: string;
}

export type PurchaseReturnListItem = SalesReturnListItem;
export type PurchaseReturnListFilters = SalesReturnListFilters;

export interface PurchaseReturnFormValues {
  date: string;
  relatedDocNo: string;
  sourceInventoryId: string;
  amount: number;
  settlementMode: "原路退款" | "抵扣账款" | "直接冲销";
  settlementAccountId: string;
  handler: string;
  reason: string;
  inventoryAction: "退回供应商" | "直接报废";
  remarks: string;
  returnScope?: "single" | "multiple" | "document";
  returnItems?: ReturnOrderBatchItemInput[];
}

export interface SalesReturnListDataset {
  items: SalesReturnListItem[];
  meta: {page: number; pageSize: number; total: number; totalPages: number};
}

export interface SalesReturnCompleteResult {
  id: string;
  returnNo: string;
  status: SalesReturnStatus;
  completedAt: string;
}
