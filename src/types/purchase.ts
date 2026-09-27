import type {CardInventory, ProductCategory, SourceType} from "./core";
import type {CustomerLevel, CustomerPickerOption, CustomerPartnerType} from "./customer";
import type {AccountingDocumentStatus} from "./accounting";

export interface PurchaseItem {
  tempId: string;
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
  quantity?: number;
  buyPrice: number;
  estSellPrice: number;
  warehouseLocation: string;
  remarks?: string;
}

export interface PurchaseInvoice {
  id: string;
  invoiceNo: string;
  accountingStatus?: AccountingDocumentStatus;
  accountingEventId?: string;
  /** Optimistic-lock version for safe historical edits; legacy records start at 1. */
  recordVersion?: number;
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
  images?: string[];
  items: PurchaseItem[];
  totalCount: number;
  totalCost: number;
  estTotalSell: number;
  estTotalProfit: number;
}

export type PurchaseCondition = CardInventory["condition"];
export type PurchasePartnerType = CustomerPartnerType;
export const purchasePersonalSourceValues = ["个人回收", "客户置换"] as const;
export type PurchasePersonalSource = (typeof purchasePersonalSourceValues)[number];
export const purchasePaymentMethodValues = ["微信", "支付宝", "现金", "银行卡", "货到付款", "账期欠款"] as const;
export const purchasePaymentStatusValues = ["未付款", "部分付款", "已付款", "已退款"] as const;
export type PurchasePaymentStatus = (typeof purchasePaymentStatusValues)[number];
export type PurchaseListSortKey = "date" | "invoiceNo" | "supplierName" | "totalCount" | "totalCost" | "paymentStatus" | "handleBy";
export type PurchaseListSortDirection = "asc" | "desc";

export interface PurchaseListFilters {
  keyword: string;
  sourceType: "" | SourceType;
  paymentStatus: "" | PurchasePaymentStatus;
  dateStart: string;
  dateEnd: string;
  page: number;
  pageSize: number;
  sortKey: PurchaseListSortKey;
  sortDirection: PurchaseListSortDirection;
}

export interface PurchaseListItem {
  id: string;
  invoiceNo: string;
  date: string;
  sourcePartnerId?: string;
  sourcePartnerType?: PurchasePartnerType;
  supplierName: string;
  sourceType: SourceType;
  totalCount: number;
  /** Exposed so list actions can open the same outstanding-payment flow as detail. */
  paidAmount?: number;
  unpaidAmount?: number;
  settlementAccountId?: string;
  totalCost?: number;
  estTotalSell?: number;
  estTotalProfit?: number;
  paymentStatus: PurchasePaymentStatus;
  handleBy: string;
  inventoryCount: number;
  hasImages: boolean;
  productSummary: string;
  searchText: string;
}

export interface PurchaseListDataset {
  items: PurchaseListItem[];
  source: "state-snapshot" | "database-page";
  selection?: PurchaseListSelection;
}

export interface PurchaseListSelection {
  data: PurchaseListItem[];
  filteredItems: PurchaseListItem[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  summary: {
    orderCount: number;
    unitCount: number;
    pendingPaymentCount: number;
    totalCost?: number;
    estimatedProfit?: number;
  };
}

/**
 * The form model is intentionally different from the API request model.
 * Quantity is a line-level editing value; the request adapter expands it
 * into one inventory row per physical unit before submission.
 */
export interface PurchaseLineFormValue {
  tempId?: string;
  productId: string;
  productName: string;
  category: ProductCategory;
  model: string;
  brand: string;
  version: string;
  vram: string;
  sn: string;
  condition: PurchaseCondition;
  inWarranty: boolean;
  warrantyDate: string;
  repaired: boolean;
  gpuRisk: boolean;
  fullBox: boolean;
  quantity: number;
  buyPrice: number;
  estSellPrice: number;
  warehouseLocation: string;
  remarks: string;
}

export interface PurchaseFormValues {
  date: string;
  sourceType: SourceType;
  sourcePartnerId: string;
  sourcePartnerType: PurchasePartnerType;
  supplierName: string;
  contact: string;
  expressNo: string;
  paymentMethod: string;
  /** User-facing toggle; final status is derived from the settlement amounts. */
  isPaid: boolean;
  settlementAccountId: string;
  paidAmount: number;
  vendorCreditAppliedAmount: number;
  paymentHandler: string;
  handleBy: string;
  remarks: string;
  /** Uploaded media URLs only; transient File/Blob/Data URL state stays in the purchase media hook. */
  images?: string[];
  items: PurchaseLineFormValue[];
}

export interface PurchaseSummary {
  totalCount: number;
  totalCost: number;
  estTotalSell: number;
  estTotalProfit: number;
}

export interface PurchaseSettlement {
  paidAmount: number;
  vendorCreditAppliedAmount: number;
  unpaidAmount: number;
  isPaid: boolean;
  paymentStatus: PurchasePaymentStatus;
  overpaid: boolean;
}

export interface PurchaseProductOption {
  id: string;
  name: string;
  category: ProductCategory;
  model: string;
  brand: string;
  version: string;
  vram: string;
  refBuyPrice?: number;
  refSellPrice?: number;
  currentStock?: number;
  imageUrls?: string[];
}

export interface PurchaseSourceOption extends CustomerPickerOption {
  partnerCategory?: "个人" | "同行";
  level?: CustomerLevel;
  returnCreditBalance?: number;
}

export interface PurchaseSettlementAccountOption {
  id: string;
  name: string;
  type: string;
  balance?: number;
  availableBalance?: number;
  enabled: boolean;
}

export interface PurchaseReferenceData {
  /** Page-load projection of the next server sequence; the server remains collision-authoritative. */
  nextInvoiceNo: string;
  products: PurchaseProductOption[];
  sources: PurchaseSourceOption[];
  settlementAccounts: PurchaseSettlementAccountOption[];
  warehouses: string[];
  capabilities: {
    hasProductCatalog: boolean;
    hasSourceCandidates: boolean;
    hasSettlementAccounts: boolean;
    hasWarehouseEndpoint: boolean;
  };
}

export interface PurchaseCreateResult {
  invoice: PurchaseInvoice;
  /** Kept as `data` for the existing page boundary during Phase 1. */
  data: PurchaseInvoice;
  state?: unknown;
  stateMerge?: unknown;
  stateDelete?: unknown;
}

export interface PurchaseDetailInventoryItem {
  id: string;
  productName: string;
  sn: string;
  status: string;
  warehouseLocation: string;
  hasInspection: boolean;
}

export interface PurchaseDetailPaymentRecord {
  id: string;
  amount: number;
  accountName: string;
  paymentMethod: string;
  handler: string;
  time: string;
}

/**
 * Read-only purchase detail assembled from the existing scoped state snapshot.
 * The backend does not currently expose a dedicated purchase detail endpoint.
 */
export interface PurchaseDetail {
  invoice: PurchaseInvoice;
  inventory: PurchaseDetailInventoryItem[];
  payments: PurchaseDetailPaymentRecord[];
  inspectionCount: number;
  completedReturnCount: number | null;
  paymentCount: number | null;
  source: "state-snapshot" | "database-detail";
}
