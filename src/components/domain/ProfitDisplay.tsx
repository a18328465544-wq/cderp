import {formatCurrency} from "@/src/lib/format";

export function ProfitDisplay({value}: {value: number | undefined}) {
  if (value === undefined) return <span className="erp-data-number text-[var(--erp-color-text-muted)]">—</span>;
  return <span className={value >= 0 ? "erp-data-number font-semibold text-[var(--erp-color-success)]" : "erp-data-number font-semibold text-[var(--erp-color-danger)]"}>{value >= 0 ? "+" : ""}{formatCurrency(value)}</span>;
}
