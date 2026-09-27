import type {ReactNode} from "react";
import {AreaTrendChart} from "@/src/components/ui/chart-primitives";
import {ChartMeta} from "@/src/components/ui/chart";
import {ErpEmptyState} from "@/src/components/common";
import {formatCurrency} from "@/src/lib/format";
import type {FinanceDashboardAccess, FinanceDashboardView, FinanceDateRange} from "@/src/types/finance";
import {storeDate} from "@/src/utils/storeTime";
import {FinanceSummaryCell} from "./FinanceDashboardWidgets";
import {financeNetTone} from "../finance-chart.utils";

export interface FinanceDashboardCashflowPanelProps {
  view: FinanceDashboardView;
  access: FinanceDashboardAccess;
  range: FinanceDateRange;
  cashTrendAction?: ReactNode;
}

/**
 * Owns the chart-heavy portion of the finance dashboard. Keeping this
 * boundary feature-local lets the page remain focused on data loading and
 * makes Recharts load only when this region is rendered.
 */
export function FinanceDashboardCashflowPanel({view, access, range, cashTrendAction}: FinanceDashboardCashflowPanelProps) {
  if (!access.canViewSettlementLedger) {
    return (
      <div className="space-y-2">
        <ErpEmptyState
          title="当前账号无账户流水权限"
          description="需要 settlement_ledger 权限才能查看真实收支趋势；页面不会把不可见数据展示为 0。"
          density="compact"
        />
        <ChartMeta className="mt-2" summary="收支趋势暂不可见 · 账户流水权限受限" updatedAt={storeDate()} />
      </div>
    );
  }

  if (!view.trend.some((row) => row.income !== 0 || row.expense !== 0)) {
    return (
      <div className="space-y-2">
        <ErpEmptyState
          title="当前期间暂无资金流水"
          description={`统计区间 ${range.startDate} 至 ${range.endDate} 没有收入或支出记录；可调整日期范围查看历史数据。`}
          density="compact"
          action={cashTrendAction}
        />
        <ChartMeta className="mt-2" summary={`统计区间 ${range.startDate} 至 ${range.endDate} 暂无收入或支出`} updatedAt={storeDate()} />
      </div>
    );
  }

  return (
    <>
      <div className="h-56 w-full sm:h-64">
        <AreaTrendChart
          data={view.trend}
          xKey="label"
          ariaLabel="资金收支趋势图"
          series={[
            {dataKey: "net", label: "净现金流", color: "var(--erp-chart-primary)", type: "area"},
            {dataKey: "income", label: "收入", color: "var(--erp-chart-positive)", strokeDasharray: "6 3", type: "line"},
            {dataKey: "expense", label: "支出", color: "var(--erp-chart-negative)", strokeDasharray: "2 3", type: "line"},
          ]}
          yTickFormatter={compactMoney}
          tooltipFormatter={(value, _name, item) => [formatCurrency(Number(value || 0)), chartLabel(String(item.dataKey ?? item.name))]}
        />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--erp-color-border)] pt-4 sm:grid-cols-4">
        <FinanceSummaryCell label="本期收入" value={formatCurrency(view.currentPeriod.income)} tone="success" />
        <FinanceSummaryCell label="本期支出" value={formatCurrency(view.currentPeriod.expense)} tone="danger" />
        <FinanceSummaryCell label="本期净流入" value={formatCurrency(view.currentPeriod.net)} tone={financeNetTone(view.currentPeriod.net)} />
        <FinanceSummaryCell label="资金周转" value={turnoverText(view, access)} tone="info" />
      </div>
      <ChartMeta
        className="mt-3"
        summary={`收入 ${formatCurrency(view.currentPeriod.income)} · 支出 ${formatCurrency(view.currentPeriod.expense)} · 净流入 ${formatCurrency(view.currentPeriod.net)}`}
        updatedAt={storeDate()}
      />
    </>
  );
}

function compactMoney(value: number) {
  const absolute = Math.abs(Number(value || 0));
  const sign = value < 0 ? "-" : "";
  if (absolute >= 10000) return `${sign}${(absolute / 10000).toFixed(absolute >= 100000 ? 0 : 1)}万`;
  return `${sign}${Math.round(absolute)}`;
}

function chartLabel(name: string) {
  return name === "income" ? "收入" : name === "expense" ? "支出" : "净现金流";
}

function turnoverText(view: FinanceDashboardView, access: FinanceDashboardAccess) {
  if (!access.showCost) return "成本权限受限";
  if (!view.turnover?.turnover) return "样本不足";
  return `${view.turnover.turnover.toFixed(2)} 次 / ${view.turnover.turnoverDays?.toFixed(0) || "—"} 天`;
}
