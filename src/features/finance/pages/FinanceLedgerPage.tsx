import {keepPreviousData, useQuery} from "@tanstack/react-query";
import {useNavigate} from "@tanstack/react-router";
import type {OnChangeFn, VisibilityState} from "@tanstack/react-table";
import {CheckCircle2, ChevronRight, CircleDollarSign, Download, FileCheck2, RefreshCw, RotateCcw, SlidersHorizontal, WalletCards} from "lucide-react";
import {ErpSearchInput} from "@/src/components/common";
import {useEffect, useMemo, useState, type ReactNode} from "react";
import {Button, Card, Input, Select} from "@/src/components/ui";
import {HorizontalBarChart, TrendLineChart} from "@/src/components/ui/chart-primitives";
import {ChartMeta} from "@/src/components/ui/chart";
import type {TooltipContentProps} from "@/src/components/ui/recharts";
import {ErpColumnVisibilityMenu, DashboardSection, ErpDataTable, ErpDateRangePicker, ErpDetailDrawer, ErpDetailFact, ErpEmptyState, ErpFilterBar, ErpFinancePageFrame, ErpLoadingState, ErpMetricCard, ErpPageContent, ErpPageError, ErpPageHeader, ErpPageToolbar, type QuickStatusItemData} from "@/src/components/common";
import {ApiError, financeAccountsApi, financeLedgerApi, queryKeys, type AuthSession} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import {useTablePreferences} from "@/src/hooks/useTablePreferences";
import {useUrlSearchState} from "@/src/hooks/useUrlSearchState";
import {financeLedgerBusinessTypes, financeLedgerDirections, type FinanceLedgerFilters, type FinanceLedgerItem} from "@/src/types/finance-ledger";
import type {FinanceAccountItem} from "@/src/types/finance-account";
import {createFinanceLedgerColumns} from "../finance-ledger.columns";
import {defaultFinanceLedgerFilters, financeLedgerFiltersToSearch, parseFinanceLedgerFilters} from "../finance-ledger.filters";
import {summarizeFinanceLedgerPage} from "../finance-ledger.summary";
import {financeChartCategoryColor, financeNetColor} from "../finance-chart.utils";
import {formatStoreDateTime, storeDate} from "@/src/utils/storeTime";

type LedgerQuery = ReturnType<typeof useQuery<Awaited<ReturnType<typeof financeLedgerApi.list>>>>;
type Tone = "neutral" | "info" | "success" | "warning" | "danger";

function useLedgerUrlState() {
  return useUrlSearchState({defaultValue: defaultFinanceLedgerFilters, parse: parseFinanceLedgerFilters, serialize: financeLedgerFiltersToSearch});
}

export function FinanceLedgerPage() {
  const {session, logout} = useAuth();
  const {value: filters, commit} = useLedgerUrlState();
  const allowed = createCapabilities(session).menu("settlement_ledger");
  const canViewAccounts = createCapabilities(session).menu("settlement_accounts");
  const ledgerQuery = useQuery({queryKey: queryKeys.finance.ledger(filters), queryFn: ({signal}) => financeLedgerApi.list(filters, signal), enabled: Boolean(session && allowed), placeholderData: keepPreviousData, retry: false});
  const accountsQuery = useQuery({queryKey: queryKeys.finance.accounts(), queryFn: ({signal}) => financeAccountsApi.listAll(signal), enabled: Boolean(session && allowed && canViewAccounts), staleTime: 60_000, retry: false});

  useEffect(() => {
    if (ledgerQuery.error instanceof ApiError && ledgerQuery.error.isUnauthorized) logout();
  }, [ledgerQuery.error, logout]);

  if (!session) return <Card><ErpLoadingState title="正在验证账户流水权限" /></Card>;
  if (!allowed) return <ErpPageError title="当前账号没有账户流水权限" description="服务端权限未包含 settlement_ledger；页面不会请求或展示任何资金流水。" />;
  return <FinanceLedgerContent session={session} filters={filters} onFiltersChange={commit} ledgerQuery={ledgerQuery} accounts={accountsQuery.data?.accounts || []} accountOptionsAvailable={canViewAccounts && !accountsQuery.isPending && !accountsQuery.error} />;
}

