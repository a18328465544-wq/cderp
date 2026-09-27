import type {
  AccountTransferRecord,
  AftersalesRecord,
  AssemblyOperationRecord,
  AuditLog,
  CardInventory,
  CustomerCard,
  CrmFollowUpRecord,
  CrmQuote,
  CrmRequirement,
  FinanceLedger,
  InspectionRecord,
  MarketQuote,
  PaymentInRecord,
  PaymentOutRecord,
  ProductTemplate,
  PurchaseCommissionRecord,
  PurchaseInvoice,
  ReturnOrder,
  SalesInvoice,
  SettlementAccount,
  SettlementLedger,
  SystemUserAccount,
  Vendor,
} from "@/src/types/legacy";
import type {PublicStateResponseDto} from "../dto/state.dto";

export interface ErpStateSnapshot {
  products: ProductTemplate[];
  inventory: CardInventory[];
  inspections: InspectionRecord[];
  purchaseInvoices: PurchaseInvoice[];
  salesInvoices: SalesInvoice[];
  purchaseCommissions: PurchaseCommissionRecord[];
  marketQuotes: MarketQuote[];
  aftersales: AftersalesRecord[];
  customers: CustomerCard[];
  vendors: Vendor[];
  crmFollowUps: CrmFollowUpRecord[];
  crmRequirements: CrmRequirement[];
  crmQuotes: CrmQuote[];
  financeLedger: FinanceLedger[];
  settlementAccounts: SettlementAccount[];
  settlementLedger: SettlementLedger[];
  paymentInRecords: PaymentInRecord[];
  paymentOutRecords: PaymentOutRecord[];
  accountTransfers: AccountTransferRecord[];
  assemblyOperations: AssemblyOperationRecord[];
  returnOrders: ReturnOrder[];
  /** Minimal inventory reservations returned by reference endpoints. */
  returnReservations: ReturnInventoryReservation[];
  systemUsers: SystemUserAccount[];
  logs: AuditLog[];
  currentRole: string;
  currentUserId?: string;
}

export interface ReturnInventoryReservation {
  id: string;
  type: string;
  status: string;
  relatedDocNo: string;
  sourceInventoryIds: string[];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : value === null || value === undefined ? fallback : String(value);
}

function readCollection<T>(state: Record<string, unknown>, key: string): T[] {
  const value = state[key];
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")) as unknown as T[]
    : [];
}

export function adaptPublicState(response: PublicStateResponseDto): ErpStateSnapshot {
  const state = record(response.data);
  return {
    products: readCollection<ProductTemplate>(state, "products"),
    inventory: readCollection<CardInventory>(state, "inventory"),
    inspections: readCollection<InspectionRecord>(state, "inspections"),
    purchaseInvoices: readCollection<PurchaseInvoice>(state, "purchaseInvoices"),
    salesInvoices: readCollection<SalesInvoice>(state, "salesInvoices"),
    purchaseCommissions: readCollection<PurchaseCommissionRecord>(state, "purchaseCommissions"),
    marketQuotes: readCollection<MarketQuote>(state, "marketQuotes"),
    aftersales: readCollection<AftersalesRecord>(state, "aftersales"),
    customers: readCollection<CustomerCard>(state, "customers"),
    vendors: readCollection<Vendor>(state, "vendors"),
    crmFollowUps: readCollection<CrmFollowUpRecord>(state, "crmFollowUps"),
    crmRequirements: readCollection<CrmRequirement>(state, "crmRequirements"),
    crmQuotes: readCollection<CrmQuote>(state, "crmQuotes"),
    financeLedger: readCollection<FinanceLedger>(state, "financeLedger"),
    settlementAccounts: readCollection<SettlementAccount>(state, "settlementAccounts"),
    settlementLedger: readCollection<SettlementLedger>(state, "settlementLedger"),
    paymentInRecords: readCollection<PaymentInRecord>(state, "paymentInRecords"),
    paymentOutRecords: readCollection<PaymentOutRecord>(state, "paymentOutRecords"),
    accountTransfers: readCollection<AccountTransferRecord>(state, "accountTransfers"),
    assemblyOperations: readCollection<AssemblyOperationRecord>(state, "assemblyOperations"),
    returnOrders: readCollection<ReturnOrder>(state, "returnOrders"),
    returnReservations: readCollection<ReturnInventoryReservation>(state, "returnReservations"),
    systemUsers: readCollection<SystemUserAccount>(state, "systemUsers"),
    logs: readCollection<AuditLog>(state, "logs"),
    currentRole: text(state.currentRole, "未知角色"),
    currentUserId: text(state.currentUserId) || undefined,
  };
}
