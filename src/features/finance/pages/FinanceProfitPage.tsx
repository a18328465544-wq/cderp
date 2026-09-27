import {keepPreviousData, useQuery} from "@tanstack/react-query";
import type {ColumnDef, VisibilityState} from "@tanstack/react-table";
import {BarChart3, CircleDollarSign, Download, FileText, Layers3, LockKeyhole, RefreshCw, RotateCcw, TrendingUp, WalletCards} from "lucide-react";
import {ErpSearchInput} from "@/src/components/common";
import {useEffect, useMemo} from "react";
import {Button, Card, Select} from "@/src/components/ui";
import {AreaTrendChart} from "@/src/components/ui/chart-primitives";
import {ChartMeta} from "@/src/components/ui/chart";
import {AnalyticsDetailRegion, AnalyticsInsightItem, AnalyticsKpiRegion, AnalyticsMainRegion, AnalyticsToolbar, DashboardSection, ErpAnalyticsPageFrame, ErpDataTable, ErpDateRangePicker, ErpEmptyState, ErpLoadingState, ErpMetricCard, ErpPageContent, ErpPageError, ErpPageHeader, ErpStatusBadge, type AnalyticsVisualizationSize, type QuickStatusItemData} from "@/src/components/common";
import {ApiError, financeApi, queryKeys, salesApi, type AuthSession} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import {useTablePreferences} from "@/src/hooks/useTablePreferences";
import {useUrlSearchState} from "@/src/hooks/useUrlSearchState";
import type {SalesListDataset} from "@/src/types/sales";
import {formatCurrency} from "@/src/lib/format";
import {storeDate} from "@/src/utils/storeTime";
import {FinanceTableControls} from "../components/FinanceTableControls";
import {countActiveFinanceProfitFilters, defaultFinanceProfitFilters, financeProfitFiltersToSearch, parseFinanceProfitFilters, selectFinanceProfitInsights, selectFinanceProfitReport, type FinanceProfitDimension, type FinanceProfitFilters, type FinanceProfitGroupRow, type FinanceProfitInsight, type FinanceProfitReport} from "../finance-profit";
import {financeNetTone, financeProfitChartConfig} from "../finance-chart.utils";

const dimensionOptions = [
  {value: "product", label: "按商品"},
  {value: "customer", label: "按客户"},
  {value: "channel", label: "按渠道"},
  {value: "handler", label: "按经办人"},
];

function useFinanceProfitUrlState() {
  return useUrlSearchState({
    defaultValue: defaultFinanceProfitFilters,
    parse: parseFinanceProfitFilters,
    serialize: financeProfitFiltersToSearch,
  });
}

export function FinanceProfitPage() {
  const {session, logout} = useAuth();
  const {value: filters, commit} = useFinanceProfitUrlState();
  const allowed = createCapabilities(session).menu("finance_reports");
  const permissions = session?.permissions || {showCost: false, showProfit: false};
  const salesQuery = useQuery({
    queryKey: queryKeys.finance.profitSales({userId: session?.user.id || "anonymous", showCost: permissions.showCost, showProfit: permissions.showProfit}),
    queryFn: ({signal}) => salesApi.listAllForReport({showCost: permissions.showCost, showProfit: permissions.showProfit}, signal),
    enabled: Boolean(session && allowed),
    placeholderData: keepPreviousData,
    retry: false,
  });
  const flowQuery = useQuery({
    queryKey: queryKeys.finance.profitFlows({userId: session?.user.id || "anonymous"}, {startDate: filters.dateStart, endDate: filters.dateEnd}),
    queryFn: ({signal}) => financeApi.profitFlows({startDate: filters.dateStart, endDate: filters.dateEnd}, signal),
    enabled: Boolean(session && allowed && permissions.showProfit),
    retry: false,
  });
  useEffect(() => {if (salesQuery.error instanceof ApiError && salesQuery.error.isUnauthorized) logout();}, [logout, salesQuery.error]);
  useEffect(() => {if (flowQuery.error instanceof ApiError && flowQuery.error.isUnauthorized) logout();}, [logout, flowQuery.error]);
  if (!session) return <Card><ErpLoadingState title="正在验证销售利润权限" /></Card>;
  if (!session || !allowed) return <ErpPageError title="当前账号没有销售利润权限" description="服务端权限未包含 finance_reports；页面不会请求或展示销售利润数据。" />;
  return <FinanceProfitContent session={session} filters={filters} onFiltersChange={commit} query={salesQuery} flowQuery={flowQuery} />;
}