function FinanceLedgerContent({session, filters, onFiltersChange, ledgerQuery, accounts, accountOptionsAvailable}: {session: AuthSession; filters: FinanceLedgerFilters; onFiltersChange: (filters: FinanceLedgerFilters) => void; ledgerQuery: LedgerQuery; accounts: FinanceAccountItem[]; accountOptionsAvailable: boolean}) {
  const navigate = useNavigate();
  const [detail, setDetail] = useState<FinanceLedgerItem | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [trendRange, setTrendRange] = useState("30");
  const {columnVisibility, setColumnVisibility, density, setDensity} = useTablePreferences<VisibilityState>({feature: "finance-ledger", userId: session.user.id, defaultVisibility: {}, defaultDensity: "compact"});
  const rows = ledgerQuery.data?.items || [];
  const summary = useMemo(() => summarizeFinanceLedgerPage(rows), [rows]);
  const account = useMemo(() => accounts.find((item) => item.id === filters.accountId) || accounts[0], [accounts, filters.accountId]);
  const trendRows = useMemo(() => buildTrendRows(rows, Number(trendRange)), [rows, trendRange]);
  const expenses = useMemo(() => buildExpenseDistribution(rows), [rows]);
  const accountDistribution = useMemo(() => buildAccountDistribution(accounts), [accounts]);
  const columns = useMemo(() => createFinanceLedgerColumns(setDetail), []);
  const activeFilters = Number(Boolean(filters.keyword)) + Number(filters.accountId !== "all") + Number(Boolean(filters.handler)) + Number(filters.businessType !== "all") + Number(filters.direction !== "all") + Number(Boolean(filters.relatedDocNo)) + Number(Boolean(filters.customerName)) + Number(Boolean(filters.supplierName)) + Number(Boolean(filters.dateStart)) + Number(Boolean(filters.dateEnd));
  const openingBalance = deriveOpeningBalance(rows, account?.balance);
  const closingBalance = account?.balance ?? rows.at(-1)?.afterBalance;
  const reconciliation = getReconciliationState(account);
  const customerOptions = useMemo(() => [{value: "", label: "全部客户"}, ...Array.from(new Set(rows.map((item) => item.customerName).filter((value): value is string => Boolean(value)))).map((value) => ({value, label: value}))], [rows]);

  const update = (partial: Partial<FinanceLedgerFilters>) => onFiltersChange({...filters, ...partial, page: partial.page ?? 1});
  const exportCurrentPage = () => {
    const table = [["流水编号", "交易时间", "交易类型", "交易方向", "账户", "对方账户/客户", "金额(元)", "余额(元)", "备注", "单号"], ...rows.map((item) => [item.id, item.time, item.businessType, item.direction, item.accountName, item.party || item.customerName || item.supplierName || "", item.changeAmount.toFixed(2), item.afterBalance.toFixed(2), item.remarks || "", item.relatedDocNo || ""])] as Array<Array<string | number>>;
    const csv = `\uFEFF${table.map((row) => row.map(csvCell).join(",")).join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], {type: "text/csv;charset=utf-8"}));
    const link = document.createElement("a");
    link.href = url;
    link.download = `账户流水-第${filters.page}页.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return <ErpFinancePageFrame>
    <FinanceLedgerHeader reconciliation={reconciliation} loading={ledgerQuery.isFetching} onRefresh={() => void ledgerQuery.refetch()} onExport={exportCurrentPage} hasRows={rows.length > 0} />
    <ErpPageContent className="space-y-[var(--erp-page-gap)]">
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_232px]">
      <main className="min-w-0 space-y-4">
        <SummaryCards openingBalance={openingBalance} income={summary.income} expense={summary.expense} closingBalance={closingBalance} />
        <ErpPageToolbar>
        <ErpFilterBar className="bg-[var(--erp-color-surface)]" actions={<><Button type="button" size="sm" variant="ghost" onClick={() => onFiltersChange(defaultFinanceLedgerFilters)}><RotateCcw className="h-4 w-4" />重置</Button><Button type="button" size="sm" variant={advancedOpen ? "secondary" : "ghost"} onClick={() => setAdvancedOpen((value) => !value)}><SlidersHorizontal className="h-4 w-4" />更多筛选</Button></>}>
          <ErpSearchInput className="min-w-[220px] flex-1" value={filters.keyword} onChange={(event) => update({keyword: event.target.value})} placeholder="搜索备注、对方账户、单号" aria-label="搜索备注、对方账户或单号" />
          {accountOptionsAvailable ? <Select className="w-36" value={filters.accountId} onValueChange={(accountId) => update({accountId})} options={[{value: "all", label: "全部账户"}, ...accounts.map((item) => ({value: item.id, label: item.name}))]} aria-label="筛选账户" /> : <Select className="w-36" value="unavailable" onValueChange={() => undefined} options={[{value: "unavailable", label: "账户权限受限"}]} disabled aria-label="账户筛选不可用" />}
          <Select className="w-32" value={filters.businessType} onValueChange={(businessType) => update({businessType})} options={[{value: "all", label: "全部类型"}, ...financeLedgerBusinessTypes.map((value) => ({value, label: value}))]} aria-label="筛选交易类型" />
          <Select className="w-28" value={filters.direction} onValueChange={(direction) => update({direction: direction as FinanceLedgerFilters["direction"]})} options={[{value: "all", label: "全部方向"}, ...financeLedgerDirections.map((value) => ({value, label: value}))]} aria-label="筛选交易方向" />
          <ErpDateRangePicker value={{startDate: filters.dateStart, endDate: filters.dateEnd}} onChange={({startDate, endDate}) => update({dateStart: startDate, dateEnd: endDate})} triggerClassName="sm:w-32" startPlaceholder="开始日期" endPlaceholder="结束日期" startAriaLabel="流水开始日期" endAriaLabel="流水结束日期" ariaLabel="流水日期范围" />
          {advancedOpen && <><Input className="w-32" value={filters.handler} onChange={(event) => update({handler: event.target.value})} placeholder="经办人" aria-label="筛选经办人" /><Input className="w-36" value={filters.relatedDocNo} onChange={(event) => update({relatedDocNo: event.target.value})} placeholder="关联单号" aria-label="筛选关联单号" /><Select className="w-32" value={filters.customerName} onValueChange={(customerName) => update({customerName})} options={customerOptions} aria-label="筛选客户" /></>}
        </ErpFilterBar>
        </ErpPageToolbar>
        {activeFilters > 0 && <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-[var(--erp-color-text-secondary)]"><span>已应用 {activeFilters} 项筛选</span><Button type="button" size="xs" variant="ghost" className="h-auto px-0 font-semibold text-[var(--erp-color-primary)] hover:underline" onClick={() => onFiltersChange(defaultFinanceLedgerFilters)}>清空全部</Button></div>}
        <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]"><TrendCard rows={trendRows} range={trendRange} onRangeChange={setTrendRange} /><ExpenseShareCard rows={expenses} /></div>
        <LedgerTableCard rows={rows} summary={summary} total={ledgerQuery.data?.total || 0} page={ledgerQuery.data?.page || filters.page} pageSize={ledgerQuery.data?.pageSize || filters.pageSize} query={ledgerQuery} columns={columns} columnVisibility={columnVisibility} onColumnVisibilityChange={setColumnVisibility} density={density} onDensityChange={setDensity} onPageChange={(page) => update({page})} onPageSizeChange={(pageSize) => update({page: 1, pageSize})} activeFilters={activeFilters} onRowClick={setDetail} />
      </main>
      <LedgerAside account={account} accounts={accounts} accountDistribution={accountDistribution} navigate={navigate} onAccountChange={(accountId) => update({accountId})} />
    </div>
    <p className="px-1 text-xs text-[var(--erp-color-text-muted)]">注：概览、趋势与分类统计均按当前筛选结果计算；账户余额以服务端账户账面余额为准。</p>
    <LedgerDetailDrawer item={detail} onClose={() => setDetail(null)} />
    </ErpPageContent>
  </ErpFinancePageFrame>;
}

