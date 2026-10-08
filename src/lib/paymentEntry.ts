/** UI intent only. Commands keep the existing paidAmount/isPaid fields;
 * switching intent must never invent a deposit percentage. */
export type PaymentEntryMode = "full" | "none" | "partial";
export type PaymentEntryFeedback = {ready: boolean; reason?: string};

export function inferPaymentEntryMode(paid: number, total: number, emptyFull = true): PaymentEntryMode {
  if (total <= 0 && paid <= 0) return emptyFull ? "full" : "none";
  if (paid <= 0) return "none";
  return Math.abs(paid - total) < 0.005 ? "full" : "partial";
}

export function paymentAmountForMode(mode: PaymentEntryMode, paid: number, total: number) {
  if (mode === "full") return Math.max(0, total);
  if (mode === "none") return 0;
  return paid > 0 && paid < total ? paid : 0;
}

export function paymentEntryFeedback(mode: PaymentEntryMode, paid: number, total: number, action: "收款" | "付款"): PaymentEntryFeedback {
  if (mode === "partial" && (paid <= 0 || paid >= total)) return {ready: false, reason: `请输入大于 0 且小于本单总额的部分${action}金额`};
  return {ready: true};
}
