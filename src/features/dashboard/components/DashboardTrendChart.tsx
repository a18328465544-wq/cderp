import {formatCurrency} from "@/src/lib/format";
import {AreaTrendChart} from "@/src/components/ui/chart-primitives";
import {ErpEmptyState} from "@/src/components/common";

export interface DashboardTrendRow {
  date: string;
  label: string;
  revenue: number;
  profit: number;
  today: boolean;
}

/**
 * The chart is intentionally isolated from DashboardPage so Recharts can be
 * requested after the first meaningful paint. The data contract stays local
 * to the dashboard and does not change the API/domain model.
 */
export default function DashboardTrendChart({data, showProfit = true}: {data: DashboardTrendRow[]; showProfit?: boolean}) {
  const hasData = data.some((row) => row.revenue !== 0 || showProfit && row.profit !== 0);

  if (!hasData) return <div className="flex h-full items-center justify-center rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)]"><ErpEmptyState density="compact" title="当前 7 天暂无销售数据" description={showProfit ? "调整时间范围或进入利润分析查看历史数据。" : "当前账号没有利润查看权限，销售数据仍可继续查看。"} /></div>;

  return <AreaTrendChart
    data={data}
    xKey="label"
    ariaLabel="销售趋势图"
    series={[
      {dataKey: "revenue", label: "销售额", color: "var(--erp-chart-primary)", type: "area"},
      {dataKey: "profit", label: "毛利", color: "var(--erp-chart-positive)", strokeDasharray: "6 3", type: "line", hidden: !showProfit},
    ]}
    yTickFormatter={(value) => Math.abs(value) >= 10000 ? `${Math.round(value / 10000)}万` : String(value)}
    tooltipFormatter={(value, _name, item) => [formatCurrency(Number(value || 0)), item.dataKey === "revenue" ? "销售额" : "毛利"]}
  />;
}