function FinanceLedgerHeader({reconciliation, loading, onRefresh, onExport, hasRows}: {reconciliation: ReconciliationState; loading: boolean; onRefresh: () => void; onExport: () => void; hasRows: boolean}) {
  const quickStatus: QuickStatusItemData[] = [
    {icon: <CheckCircle2 className="h-4 w-4" />, label: "数据连接", value: loading ? "连接中" : "已连接", tone: loading ? "info" : "success", description: "真实账户流水接口"},
    {icon: <FileCheck2 className="h-4 w-4" />, label: "对账状态", value: reconciliation.label, tone: reconciliation.tone, description: "当前账户对账状态"},
  ];
  return <ErpPageHeader title="账户流水" quickStatus={quickStatus} actions={<><Button type="button" size="sm" variant="secondary" disabled={loading} onClick={onRefresh}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />刷新</Button><Button type="button" size="sm" variant="secondary" disabled={!hasRows} onClick={onExport}><Download className="h-4 w-4" />导出</Button></>} />;
}

function SummaryCards({openingBalance, income, expense, closingBalance}: {openingBalance?: number; income: number; expense: number; closingBalance?: number}) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"><SummaryCard label="期初余额" value={openingBalance} icon={<WalletCards className="h-4 w-4" />} tone="info" /><SummaryCard label="收入金额" value={income} detail="较上期按筛选结果" icon={<ArrowIcon direction="in" />} tone="success" /><SummaryCard label="支出金额" value={expense} detail="较上期按筛选结果" icon={<ArrowIcon direction="out" />} tone="danger" /><SummaryCard label="期末余额" value={closingBalance} icon={<CircleDollarSign className="h-4 w-4" />} tone="info" /></div>;
}

