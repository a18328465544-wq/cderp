import type {SalesFormValues, SalesLineFormValue, SalesOrderAmounts} from "@/src/types/sales";

export function isSalesLineFilled(item: Pick<SalesLineFormValue, "inventoryId" | "productId" | "productName" | "sellPrice" | "remarks">): boolean {
  return Boolean(item.inventoryId || item.productId || item.productName.trim() || item.sellPrice > 0 || item.remarks.trim());
}

export function filledSalesLines<T extends Pick<SalesLineFormValue, "inventoryId" | "productId" | "productName" | "sellPrice" | "remarks">>(items: readonly T[]): T[] {
  return items.filter(isSalesLineFilled);
}

export function normalizeSalesPaidAmount(paidAmount: number, totalAmount: number, paymentMode: "full" | "credit"): number {
  const total = Math.max(0, Math.round(totalAmount || 0));
  const current = Math.max(0, Math.round(paidAmount || 0));
  return paymentMode === "full" ? total : Math.min(current, total);
}

function normalizeSalesQuantity(quantity: number): number {
  return Math.max(1, Math.floor(quantity || 1));
}

export function calculateSalesLineTotal(quantity: number, sellPrice: number): number {
  return normalizeSalesQuantity(quantity) * Math.max(0, Math.round(sellPrice || 0));
}

export function calculateSalesUnitPrice(lineTotal: number, quantity: number): number {
  return Math.max(0, Math.round(Math.max(0, Math.round(lineTotal || 0)) / normalizeSalesQuantity(quantity)));
}

export function calculateSalesAmounts(values: Pick<SalesFormValues, "items" | "paidAmount">, includeCost: boolean): SalesOrderAmounts {
  const items = filledSalesLines(values.items);
  const quantity = items.reduce((sum, item) => sum + normalizeSalesQuantity(item.quantity), 0);
  const subtotal = items.reduce((sum, item) => sum + calculateSalesLineTotal(item.quantity, item.sellPrice), 0);
  const paidAmount = Math.max(0, Math.min(Math.round(values.paidAmount || 0), subtotal));
  const estimatedCost = includeCost && items.length > 0 && items.every((item) => item.costPrice !== undefined)
    ? items.reduce((sum, item) => sum + Math.round(item.costPrice || 0) * normalizeSalesQuantity(item.quantity), 0)
    : undefined;
  return {quantity, subtotal, paidAmount, unpaidAmount: subtotal - paidAmount, estimatedCost, estimatedProfit: estimatedCost === undefined ? undefined : subtotal - estimatedCost};
}
