export function formatCurrency(value: number) {
  return new Intl.NumberFormat("zh-CN", {style: "currency", currency: "CNY", maximumFractionDigits: 0}).format(value);
}