function SummaryCard({label, value, detail, icon, tone}: {label: string; value?: number; detail?: string; icon: ReactNode; tone: Tone}) {
  return <ErpMetricCard label={label} value={value === undefined ? "—" : formatMoney(value)} detail={detail} icon={icon} tone={tone} valueTone={tone === "info" ? "neutral" : tone} />;
}

function ArrowIcon({direction}: {direction: "in" | "out"}) {
  return <span className={direction === "in" ? "text-[var(--erp-color-income)]" : "text-[var(--erp-color-expense)]"}>{direction === "in" ? "↓" : "↑"}</span>;
}

function TrendCard({rows, range, onRangeChange}: {rows: TrendRow[]; range: string; onRangeChange: (value: string) => void}) {
  const hasData = rows.some((row) => row.income > 0 || row.expense > 0);
  const income = rows.reduce((sum, row) => sum + row.income, 0);
  const expense = rows.reduce((sum, row) => sum + row.expense, 0);
  return <Card>
    <div className="flex items-center justify-between gap-3 border-b border-[var(--erp-color-border-soft)] px-4 py-3">
      <div><h2 className="text-sm font-semibold">收支趋势</h2><p className="mt-0.5 text-xs text-[var(--erp-color-text-muted)]">按日期汇总收入与支出</p></div>
      <Select className="w-24" value={range} onValueChange={onRangeChange} options={[{value: "7", label: "近7天"}, {value: "30", label: "近30天"}, {value: "0", label: "当前页"}]} aria-label="趋势时间范围" />
    </div>
    <div className="h-56 min-h-0 p-3 sm:h-64">
      {hasData ? <TrendLineChart
        data={rows}
        xKey="label"
        ariaLabel="收支趋势图"
        showZeroLine
        series={[{dataKey: "income", label: "收入", color: "var(--erp-chart-positive)"}, {dataKey: "expense", label: "支出", color: "var(--erp-chart-negative)", strokeDasharray: "6 3"}]}
        yTickFormatter={(value) => compactMoney(Number(value))}
        tooltipFormatter={ledgerTooltipFormatter}
      /> : <div className="flex h-full items-center justify-center"><ErpEmptyState density="compact" title="当前筛选暂无趋势数据" description="调整时间范围或筛选条件后再试。" /></div>}
    </div>
    <ChartMeta className="mx-4 mb-3" summary={`收入 ${formatMoney(income)} · 支出 ${formatMoney(expense)}`} updatedAt={storeDate()} />
  </Card>;
}

function ledgerTooltipFormatter(value: unknown, _name: string, item: NonNullable<TooltipContentProps["payload"]>[number]) {
  return [formatMoney(Number(value) || 0), item.dataKey === "income" ? "收入" : "支出"] as [string, string];
}

