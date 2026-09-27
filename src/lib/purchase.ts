import type {PurchaseFormValues, PurchaseLineFormValue, PurchaseSettlement, PurchaseSummary} from "@/src/types/purchase";

const MONEY_SCALE = 100;

type PurchaseLineCalculationInput = Pick<PurchaseLineFormValue, "productId" | "productName" | "buyPrice" | "estSellPrice" | "remarks" | "quantity">;

/** Normalize user-entered money without allowing floating point drift. */
export function normalizePurchaseMoney(value: number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed * MONEY_SCALE) / MONEY_SCALE : 0;
}

export function purchaseQuantity(value: number | null | undefined): number {
  const parsed = Number(value ?? 1);
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(1, Math.floor(parsed)) : 1;
}

export function isPurchaseLineFilled(item: Pick<PurchaseLineFormValue, "productId" | "productName" | "buyPrice" | "estSellPrice" | "remarks">): boolean {
  return Boolean(item.productId || item.productName.trim() || item.buyPrice > 0 || item.estSellPrice > 0 || item.remarks.trim());
}

export function filledPurchaseLines<T extends PurchaseLineCalculationInput>(items: readonly T[]): T[] {
  return items.filter(isPurchaseLineFilled);
}

export function calculatePurchaseSummary(items: readonly PurchaseLineCalculationInput[]): PurchaseSummary {
  return filledPurchaseLines(items).reduce<PurchaseSummary>((summary, item) => {
    const quantity = purchaseQuantity(item.quantity);
    const totalCost = normalizePurchaseMoney(item.buyPrice) * quantity;
    const estTotalSell = normalizePurchaseMoney(item.estSellPrice) * quantity;
    return {
      totalCount: summary.totalCount + quantity,
      totalCost: normalizePurchaseMoney(summary.totalCost + totalCost),
      estTotalSell: normalizePurchaseMoney(summary.estTotalSell + estTotalSell),
      estTotalProfit: normalizePurchaseMoney(summary.estTotalSell + estTotalSell - summary.totalCost - totalCost),
    };
  }, {totalCount: 0, totalCost: 0, estTotalSell: 0, estTotalProfit: 0});
}

/** Expand a draft line into the physical-unit rows expected by the existing API. */
export function expandPurchaseLines(items: readonly PurchaseLineFormValue[]): PurchaseLineFormValue[] {
  return filledPurchaseLines(items).flatMap((item) => {
    const quantity = purchaseQuantity(item.quantity);
    return Array.from({length: quantity}, (_, copyIndex) => ({
      ...item,
      tempId: copyIndex === 0 ? item.tempId : `${item.tempId || "line"}-${copyIndex + 1}`,
      quantity: 1,
    }));
  });
}

export function calculatePurchaseSettlement(totalCost: number, paidAmount: number, vendorCreditAppliedAmount: number): PurchaseSettlement {
  const total = normalizePurchaseMoney(totalCost);
  const paid = normalizePurchaseMoney(paidAmount);
  const credit = normalizePurchaseMoney(vendorCreditAppliedAmount);
  const unpaid = normalizePurchaseMoney(Math.max(0, total - paid - credit));
  const overpaid = paid + credit > total + 0.009;
  const isPaid = !overpaid && unpaid <= 0;
  return {
    paidAmount: paid,
    vendorCreditAppliedAmount: credit,
    unpaidAmount: unpaid,
    isPaid,
    paymentStatus: isPaid ? "已付款" : paid > 0 || credit > 0 ? "部分付款" : "未付款",
    overpaid,
  };
}

export function purchaseTotalCost(values: Pick<PurchaseFormValues, "items">): number {
  return calculatePurchaseSummary(values.items).totalCost;
}
