export interface PurchaseReturnPreview {
  resultingTotal: number;
  cashRefundAmount: number;
  payableOffset: number;
  releasedVendorCredit: number;
  vendorCreditIncrease: number;
  paidAfter: number;
  unpaidAfter: number;
}

function amount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function calculatePurchaseReturnPreview(input: {
  totalCost: number;
  paidAmount: number;
  unpaidAmount: number;
  vendorCreditAppliedAmount?: number;
  returnAmount: number;
  settlementMode: "原路退款" | "抵扣账款" | "直接冲销";
}): PurchaseReturnPreview {
  const totalCost = amount(input.totalCost);
  const paid = amount(input.paidAmount);
  const unpaid = amount(input.unpaidAmount);
  const appliedCredit = amount(input.vendorCreditAppliedAmount);
  const returned = amount(input.returnAmount);
  const resultingTotal = Math.max(0, totalCost - returned);
  let remaining = returned;
  const payableOffset = Math.min(unpaid, remaining);
  remaining -= payableOffset;
  const releasedVendorCredit = Math.min(appliedCredit, remaining);
  remaining -= releasedVendorCredit;
  const cashRefundAmount = Math.min(paid, remaining);
  const paidAfter = Math.max(0, paid - cashRefundAmount);
  const creditAfter = Math.max(0, appliedCredit - releasedVendorCredit);
  return {
    resultingTotal,
    cashRefundAmount,
    payableOffset,
    releasedVendorCredit,
    vendorCreditIncrease: input.settlementMode === "抵扣账款" ? releasedVendorCredit + cashRefundAmount : 0,
    paidAfter,
    unpaidAfter: Math.max(0, resultingTotal - paidAfter - creditAfter),
  };
}

export function canDirectWriteOffPurchase(input: {
  totalCost: number;
  returnAmount: number;
  vendorCreditAppliedAmount?: number;
  paidAmount: number;
  linkedPayments: Array<{amount: number; businessType: string}>;
}) {
  return Math.abs(amount(input.totalCost) - amount(input.returnAmount)) < 0.01
    && amount(input.vendorCreditAppliedAmount) <= 0.009
    && input.linkedPayments.length === 1
    && input.linkedPayments[0]?.businessType === "采购付款"
    && Math.abs(amount(input.linkedPayments[0]?.amount) - amount(input.paidAmount)) < 0.01;
}
