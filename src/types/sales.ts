import type {CustomerPickerOption, CustomerPartnerType} from "./customer";
import type {AccountingDocumentStatus} from "./accounting";

export interface SalesItem {
  inventoryId: string;
  productId: string;
  productName: string;
  sn: string;
  condition: string;
  quantity?: number;
  costPrice: number;
  sellPrice: number;
  profit: number;
  aftersalesTerms: string;
  remarks?: string;
}

export interface SalesInvoice {
  id: string;
  invoiceNo: string;
  accountingStatus?: AccountingDocumentStatus;
  accountingEventId?: string;
  date: string;
  customerId?: string;
  customerPartnerType?: CustomerPartnerType;
  customerName: string;
  contact: string;
  channel: SalesChannel;
  paymentMethod: SalesPaymentMethod;
  isPaid: boolean;
  paidAmount: number;
  unpaidAmount: number;
  settlementAccountId?: string;
  settlementAccountName?: string;
  paymentHandler?: string;
  paymentStatus?: SalesPaymentStatus;
  outboundStatus?: SalesOutboundStatus;
  outboundTime?: string;
  outboundHandler?: string;
  outboundRemarks?: string;
  needInvoice: boolean;
  freeShipping: boolean;
  expressCompany?: string;
  expressNo?: string;
  aftersalesTerms: string;
  handleBy: string;
  remarks?: string;
  items: SalesItem[];
  totalCount: number;
  totalCost: number;
  totalAmount: number;
  totalProfit: number;
}

export const salesChannelValues = ["到店", "闲鱼", "抖音", "小红书", "B站", "微信私域", "同行网店"] as const;
export const salesPaymentMethodValues = ["微信", "支付宝", "现金", "银行卡", "账期欠款"] as const;
export const salesPaymentStatusValues = ["未收款", "部分收款", "已收款", "已退款"] as const;
export const salesOutboundStatusValues = ["待出库", "已出库"] as const;

export type SalesChannel = (typeof salesChannelValues)[number];
export type SalesPaymentMethod = (typeof salesPaymentMethodValues)[number];
export type SalesPartnerType = CustomerPartnerType;
export type SalesPaymentStatus = (typeof salesPaymentStatusValues)[number];
export type SalesOutboundStatus = (typeof salesOutboundStatusValues)[number];
export type SalesListSortKey = "date" | "invoiceNo" | "customerName" | "totalCount" | "totalAmount" | "totalProfit" | "paymentStatus" | "outboundStatus" | "handleBy";
export type SalesListSortDirection = "asc" | "desc";

export interface SalesListFilters {
  keyword: string;
  channel: "" | SalesChannel;
  paymentStatus: "" | SalesPaymentStatus;
  outboundStatus: "" | SalesOutboundStatus;
  dateStart: string;
  dateEnd: string;
  page: number;
  pageSize: number;
  sortKey: SalesListSortKey;
  sortDirection: SalesListSortDirection;
}

export interface SalesListLine {
  id: string;
  /** Model identity is kept so an editable sales draft can round-trip without guessing from the label. */
  productId?: string;
  productName: string;
  brand?: string;
  model?: string;
  version?: string;
  vram?: string;
  inventoryId?: string;
  sn: string;
  condition: string;
  quantity: number;
  sellPrice: number;
  costPrice?: number;
  profit?: number;
  aftersalesTerms: string;
  remarks: string;
}

export interface SalesListItem {
  id: string;
  invoiceNo: string;
  date: string;
  customerId?: string;
  customerPartnerType?: SalesPartnerType;
  customerName: string;
  contact: string;
  channel: SalesChannel;
  paymentMethod: string;
  paymentStatus: SalesPaymentStatus;
  outboundStatus: SalesOutboundStatus;
  outboundTime: string;
  outboundHandler: string;
  totalCount: number;
  totalAmount: number;
  totalCost?: number;
  totalProfit?: number;
  paidAmount: number;
  unpaidAmount: number;
  settlementAccountId?: string;
  settlementAccountName?: string;
  paymentHandler?: string;
  linkedInventoryCount: number;
  needInvoice: boolean;
  freeShipping: boolean;
  expressCompany: string;
  expressNo: string;
  aftersalesTerms: string;
  handleBy: string;
  remarks: string;
  productSummary: string;
  searchText: string;
  lines: SalesListLine[];
}

export interface SalesListDataset {
  items: SalesListItem[];
  source: "state-snapshot" | "database-page";
  selection?: SalesListSelection;
}

export interface SalesListSelection {
  data: SalesListItem[];
  filteredItems: SalesListItem[];
  meta: {total: number; page: number; pageSize: number; totalPages: number};
  summary: {
    orderCount: number;
    unitCount: number;
    pendingPaymentCount: number;
    pendingOutboundCount: number;
    totalAmount: number;
    totalProfit?: number;
  };
}

export interface SalesOutboundInventoryItem {
  id: string;
  serialNumber: string;
  productId: string;
  productName: string;
  productIdentityKey: string;
  status: string;
  condition: string;
  warehouse: string;
}

