export type CommissionMode = "purchase" | "sales";

export type CommissionSettlementStatus = "待结算" | "已结算" | "已冲销";

export type CommissionAdjustmentReason = "销售退货" | "手工调整";

/**
 * A commission amount is never overwritten when a later business event changes it.
 * Adjustments are append-only so the detail view can explain why the payable amount changed.
 */
export interface CommissionAdjustment {
  id: string;
  mode: CommissionMode;
  amount: number;
  reason: CommissionAdjustmentReason;
  documentNo?: string;
  note?: string;
  createdAt: string;
  createdBy: string;
}
