import {Card, CardContent} from "@/src/components/ui";
import {ErpStatusBadge} from "@/src/components/common";
import {formatCurrency} from "@/src/lib/format";
import {cn} from "@/src/lib/cn";
import type {PurchaseSettlement, PurchaseSummary} from "@/src/types/purchase";

export function PurchaseAmountSummary({summary, settlement, canEnterCost, showProfit, compact = false, embedded = false}: {summary: PurchaseSummary; settlement: PurchaseSettlement; canEnterCost: boolean; showProfit: boolean; compact?: boolean; embedded?: boolean}) {
  if (embedded) return <dl className="space-y-2 text-xs">
    <div className="flex items-center justify-between"><dt className="text-[var(--erp-color-text-secondary)]">总数量</dt><dd className="erp-data-number font-semibold">{summary.totalCount} 件</dd></div>
    <div className="flex items-center justify-between"><dt className="text-[var(--erp-color-text-secondary)]">采购总成本</dt><dd className="erp-data-number text-sm font-semibold text-[var(--erp-color-primary)]">{canEnterCost ? formatCurrency(summary.totalCost) : "—"}</dd></div>
    {showProfit ? <div className="flex items-center justify-between"><dt className="text-[var(--erp-color-text-secondary)]">预估销售总额</dt><dd className="erp-data-number font-semibold">{formatCurrency(summary.estTotalSell)}</dd></div> : null}
    {canEnterCost && showProfit ? <div className="flex items-center justify-between border-t border-[var(--erp-color-border)] pt-2"><dt className="text-[var(--erp-color-text-secondary)]">预计毛利</dt><dd className="erp-data-number text-base font-semibold text-[var(--erp-color-success)]">{formatCurrency(summary.estTotalProfit)}</dd></div> : null}
    <div className="flex items-center justify-between"><dt className="text-[var(--erp-color-text-secondary)]">现金 / 抵扣 / 未付</dt><dd className="erp-data-number text-[var(--erp-color-text-secondary)]">{canEnterCost ? formatCurrency(settlement.paidAmount) : "—"} / {formatCurrency(settlement.vendorCreditAppliedAmount)} / {canEnterCost ? formatCurrency(settlement.unpaidAmount) : "—"}</dd></div>
  </dl>;
  return <Card className="border-[var(--erp-color-border-strong)] bg-[var(--erp-color-info-soft)]"><CardContent className={cn("grid gap-4 p-4 sm:grid-cols-2", !compact && "lg:grid-cols-4 xl:grid-cols-7")}>
    <div><p className="text-xs text-[var(--erp-color-text-muted)]">商品数量</p><p className="mt-1 erp-data-number text-xl font-semibold text-[var(--erp-color-text)]">{summary.totalCount} 件</p></div>
    {canEnterCost ? <div><p className="text-xs text-[var(--erp-color-text-muted)]">采购总额</p><p className="mt-1 erp-data-number text-xl font-semibold text-[var(--erp-color-text)]">{formatCurrency(summary.totalCost)}</p></div> : <div><p className="text-xs text-[var(--erp-color-text-muted)]">采购总额</p><p className="mt-1 text-sm font-semibold text-[var(--erp-color-text-muted)]">当前表单不可录入</p></div>}
    {showProfit ? <div><p className="text-xs text-[var(--erp-color-text-muted)]">预计销售额</p><p className="mt-1 erp-data-number text-xl font-semibold text-[var(--erp-color-text)]">{formatCurrency(summary.estTotalSell)}</p></div> : null}
    {canEnterCost && showProfit ? <div><p className="text-xs text-[var(--erp-color-text-muted)]">预计毛利</p><p className="mt-1 erp-data-number text-xl font-semibold text-[var(--erp-color-success)]">{formatCurrency(summary.estTotalProfit)}</p><div className="mt-1"><ErpStatusBadge label="前端预估" tone="neutral" /></div></div> : null}
    <div><p className="text-xs text-[var(--erp-color-text-muted)]">现金付款</p><p className="mt-1 erp-data-number text-xl font-semibold text-[var(--erp-color-success)]">{canEnterCost ? formatCurrency(settlement.paidAmount) : "—"}</p></div>
    <div><p className="text-xs text-[var(--erp-color-text-muted)]">供应商抵扣</p><p className="mt-1 erp-data-number text-xl font-semibold text-[var(--erp-color-primary)]">{formatCurrency(settlement.vendorCreditAppliedAmount)}</p></div>
    <div><p className="text-xs text-[var(--erp-color-text-muted)]">未付款</p><p className="mt-1 erp-data-number text-xl font-semibold text-[var(--erp-color-warning)]">{canEnterCost ? formatCurrency(settlement.unpaidAmount) : "—"}</p></div>
  </CardContent></Card>;
}