function FinanceProfitContent({session, filters, onFiltersChange, query, flowQuery}: {session: AuthSession; filters: FinanceProfitFilters; onFiltersChange: (filters: FinanceProfitFilters) => void; query: ReturnType<typeof useQuery<SalesListDataset>>; flowQuery: ReturnType<typeof useQuery<Awaited<ReturnType<typeof financeApi.profitFlows>>> >}) {
  const {columnVisibility, setColumnVisibility, density, setDensity} = useTablePreferences<VisibilityState>({feature: "finance-profit", userId: session.user.id, defaultVisibility: {}});
  const report = useMemo(() => selectFinanceProfitReport(query.data?.items || [], filters, flowQuery.data), [filters, flowQuery.data, query.data?.items]);
  const activeFilters = countActiveFinanceProfitFilters(filters);
  const insights = useMemo(() => selectFinanceProfitInsights(report, session.permissions.showProfit), [report, session.permissions.showProfit]);
  const visualizationSize: AnalyticsVisualizationSize = report.trend.length <= 3 ? "compact" : report.trend.length <= 30 ? "standard" : "expanded";
  const columns = useMemo(() => createFinanceProfitColumns({showCost: session.permissions.showCost, showProfit: session.permissions.showProfit}), [session.permissions.showCost, session.permissions.showProfit]);
  const update = (partial: Partial<FinanceProfitFilters>) => onFiltersChange({...filters, ...partial, page: partial.page ?? 1});
  const exportReport = () => {
    const headers = ["分组", "辅助信息", "订单数", "数量", "销售额", ...(session.permissions.showCost ? ["成本"] : []), ...(session.permissions.showProfit ? ["毛利", "毛利率"] : [])];
    const rows = report.rows.map((row) => [row.label, row.secondary, row.orderCount, row.quantity, row.revenue, ...(session.permissions.showCost ? [row.cost === undefined ? "" : row.cost] : []), ...(session.permissions.showProfit ? [row.profit === undefined ? "" : row.profit, row.margin === undefined ? "" : `${(row.margin * 100).toFixed(2)}%`] : [])]);
    const summaryRows = session.permissions.showProfit ? [
      ["销售毛利", report.summary.profit ?? ""],
      ["其他收入（按日期）", report.summary.otherIncome ?? ""],
      ["其他支出（按日期）", report.summary.otherExpense ?? ""],
      ["净利润", report.summary.netProfit ?? ""],
    ] : [];
    const csv = `\uFEFF${[headers, ...rows, [], ["汇总项", "金额"], ...summaryRows].map((row) => row.map(csvCell).join(",")).join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], {type: "text/csv;charset=utf-8"}));
    const link = document.createElement("a"); link.href = url; link.download = `销售毛利-${filters.dimension}-${filters.dateStart || "全部"}-${filters.dateEnd || ""}.csv`; link.click(); URL.revokeObjectURL(url);
  };
  const quickStatus: QuickStatusItemData[] = [
    {icon: <LockKeyhole className="h-4 w-4" />, label: "利润权限", value: session.permissions.showProfit ? "可查看" : "已隐藏", description: "跟随当前账号权限", tone: session.permissions.showProfit ? "success" : "neutral"},
    {icon: <FileText className="h-4 w-4" />, label: "分析单据", value: `${report.summary.orderCount} 单`, description: "当前筛选结果", tone: "info"},
  ];
  return <ErpAnalyticsPageFrame>
    <ErpPageHeader title="销售毛利" subtitle="按商品、客户、渠道或经办人查看销售额、成本与销售毛利表现。" quickStatus={quickStatus} actions={<><Button type="button" size="sm" variant="secondary" disabled={query.isFetching || flowQuery.isFetching} onClick={() => {void query.refetch(); if (session.permissions.showProfit) void flowQuery.refetch();}}><RefreshCw className={`h-4 w-4 ${query.isFetching || flowQuery.isFetching ? "animate-spin" : ""}`} />刷新</Button><Button type="button" size="sm" variant="secondary" disabled={!report.rows.length} onClick={exportReport}><Download className="h-4 w-4" />导出结果</Button></>} />
    <ErpPageContent className="space-y-[var(--erp-page-gap)]">
    {flowQuery.error && <div className="flex items-center gap-2 bg-[var(--erp-color-warning-soft)] px-4 py-3 text-sm text-[var(--erp-color-text-secondary)]"><LockKeyhole className="h-4 w-4 shrink-0 text-[var(--erp-color-warning)]" />其他收支加载失败，净利润暂不计算；销售毛利仍按销售单独立展示。</div>}
    <AnalyticsKpiRegion
      primary={<>
        <ErpMetricCard label="销售额" value={formatCurrency(report.summary.revenue)} detail="当前筛选汇总" icon={<CircleDollarSign className="h-4 w-4" />} tone="info" />
        <ErpMetricCard label="销售毛利" value={session.permissions.showProfit && report.summary.profit !== undefined ? formatCurrency(report.summary.profit) : "—"} detail={session.permissions.showProfit ? "销售额 − 商品成本" : "当前账号无利润权限"} icon={<TrendingUp className="h-4 w-4" />} tone={report.summary.profit !== undefined && report.summary.profit < 0 ? "danger" : "success"} />
        <ErpMetricCard label="净利润" value={session.permissions.showProfit && report.summary.netProfit !== undefined ? formatCurrency(report.summary.netProfit) : "—"} detail={session.permissions.showProfit ? "销售毛利 + 其他收入 − 其他支出" : "当前账号无利润权限"} icon={<BarChart3 className="h-4 w-4" />} tone={session.permissions.showProfit && report.summary.netProfit !== undefined ? financeNetTone(report.summary.netProfit) : "neutral"} />
      </>}
      secondary={<>
        {session.permissions.showCost && <ErpMetricCard label="销售成本" value={report.summary.cost === undefined ? "—" : formatCurrency(report.summary.cost)} detail="当前筛选汇总" icon={<WalletCards className="h-4 w-4" />} tone="danger" variant="compact" />}
        {session.permissions.showProfit && <ErpMetricCard label="毛利率" value={report.summary.margin === undefined ? "—" : `${(report.summary.margin * 100).toFixed(2)}%`} detail="销售毛利 ÷ 销售额" icon={<BarChart3 className="h-4 w-4" />} tone="success" variant="compact" />}
        {session.permissions.showProfit && <ErpMetricCard label="其他收入" value={report.summary.otherIncome === undefined ? "—" : formatCurrency(report.summary.otherIncome)} detail="按日期范围，不分摊到明细" icon={<CircleDollarSign className="h-4 w-4" />} tone="success" variant="compact" />}
        {session.permissions.showProfit && <ErpMetricCard label="其他支出" value={report.summary.otherExpense === undefined ? "—" : formatCurrency(report.summary.otherExpense)} detail="按日期范围，不分摊到明细" icon={<WalletCards className="h-4 w-4" />} tone="danger" variant="compact" />}
        <ErpMetricCard label="分析订单" value={`${report.summary.orderCount} 单`} detail="当前筛选结果" icon={<FileText className="h-4 w-4" />} tone="neutral" variant="compact" />
        <ErpMetricCard label="销售数量" value={`${report.summary.quantity} 件`} detail="销售单实物数量" icon={<Layers3 className="h-4 w-4" />} tone="neutral" variant="compact" />
        {session.permissions.showProfit && <ErpMetricCard label="盈利分组" value={`${report.summary.profitableGroups} 组`} detail="当前维度有利润" icon={<TrendingUp className="h-4 w-4" />} tone="success" variant="compact" />}
        {session.permissions.showProfit && <ErpMetricCard label="亏损分组" value={`${report.summary.lossGroups} 组`} detail="需要重点关注" icon={<BarChart3 className="h-4 w-4" />} tone={report.summary.lossGroups ? "danger" : "neutral"} variant="compact" />}
      </>}
    />
    <AnalyticsToolbar actions={<Button type="button" size="sm" variant="ghost" onClick={() => onFiltersChange(defaultFinanceProfitFilters)}><RotateCcw className="h-4 w-4" />重置</Button>}>
      <ErpSearchInput className="min-w-56 flex-1" value={filters.keyword} onChange={(event) => update({keyword: event.target.value})} placeholder="搜索商品、客户、销售单号或经办人" aria-label="搜索销售利润" />
      <Select className="w-32" value={filters.dimension} options={dimensionOptions} onValueChange={(value) => update({dimension: value as FinanceProfitDimension})} aria-label="利润分析维度" />
      <ErpDateRangePicker value={{startDate: filters.dateStart, endDate: filters.dateEnd}} onChange={({startDate, endDate}) => update({dateStart: startDate, dateEnd: endDate})} density="compact" triggerClassName="sm:w-36" startAriaLabel="利润开始日期" endAriaLabel="利润结束日期" ariaLabel="利润日期范围" />
    </AnalyticsToolbar>
    <AnalyticsMainRegion variant="3-1">
      <AnalyticsMainRegion.Visualization size={visualizationSize}><DashboardSection title="毛利趋势" description="销售毛利来自销售额减商品成本；净利润额外叠加日期范围内的其他收支。" actions={<ErpStatusBadge label={`${report.trend.length} 个日期`} tone="info" />}><ProfitTrend trend={report.trend} showProfit={session.permissions.showProfit} showNetProfit={session.permissions.showProfit && report.summary.netProfit !== undefined} updatedAt={storeDate()} /></DashboardSection></AnalyticsMainRegion.Visualization>
      <AnalyticsMainRegion.Insights><DashboardSection title="毛利洞察" description="从当前销售毛利结果中优先展示机会与风险。"><ProfitInsights insights={insights} showProfit={session.permissions.showProfit} /></DashboardSection></AnalyticsMainRegion.Insights>
    </AnalyticsMainRegion>
    <AnalyticsDetailRegion><DashboardSection title="毛利明细" description="按当前维度展示销售毛利；其他收支只在净利润汇总中体现，不分摊到商品、客户或经办人。" actions={<div className="flex items-center gap-2"><ErpStatusBadge label={`${report.meta.page} / ${report.meta.totalPages} 页 · ${report.pageRows.length} 条`} tone="info" /><FinanceTableControls columns={columns} visibility={columnVisibility} onVisibilityChange={setColumnVisibility} density={density} onDensityChange={setDensity} /></div>}><ErpDataTable ariaLabel="销售毛利明细" surface="plain" columns={columns} data={report.pageRows} getRowId={(row) => row.id} loading={query.isPending} fetching={query.isFetching} error={query.error as Error | null} errorTitle="销售毛利加载失败" emptyTitle="暂无毛利数据" emptyDescription={activeFilters ? "当前筛选条件没有匹配的销售单。" : "当前没有可展示的销售单据。"} onRetry={() => void query.refetch()} page={report.meta.page} pageSize={report.meta.pageSize} total={report.meta.total} onPageChange={(page) => update({page})} onPageSizeChange={(pageSize) => update({page: 1, pageSize})} columnVisibility={columnVisibility} onColumnVisibilityChange={setColumnVisibility} enableColumnResizing density={density} stickyHeader /></DashboardSection></AnalyticsDetailRegion>
    </ErpPageContent>
  </ErpAnalyticsPageFrame>;
}

function createFinanceProfitColumns({showCost, showProfit}: {showCost: boolean; showProfit: boolean}): ColumnDef<FinanceProfitGroupRow, unknown>[] {
  const columns: ColumnDef<FinanceProfitGroupRow, unknown>[] = [
    {accessorKey: "label", header: "分组", size: 220, cell: ({row}) => <div><p className="font-semibold">{row.original.label}</p><p className="mt-1 text-xs text-[var(--erp-color-text-muted)]">{row.original.secondary}</p></div>},
    {accessorKey: "orderCount", header: "订单数", size: 90, cell: ({row}) => <span className="erp-data-number">{row.original.orderCount} 单</span>},
    {accessorKey: "quantity", header: "数量", size: 90, cell: ({row}) => <span className="erp-data-number">{row.original.quantity} 件</span>},
    {accessorKey: "revenue", header: "销售额", size: 130, cell: ({row}) => <span className="erp-data-number font-semibold">{formatCurrency(row.original.revenue)}</span>},
  ];
  if (showCost) columns.push({accessorKey: "cost", header: "成本", size: 125, cell: ({row}) => row.original.cost === undefined ? <span className="text-[var(--erp-color-text-muted)]">—</span> : <span className="erp-data-number">{formatCurrency(row.original.cost)}</span>});
  if (showProfit) columns.push({accessorKey: "profit", header: "毛利", size: 125, cell: ({row}) => <span className={`erp-data-number font-semibold ${row.original.profit !== undefined && row.original.profit < 0 ? "text-[var(--erp-color-danger)]" : "text-[var(--erp-color-success)]"}`}>{row.original.profit === undefined ? "—" : formatCurrency(row.original.profit)}</span>});
  if (showProfit) columns.push({accessorKey: "margin", header: "毛利率", size: 100, cell: ({row}) => row.original.margin === undefined ? "—" : `${(row.original.margin * 100).toFixed(2)}%`});
  return columns;
}

function ProfitTrend({trend, showProfit, showNetProfit, updatedAt}: {trend: FinanceProfitReport["trend"]; showProfit: boolean; showNetProfit: boolean; updatedAt: string}) {
  if (!trend.length) return <div className="space-y-2">{!showProfit && <div className="flex items-center gap-2 bg-[var(--erp-color-warning-soft)] px-3 py-2 text-xs text-[var(--erp-color-text-secondary)]"><LockKeyhole className="h-3.5 w-3.5 shrink-0 text-[var(--erp-color-warning)]" />当前账号仅可查看销售额，毛利曲线与利润明细受权限限制。</div>}<ErpEmptyState density="compact" title="当前筛选暂无利润趋势" description="调整日期、商品或客户筛选条件后再试。" /><ChartMeta summary="当前筛选没有可展示的趋势数据" updatedAt={updatedAt} /></div>;
  const rows = trend.slice(-14);
  const revenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const profit = rows.reduce((sum, row) => sum + (row.profit || 0), 0);
  const netProfit = rows.reduce((sum, row) => sum + (row.netProfit || 0), 0);
  return <div className="space-y-2" data-analytics-chart="profit-trend">
    {!showProfit && <div className="flex items-center gap-2 bg-[var(--erp-color-warning-soft)] px-3 py-2 text-xs text-[var(--erp-color-text-secondary)]"><LockKeyhole className="h-3.5 w-3.5 shrink-0 text-[var(--erp-color-warning)]" />当前账号仅可查看销售额，毛利曲线与利润明细受权限限制。</div>}
    <div className="h-56 sm:h-64">
      <AreaTrendChart
        data={rows}
        xKey="label"
        ariaLabel="毛利趋势图"
        config={financeProfitChartConfig}
        series={[
          {dataKey: "revenue", label: "销售额", color: "var(--erp-chart-primary)", type: "area"},
          {dataKey: "profit", label: "销售毛利", color: "var(--erp-chart-positive)", strokeDasharray: "6 3", type: "line", hidden: !showProfit},
          {dataKey: "netProfit", label: "净利润", color: "var(--erp-chart-muted)", strokeDasharray: "3 3", type: "line", hidden: !showNetProfit},
        ]}
        yTickFormatter={(value) => Math.abs(value) >= 10000 ? `${Math.round(value / 10000)}万` : String(value)}
        tooltipFormatter={(value, _name, item) => [formatCurrency(Number(value || 0)), item.dataKey === "revenue" ? "销售额" : item.dataKey === "netProfit" ? "净利润" : "销售毛利"]}
      />
    </div>
    <ChartMeta summary={showProfit ? `近 ${rows.length} 期销售额 ${formatCurrency(revenue)} · 销售毛利 ${formatCurrency(profit)}${showNetProfit ? ` · 净利润 ${formatCurrency(netProfit)}` : ""}` : `近 ${rows.length} 期销售额 ${formatCurrency(revenue)} · 毛利按权限隐藏`} updatedAt={updatedAt} />
  </div>;
}

function ProfitInsights({insights, showProfit}: {insights: FinanceProfitInsight[]; showProfit: boolean}) {
  if (!showProfit) return <div className="flex items-center gap-2 border-b border-[var(--erp-color-border)] py-3 text-sm text-[var(--erp-color-text-secondary)]"><LockKeyhole className="h-4 w-4 shrink-0" />当前账号没有利润洞察权限。</div>;
  if (!insights.length) return <div className="py-8 text-center text-sm text-[var(--erp-color-text-muted)]">暂无足够的利润数据生成洞察。</div>;
  return <div>{insights.map((insight) => {
  const value = insight.valueType === "currency" ? formatCurrency(insight.value) : `${(insight.value * 100).toFixed(2)}%`;
  return <AnalyticsInsightItem key={insight.id} label={insight.label} title={insight.title} value={value} metadata={insight.detail} tone={insight.tone} />;
  })}</div>;
}

function csvCell(value: string | number) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
