import type {SystemUserAccount} from "./auth";
import type {CommissionAdjustment, CommissionMode, CommissionSettlementStatus} from "./commission";
import type {SalesReturnListItem} from "@/src/types/returns";

export type PurchaseCommissionStatus = CommissionSettlementStatus;
export type CommissionRuleCalculation = "fixed" | "tiered" | "amount_range";

export interface PurchaseCommissionRecord {
  id: string;
  inventoryId: string;
  sn: string;
  productId: string;
  productName: string;
  purchaseInvoiceNo?: string;
  salesInvoiceNo: string;
  purchaseHandler: string;
  salesHandler?: string;
  outboundHandler?: string;
  costPrice: number;
  salesPrice: number;
  grossProfit: number;
  rate: number;
  commissionAmount: number;
  purchaseRate?: number;
  purchaseCommissionAmount?: number;
  purchaseCalculationMethod?: CommissionRuleCalculation;
  salesRate?: number;
  salesCommissionAmount?: number;
  salesCalculationMethod?: CommissionRuleCalculation;
  status: PurchaseCommissionStatus;
  purchaseStatus?: PurchaseCommissionStatus;
  salesStatus?: PurchaseCommissionStatus;
  createdAt: string;
  settledAt?: string;
  purchaseSettledAt?: string;
  salesSettledAt?: string;
  purchaseSettledBy?: string;
  salesSettledBy?: string;
  purchaseSettlementBatchId?: string;
  salesSettlementBatchId?: string;
  commissionAdjustments?: CommissionAdjustment[];
  remarks?: string;
}

export type FinanceReturnReconcileItem = SalesReturnListItem & {reconcileType: "销售退货" | "进货退货"};

export interface FinanceCommissionItem {
  id: string;
  inventoryId: string;
  sn: string;
  productName: string;
  handler: string;
  handlerType: "采购经办人" | "销售经办人";
  documentNo: string;
  baseAmount?: number;
  salesPrice?: number;
  grossProfit?: number;
  rate?: number;
  commissionAmount?: number;
  originalCommissionAmount?: number;
  adjustmentAmount?: number;
  adjustments?: CommissionAdjustment[];
  calculationMethod?: CommissionRuleCalculation;
  status: string;
  createdAt: string;
  settledAt?: string;
  settledBy?: string;
  settlementBatchId?: string;
  remarks?: string;
}

export interface FinanceCommissionSummary {
  pendingCount: number;
  settledCount: number;
  voidedCount: number;
  handlerCount: number;
  originalCommission?: number;
  adjustmentAmount?: number;
  totalCommission?: number;
}

export interface FinanceCommissionPage extends PagedCollection<FinanceCommissionItem> {
  summary: FinanceCommissionSummary;
}

export type {CommissionAdjustment, CommissionMode, CommissionSettlementStatus};

export interface CustomerFundsTransaction {
  id: string;
  date: string;
  kind: string;
  label: string;
  documentNo?: string;
  amount: number;
  cashDirection: "in" | "out" | "none";
  payableDelta: number;
  receivableDelta: number;
  remarks?: string;
}

export interface CustomerFundsRow {
  id: string;
  partnerId?: string;
  name: string;
  partnerType: string;
  contactPerson?: string;
  phone?: string;
  creditLevel: string;
  paymentTermDays: number;
  payable: number;
  receivable: number;
  net: number;
  overduePayable: number;
  overdueReceivable: number;
  firstActivityDate?: string;
  lastActivityDate?: string;
  status: string;
  transactions: CustomerFundsTransaction[];
}

export interface CustomerFundsSnapshot {
  rows: CustomerFundsRow[];
  counts: {all: number; payable: number; receivable: number; balanced: number};
  currentBalance: {payable: number; receivable: number; net: number};
  previousBalance: {payable: number; receivable: number; net: number};
  cashTotals: {received: number; paid: number; difference: number};
  previousCashTotals: {received: number; paid: number; difference: number};
  trend: Array<{key: string; label: string; payable: number; receivable: number; net: number}>;
  generatedAt: string;
}

export interface SettingsUserItem {
  id: string;
  username: string;
  displayName: string;
  role: string;
  enabled: boolean;
  lastLoginTime?: string;
  remarks?: string;
  permissionOverrides?: SystemUserAccount["permissionOverrides"];
}

export interface AuditLogItem {
  id: string;
  user: string;
  time: string;
  module: string;
  type: string;
  target: string;
  beforeVal?: string;
  afterVal?: string;
}

export interface PagedCollection<T> {
  items: T[];
  meta: {page: number; pageSize: number; total: number; totalPages: number};
}