export interface SalesOutboundLine {
  id: string;
  productId: string;
  productName: string;
  productIdentityKey: string;
  inventoryId: string;
  serialNumber: string;
  sellPrice: number;
}

export interface SalesOutboundInvoice {
  id: string;
  invoiceNo: string;
  date: string;
  customerName: string;
  contact: string;
  totalCount: number;
  totalAmount: number;
  freeShipping: boolean;
  expressCompany: string;
  expressNo: string;
  remarks: string;
  lines: SalesOutboundLine[];
  searchText: string;
}

export interface SalesOutboundDataset {
  invoices: SalesOutboundInvoice[];
  inventory: SalesOutboundInventoryItem[];
  source: "state-snapshot" | "database-page";
  meta?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    summary: {
      pendingItemCount: number;
      pendingAmount: number;
    };
  };
}

export interface SalesOutboundFilters {
  keyword: string;
  page: number;
  pageSize: number;
}

export interface SalesOutboundVerificationRow {
  lineId: string;
  productName: string;
  matchedInventory?: SalesOutboundInventoryItem;
  verified: boolean;
  reason: string;
}

export interface SalesOutboundVerification {
  rows: SalesOutboundVerificationRow[];
  expectedCount: number;
  verifiedCount: number;
  unknownCodes: string[];
  duplicateCodes: string[];
  ready: boolean;
}

export interface SalesOutboundPreflightRow {
  lineId: string;
  productName: string;
  inventoryId: string;
  serialNumber: string;
  matched: boolean;
  reason: string;
}

export interface SalesOutboundPreflightResult {
  invoiceId: string;
  invoiceNo: string;
  expectedCount: number;
  matchedCount: number;
  ready: boolean;
  unknownCodes: string[];
  duplicateCodes: string[];
  rows: SalesOutboundPreflightRow[];
}

export interface SalesOutboundRequest {
  handler: string;
  codes: string[];
  manual: boolean;
  remarks: string;
}

export interface SalesOutboundResult {
  id: string;
  invoiceNo: string;
  outboundStatus: string;
  outboundTime: string;
  outboundHandler: string;
}

export interface SalesCustomerOption extends CustomerPickerOption {}

export interface SalesInventoryCandidate {
  id: string;
  productId: string;
  productName: string;
  category: string;
  brand: string;
  model: string;
  version: string;
  vram: string;
  serialNumber: string;
  condition: string;
  warehouse: string;
  inventoryStatus: string;
  costPrice?: number;
  estimatedSellPrice?: number;
  entryTime: string;
  inventoryDays: number;
  imageUrl?: string;
  saleable: boolean;
  unavailableReason?: string;
}

/** Product-level sales picker option. Physical SN binding happens at outbound. */
export interface SalesProductCandidate {
  id: string;
  productId: string;
  productName: string;
  category: string;
  brand: string;
  model: string;
  version: string;
  vram: string;
  condition: string;
  warehouse: string;
  inventoryStatus: string;
  inventoryQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  /** False for a restored selection until current inventory availability is queried. */
  availabilityKnown?: boolean;
  costPrice?: number;
  estimatedSellPrice?: number;
  entryTime: string;
  inventoryDays: number;
  imageUrl?: string;
  saleable: boolean;
  unavailableReason?: string;
}

export interface SalesSettlementAccountOption {
  id: string;
  name: string;
  type: string;
  balance?: number;
  availableBalance?: number;
  enabled: boolean;
}

export interface SalesLineFormValue {
  inventoryId: string;
  productId: string;
  productName: string;
  brand: string;
  model: string;
  vram: string;
  condition: string;
  quantity: number;
  sellPrice: number;
  costPrice?: number;
  remarks: string;
  aftersalesTerms: string;
}

export interface SalesFormValues {
  date: string;
  customerId: string;
  customerPartnerType: SalesPartnerType;
  customerName: string;
  contact: string;
  channel: SalesChannel;
  paymentMethod: SalesPaymentMethod;
  settlementAccountId: string;
  paidAmount: number;
  needInvoice: boolean;
  freeShipping: boolean;
  expressCompany: string;
  expressNo: string;
  aftersalesTerms: string;
  handleBy: string;
  paymentHandler: string;
  remarks: string;
  items: SalesLineFormValue[];
}

export interface SalesInvoiceResult {
  id: string;
  invoiceNo: string;
  date: string;
  customerName: string;
  totalCount: number;
  totalAmount: number;
  totalCost?: number;
  totalProfit?: number;
  paidAmount: number;
  unpaidAmount: number;
  paymentStatus: string;
  outboundStatus: string;
}

/** Full response used by the sales edit flow; all fields are still permission-redacted by the adapter. */
export interface SalesMutationResult {
  invoice: SalesInvoice;
  summary: SalesInvoiceResult;
}

export interface SalesOrderAmounts {
  quantity: number;
  subtotal: number;
  paidAmount: number;
  unpaidAmount: number;
  estimatedCost?: number;
  estimatedProfit?: number;
}