function ExpenseShareCard({rows}: {rows: ExpenseRow[]}) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return <Card>
    <div className="flex items-center justify-between border-b border-[var(--erp-color-border)] px-4 py-3">
      <div><h2 className="text-sm font-semibold">支出分类占比</h2><p className="mt-0.5 text-xs text-[var(--erp-color-text-muted)]">当前筛选结果 · 最多展示 5 类</p></div>
      <span className="text-xs text-[var(--erp-color-text-muted)]">{formatMoney(total)}</span>
    </div>
    <div className="grid min-h-64 grid-cols-[160px_minmax(0,1fr)] items-center gap-3 p-3">
      {total > 0 ? <div className="col-span-2 h-52 min-h-0">
        <HorizontalBarChart
          data={rows.map((row) => ({id: row.label, label: row.label, value: row.value, formattedValue: formatMoney(row.value), percentage: formatPercent(row.value, total), color: financeChartCategoryColor(row.label)}))}
          ariaLabel="支出分类占比图"
          tooltipFormatter={(value) => formatMoney(Number(value) || 0)}
        />
      </div> : <div className="col-span-2"><ErpEmptyState density="compact" title="当前筛选暂无支出分类" description="调整时间范围或筛选条件后再试。" /></div>}
    </div>
    <ChartMeta className="mx-4 mb-3" summary={`${rows.length} 类支出 · 总额 ${formatMoney(total)}`} updatedAt={storeDate()} />
  </Card>;
}

function LedgerTableCard({rows, summary, total, page, pageSize, query, columns, columnVisibility, onColumnVisibilityChange, density, onDensityChange, onPageChange, onPageSizeChange, activeFilters, onRowClick}: {rows: FinanceLedgerItem[]; summary: ReturnType<typeof summarizeFinanceLedgerPage>; total: number; page: number; pageSize: number; query: LedgerQuery; columns: ReturnType<typeof createFinanceLedgerColumns>; columnVisibility: VisibilityState; onColumnVisibilityChange: OnChangeFn<VisibilityState>; density: "comfortable" | "compact"; onDensityChange: (value: "comfortable" | "compact") => void; onPageChange: (page: number) => void; onPageSizeChange: (pageSize: number) => void; activeFilters: number; onRowClick: (item: FinanceLedgerItem) => void}) {
  return <DashboardSection title={<span>流水明细 <span className="ml-1 text-xs font-normal text-[var(--erp-color-text-muted)]">共 {total} 条</span></span>} actions={<TableControls columns={columns} visibility={columnVisibility} onVisibilityChange={onColumnVisibilityChange} density={density} onDensityChange={onDensityChange} />} className="overflow-hidden p-0"><ErpDataTable ariaLabel="账户流水明细" surface="plain" columns={columns} data={rows} getRowId={(row) => row.id} loading={query.isPending} fetching={query.isFetching} error={query.error as Error | null} errorTitle="账户流水加载失败" emptyTitle="暂无匹配流水" emptyDescription={activeFilters ? "当前筛选条件没有匹配结果。" : "当前账本尚无账户流水。"} onRetry={() => void query.refetch()} onRowClick={onRowClick} manualSorting page={page} pageSize={pageSize} total={total} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} columnVisibility={columnVisibility} onColumnVisibilityChange={onColumnVisibilityChange} enableColumnResizing density={density} stickyHeader virtualized={rows.length >= 50} footer={<div className="flex flex-wrap items-center gap-4"><span>合计（当前筛选结果）</span><span className="text-[var(--erp-color-income)]">收入：{formatMoney(summary.income)}</span><span className="text-[var(--erp-color-expense)]">支出：{formatMoney(summary.expense)}</span><span style={{color: financeNetColor(summary.net)}}>净额：{formatMoney(summary.net)}</span></div>} /></DashboardSection>;
}

function TableControls({columns, visibility, onVisibilityChange, density, onDensityChange}: {columns: ReturnType<typeof createFinanceLedgerColumns>; visibility: VisibilityState; onVisibilityChange: OnChangeFn<VisibilityState>; density: "comfortable" | "compact"; onDensityChange: (value: "comfortable" | "compact") => void}) {
  return <div className="flex items-center gap-2"><ErpColumnVisibilityMenu columns={columns} visibility={visibility} onVisibilityChange={onVisibilityChange} label="列设置" /><Button type="button" size="sm" variant="ghost" onClick={() => onDensityChange(density === "compact" ? "comfortable" : "compact")}>{density === "compact" ? "舒适" : "紧凑"}</Button></div>;
}

