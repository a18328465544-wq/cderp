import {Card, CardContent} from "@/src/components/ui";
import {ErpStatusBadge} from "@/src/components/common";
import {formatCurrency} from "@/src/lib/format";
import {cn} from "@/src/lib/cn";
import type {SalesOrderAmounts} from "@/src/types/sales";

export function SalesAmountSummary({amounts, showCost, compact = false, embedded = false}: {amounts: SalesOrderAmounts; showCost: boolean; compact?: boolean; embedded?: boolean}) {
  if (embedded) return <dl className="space-y-2 text-xs">
    <div className="flex items-center justify-between"><dt className="text-[var(--erp-color-text-secondary)]">商品数量</dt><dd className="erp-data-number font-semibold">{amounts.quantity} 件</dd></div>
    <div className="flex items-center justify-between"><dt className="text-[var(--erp-color-text-secondary)]">销售总额</dt><dd className="erp-data-number text-sm font-semibold text-[var(--erp-color-primary)]">{formatCurrency(amounts.subtotal)}</dd></div>
    {showCost ? <div className="flex items-center justify-between"><dt className="text-[var(--erp-color-text-secondary)]">预计利润</dt><dd className="erp-data-number text-base font-semibold text-[var(--erp-color-success)]">{amounts.estimatedProfit === undefined ? "—" : formatCurrency(amounts.estimatedProfit)}</dd></div> : null}
    <div className="flex items-center justify-between border-t border-[var(--erp-color-border)] pt-2"><dt className="text-[var(--erp-color-text-secondary)]">已收 / 未收</dt><dd className="erp-data-number text-[var(--erp-color-text-secondary)]">{formatCurrency(amounts.paidAmount)} / {formatCurrency(amounts.unpaidAmount)}</dd></div>
  </dl>;
  return <Card className="border-[var(--erp-color-border-strong)] bg-[var(--erp-color-info-soft)]"><CardContent className={cn("grid gap-4 p-4 sm:grid-cols-2", !compact && "xl:grid-cols-5")}><div><p className="text-xs text-[var(--erp-color-text-muted)]">商品数量</p><p className="mt-1 erp-data-number text-xl font-semibold text-[var(--erp-color-text)]">{amounts.quantity} 件</p></div><div><p className="text-xs text-[var(--erp-color-text-muted)]">销售应收</p><p className="mt-1 erp-data-number text-xl font-semibold text-[var(--erp-color-text)]">{formatCurrency(amounts.subtotal)}</p></div><div><p className="text-xs text-[var(--erp-color-text-muted)]">已收金额</p><p className="mt-1 erp-data-number text-xl font-semibold text-[var(--erp-color-success)]">{formatCurrency(amounts.paidAmount)}</p></div><div><p className="text-xs text-[var(--erp-color-text-muted)]">未收金额</p><p className="mt-1 erp-data-number text-xl font-semibold text-[var(--erp-color-warning)]">{formatCurrency(amounts.unpaidAmount)}</p></div>{showCost ? <div><p className="text-xs text-[var(--erp-color-text-muted)]">预计利润</p><p className="mt-1 erp-data-number text-xl font-semibold text-[var(--erp-color-success)]">{amounts.estimatedProfit === undefined ? "—" : formatCurrency(amounts.estimatedProfit)}</p><div className="mt-1"><ErpStatusBadge label="仅作预览，服务端重算" tone="neutral" /></div></div> : null}</CardContent></Card>;
}
