/** Only genuinely absent legacy source prices may fall back. Zero is a value. */
export function resolveReturnSourceAmount(sourceAmount: number | null | undefined, legacyAmount?: number | null) {
  return Number(sourceAmount ?? legacyAmount ?? 0);
}

/** Preserve the existing positive-price return policy on both command boundaries. */
export function isValidReturnAmount(amount: number) {
  return Number.isFinite(amount) && amount > 0;
}

export const returnSourceAmountBlockedReason = "原单退货明细金额必须为大于 0 的有效数字，请先核对原单。";