function LedgerAside({account, accounts, accountDistribution, navigate, onAccountChange}: {account?: FinanceAccountItem; accounts: FinanceAccountItem[]; accountDistribution: AccountDistributionRow[]; navigate: ReturnType<typeof useNavigate>; onAccountChange: (accountId: string) => void}) {
  return <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start"><Card><div className="border-b border-[var(--erp-color-border)] px-4 py-3"><h2 className="text-sm font-semibold">账户信息</h2></div><div className="space-y-3 p-4"><Select value={account?.id || ""} onValueChange={onAccountChange} options={accounts.map((item) => ({value: item.id, label: item.name}))} placeholder="选择账户" aria-label="选择账户" /><div className="grid grid-cols-2 gap-3"><div><p className="text-xs text-[var(--erp-color-text-muted)]">当前余额</p><p className="mt-1 erp-data-number text-sm font-semibold">{formatMoney(account?.balance)}</p></div><div><p className="text-xs text-[var(--erp-color-text-muted)]">可用余额</p><p className="mt-1 erp-data-number text-sm font-semibold">{formatMoney(account?.availableBalance)}</p></div></div><div className="flex gap-2"><Button className="flex-1" size="sm" onClick={() => void navigate({to: "/finance/accounts"})}>账户管理</Button><Button className="flex-1" size="sm" variant="secondary" onClick={() => void navigate({to: "/finance/income"})}>收款</Button></div></div></Card><Card><div className="border-b border-[var(--erp-color-border)] px-4 py-3"><h2 className="text-sm font-semibold">账户分布</h2></div><div className="space-y-3 p-4">{accountDistribution.length ? accountDistribution.map((row) => <div key={row.id} className="flex items-center justify-between gap-2 text-xs"><span className="flex min-w-0 items-center gap-2 truncate"><span className="h-2 w-2 rounded-full" style={{backgroundColor: row.color}} />{row.name}</span><span className="shrink-0 erp-data-number">{formatMoney(row.balance)}</span></div>) : <ErpEmptyState title="暂无账户" description="当前账号没有可展示的资金账户。" />}</div></Card><Card><div className="border-b border-[var(--erp-color-border)] px-4 py-3"><h2 className="text-sm font-semibold">常用账户</h2></div><div className="divide-y divide-[var(--erp-color-border)]">{accounts.slice(0, 3).map((item) => <Button type="button" variant="ghost" key={item.id} className="h-auto w-full justify-between gap-2 rounded-none px-4 py-3 text-left text-xs hover:bg-[var(--erp-color-surface-muted)]" onClick={() => onAccountChange(item.id)}><span className="min-w-0 truncate font-medium">{item.name}</span><ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--erp-color-text-muted)]" /></Button>)}</div></Card></aside>;
}

