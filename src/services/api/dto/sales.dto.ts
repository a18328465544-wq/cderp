export interface SalesCustomerListResponseDto {
  data?: unknown;
  meta?: unknown;
}

export interface SalesInventoryListResponseDto {
  data?: unknown;
  meta?: unknown;
}

export interface SalesProductCandidateDto {
  id?: unknown;
  productId?: unknown;
  productName?: unknown;
  category?: unknown;
  brand?: unknown;
  model?: unknown;
  version?: unknown;
  vram?: unknown;
  condition?: unknown;
  warehouse?: unknown;
  inventoryStatus?: unknown;
  inventoryQuantity?: unknown;
  reservedQuantity?: unknown;
  availableQuantity?: unknown;
  costPrice?: unknown;
  estimatedSellPrice?: unknown;
  entryTime?: unknown;
  inventoryDays?: unknown;
  imageUrl?: unknown;
  saleable?: unknown;
  unavailableReason?: unknown;
}

export interface SalesProductCandidatesResponseDto {
  data?: unknown;
}

export interface SalesSettlementAccountsResponseDto {
  data?: unknown;
  meta?: unknown;
}

export interface SalesCreateResponseDto {
  data?: unknown;
  stateMerge?: unknown;
  stateDelete?: unknown;
}

/** The sales update endpoint accepts a strict partial of the create contract. */
export type SalesUpdateRequestDto = Partial<SalesCreateRequestDto>;

/** Feature-scoped sales list/outbound snapshot. */
export interface SalesListStateResponseDto {
  data?: unknown;
  meta?: unknown;
}

export interface SalesOutboundResponseDto {
  data?: unknown;
  stateMerge?: unknown;
  stateDelete?: unknown;
}

export interface SalesOutboundPreflightResponseDto {
  data?: unknown;
}

export interface SalesOutboundRequestDto {
  handler: string;
  codes: string[];
  manual: boolean;
  remarks?: string;
}

export interface SalesCustomerDto {
  id?: unknown;
  accountType?: unknown;
  displayName?: unknown;
  normalizedName?: unknown;
  status?: unknown;
  level?: unknown;
  source?: unknown;
  primaryPhone?: unknown;
  primaryWechat?: unknown;
  primaryQq?: unknown;
  companyName?: unknown;
  roles?: unknown;
  legacyCustomer?: unknown;
  legacyVendor?: unknown;
}

export interface SalesSettlementAccountDto {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  balance?: unknown;
  availableBalance?: unknown;
  enabled?: unknown;
}

export interface SalesCreateItemDto {
  inventoryId: string;
  productId: string;
  productName: string;
  sn: string;
  condition: string;
  costPrice: number;
  sellPrice: number;
  profit: number;
  aftersalesTerms: string;
  remarks?: string;
}

export interface SalesCreateRequestDto {
  date: string;
  customerId?: string;
  customerPartnerType?: "customer" | "vendor";
  customerName: string;
  contact: string;
  channel: string;
  paymentMethod: string;
  isPaid: boolean;
  paidAmount: number;
  unpaidAmount: number;
  settlementAccountId?: string;
  settlementAccountName?: string;
  paymentHandler?: string;
  paymentStatus?: string;
  needInvoice: boolean;
  freeShipping: boolean;
  expressCompany?: string;
  expressNo?: string;
  aftersalesTerms: string;
  handleBy: string;
  remarks?: string;
  items: SalesCreateItemDto[];
}
