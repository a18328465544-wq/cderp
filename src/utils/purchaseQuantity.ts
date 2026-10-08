import {PURCHASE_MAX_PHYSICAL_ITEMS, PURCHASE_PHYSICAL_LIMIT_MESSAGE} from "../types/purchase";

/** Missing legacy quantities mean one; an explicit incomplete/invalid draft never does. */
export function purchaseQuantity(value: number | null | undefined): number {
  const quantity = value === undefined ? 1 : value;
  return typeof quantity === "number" && Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 0;
}

/** Validate the whole batch before allocating any physical-unit rows. */
export function purchaseQuantityError(items: readonly {quantity?: number}[]): string | undefined {
  let total = 0;
  for (const item of items) {
    const quantity = purchaseQuantity(item.quantity);
    if (!quantity) return "采购商品数量必须为正整数";
    total += quantity;
    if (total > PURCHASE_MAX_PHYSICAL_ITEMS) return PURCHASE_PHYSICAL_LIMIT_MESSAGE;
  }
  return undefined;
}
