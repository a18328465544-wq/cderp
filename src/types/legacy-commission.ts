/**
 * Compatibility commission contracts used by the state adapter.
 * New finance API code should prefer src/types/finance-remaining.ts.
 */
import type {CommissionAdjustment, CommissionSettlementStatus} from "./commission";
import type {AccountingDocumentStatus} from "./accounting";
export type {CommissionAdjustment, CommissionMode, CommissionSettlementStatus} from "./commission";

export type PurchaseCommissionStatus = CommissionSettlementStatus;

export const commissionRuleCalculationValues = ["fixed", "tiered", "amount_range"] as const;
export const commissionRuleBaseValues = ["purchase_amount_incl_tax", "purchase_amount_excl_tax", "sales_amount_incl_tax", "sales_amount_excl_tax", "profit"] as const;
export const commissionPayoutMethodValues = ["instant", "single"] as const;
export const commissionPayoutCycleValues = ["monthly", "per_order"] as const;

export type CommissionRuleCalculation = (typeof commissionRuleCalculationValues)[number];
export type CommissionRuleBase = (typeof commissionRuleBaseValues)[number];
export type CommissionPayoutMethod = (typeof commissionPayoutMethodValues)[number];
export type CommissionPayoutCycle = (typeof commissionPayoutCycleValues)[number];

export interface CommissionRuleTier {
  minAmount: number;
  maxAmount?: number;
  rate?: number;
  amount?: number;
}

export interface CommissionRule {
  calculation: CommissionRuleCalculation;
  fixedRate: number;
  tiers: CommissionRuleTier[];
  base: CommissionRuleBase;
  targets: {
    purchaseHandler: boolean;
    salesHandler: boolean;
    warehouseManager: boolean;
    customMemberIds: string[];
  };
  onlyCompleted: boolean;
  adjustOnReturn: boolean;
  linkSupplier: boolean;
  capEnabled: boolean;
  capRate: number;
  payoutMethod: CommissionPayoutMethod;
  payoutCycle: CommissionPayoutCycle;
  effectiveDate: string;
}

export interface CommissionRules {
  purchase: CommissionRule;
  sales: CommissionRule;
  updatedAt: string;
}

export interface CommissionCalculationResult {
  amount: number;
  rate: number;
  baseAmount: number;
  method: CommissionRuleCalculation;
}

export interface PurchaseCommissionRecord {
  id: string;
  accountingStatus?: AccountingDocumentStatus;
  accountingEventId?: string;
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