function LedgerDetailDrawer({item, onClose}: {item: FinanceLedgerItem | null; onClose: () => void}) {
  return <ErpDetailDrawer modal={false} resizable drawerKey="finance-ledger-detail" defaultWidth={680} minWidth={520} maxWidth={820} open={Boolean(item)} onOpenChange={(open) => {if (!open) onClose();}} title={item?.businessType || "流水详情"} description={item ? `${item.id} · ${formatLedgerDateTime(item.time)}` : undefined}><div className="space-y-5">{item && <><div className="grid grid-cols-2 gap-3"><Fact label="收入" value={formatMoney(item.incomeAmount)} tone="success" /><Fact label="支出" value={formatMoney(item.expenseAmount)} tone="danger" /><Fact label="变动前余额" value={formatMoney(item.beforeBalance)} /><Fact label="变动后余额" value={formatMoney(item.afterBalance)} tone={item.afterBalance < 0 ? "danger" : "neutral"} /></div><DashboardSection title="流水归属"><div className="grid grid-cols-2 gap-x-4 gap-y-3"><DetailRow label="账户" value={`${item.accountName} · ${item.accountType}`} /><DetailRow label="方向" value={item.direction} /><DetailRow label="往来方" value={item.party || item.customerName || item.supplierName || "未记录"} /><DetailRow label="经办人" value={item.handler} /><DetailRow label="创建人" value={item.createdBy} /><DetailRow label="发生时间" value={formatLedgerDateTime(item.time)} /></div></DashboardSection><DashboardSection title="关联单据"><div className="grid grid-cols-2 gap-x-4 gap-y-3"><DetailRow label="单据类型" value={item.relatedDocType || "未记录"} /><DetailRow label="单据编号" value={item.relatedDocNo || "未关联"} /></div></DashboardSection>{item.remarks && <p className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3 text-sm text-[var(--erp-color-text-secondary)]">{item.remarks}</p>}</>}</div></ErpDetailDrawer>;
}

function Fact({label, value, tone = "neutral"}: {label: string; value: string; tone?: "neutral" | "success" | "danger"}) {return <ErpDetailFact label={label} value={value} tone={tone === "neutral" ? "default" : tone} />;}
function DetailRow({label, value}: {label: string; value: string}) {return <div><p className="text-xs text-[var(--erp-color-text-muted)]">{label}</p><p className="mt-0.5 truncate text-sm font-medium">{value}</p></div>;}
type TrendRow = {label: string; income: number; expense: number; key: string};
type ExpenseRow = {label: string; value: number};
type AccountDistributionRow = {id: string; name: string; balance: number; color: string};
type ReconciliationState = {label: string; tone: Tone};

function buildTrendRows(items: FinanceLedgerItem[], range: number): TrendRow[] {
  const grouped = new Map<string, TrendRow>();
  const sorted = [...items].sort((left, right) => dateKey(left.time).localeCompare(dateKey(right.time)));
  const scoped = range > 0 ? sorted.slice(-range) : sorted;
  scoped.forEach((item) => {
    const key = dateKey(item.time) || "未记录";
    const current = grouped.get(key) || {key, label: shortDate(key), income: 0, expense: 0};
    current.income += item.incomeAmount;
    current.expense += item.expenseAmount;
    grouped.set(key, current);
  });
  return Array.from(grouped.values());
}

function buildExpenseDistribution(items: FinanceLedgerItem[]): ExpenseRow[] {
  const grouped = new Map<string, number>();
  items.filter((item) => item.expenseAmount > 0).forEach((item) => grouped.set(item.businessType, (grouped.get(item.businessType) || 0) + item.expenseAmount));
  return Array.from(grouped, ([label, value]) => ({label, value})).sort((left, right) => right.value - left.value).slice(0, 5);
}

function buildAccountDistribution(accounts: FinanceAccountItem[]): AccountDistributionRow[] {
  return accounts.filter((item) => item.enabled).sort((left, right) => right.balance - left.balance).slice(0, 5).map((item) => ({id: item.id, name: item.name, balance: item.balance, color: financeChartCategoryColor(item.id)}));
}

function deriveOpeningBalance(items: FinanceLedgerItem[], fallback?: number) {
  const first = [...items].sort((left, right) => dateKey(left.time).localeCompare(dateKey(right.time)))[0];
  return first?.beforeBalance ?? fallback;
}

function getReconciliationState(account?: FinanceAccountItem): ReconciliationState {
  if (!account) return {label: "待选择", tone: "neutral"};
  if (Math.abs(account.difference || 0) > 0.005) return {label: "有差异", tone: "warning"};
  if (account.lastReconciledAt) return {label: "已平衡", tone: "success"};
  return {label: "待对账", tone: "info"};
}

function dateKey(value: string) {return value ? value.slice(0, 10) : "";}
function shortDate(value: string) {return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.slice(5).replace("-", "/") : value;}
function formatLedgerDateTime(value: string) {return formatStoreDateTime(value);}
function formatMoney(value?: number) {return value === undefined ? "—" : new Intl.NumberFormat("zh-CN", {style: "currency", currency: "CNY", minimumFractionDigits: 2, maximumFractionDigits: 2}).format(value);}
function compactMoney(value: number) {return Math.abs(value) >= 10000 ? `${(value / 10000).toFixed(1)}万` : Math.round(value).toLocaleString("zh-CN");}
function formatPercent(value: number, total: number) {return total ? `${((value / total) * 100).toFixed(1)}%` : "0.0%";}
function csvCell(value: string | number) {const text = String(value ?? ""); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;}
