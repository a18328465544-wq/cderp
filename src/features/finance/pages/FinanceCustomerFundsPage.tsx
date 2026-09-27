import {keepPreviousData, useQuery} from "@tanstack/react-query";
import type {ColumnDef} from "@tanstack/react-table";
import {ArrowDownLeft, ArrowUpRight, Filter, RefreshCw} from "lucide-react";
import {ErpSearchInput} from "@/src/components/common";
import {useEffect, useMemo, useState} from "react";
import {Button, Card, Select} from "@/src/components/ui";
import {DashboardSection, ErpFinancePageFrame, ErpDataTable, ErpDetailDrawer, ErpDetailFact, ErpDateRangePicker, ErpFilterBar, ErpMetricCard, ErpPageContent, ErpPageError, ErpPageHeader, ErpPageToolbar, ErpStatusBadge, MetricsRegion, type QuickStatusItemData} from "@/src/components/common";
import {ApiError, customerFundsApi, queryKeys, type AuthSession} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import type {CustomerFundsFilters} from "@/src/services/api/endpoints/finance-remaining";
import type {CustomerFundsRow} from "@/src/types/finance-remaining";
import {formatCurrency} from "@/src/lib/format";
import {storeDate, storeDateAfterDays} from "@/src/utils/storeTime";
import {useUrlSearchState} from "@/src/hooks/useUrlSearchState";
import {isDateKey} from "@/src/lib/dateRangePickerUtils";

function initialFilters(): CustomerFundsFilters {const today = storeDate(); return {startDate: `${today.slice(0, 7)}-01`, endDate: today, trendStartDate: storeDateAfterDays(-6), trendEndDate: today};}
function allowed(session: AuthSession | null | undefined) {return Boolean(session?.permissions.allowedMenus.some((id) => id === "all" || id === "customer_funds"));}

type CustomerFundsUrlState = {
  dateFilters: CustomerFundsFilters;
  keyword: string;
  balance: "all" | "receivable" | "payable" | "balanced";
};

const balanceValues = new Set<CustomerFundsUrlState["balance"]>(["all", "receivable", "payable", "balanced"]);

function parseCustomerFundsUrl(search: string): CustomerFundsUrlState {
  const params = new URLSearchParams(search);
  const defaults = initialFilters();
  const date = (key: keyof CustomerFundsFilters) => {
    const value = params.get(key);
    return value && isDateKey(value) ? value : defaults[key];
  };
  const balance = params.get("balance");
  return {
    dateFilters: {startDate: date("startDate"), endDate: date("endDate"), trendStartDate: date("trendStartDate"), trendEndDate: date("trendEndDate")},
    keyword: (params.get("keyword") || "").slice(0, 100),
    balance: balance && balanceValues.has(balance as CustomerFundsUrlState["balance"]) ? balance as CustomerFundsUrlState["balance"] : "all",
  };
}

function serializeCustomerFundsUrl(value: CustomerFundsUrlState) {
  const params = new URLSearchParams();
  for (const [key, date] of Object.entries(value.dateFilters)) if (isDateKey(date)) params.set(key, date);
  if (value.keyword.trim()) params.set("keyword", value.keyword.trim().slice(0, 100));
  if (value.balance !== "all") params.set("balance", value.balance);
  return params;
}

export function FinanceCustomerFundsPage() {
  const {session, status, error: authError, refresh, logout} = useAuth();
  const canRead = createCapabilities(session).menu("customer_funds") || allowed(session);
  const {value, commit} = useUrlSearchState<CustomerFundsUrlState>({defaultValue: {dateFilters: initialFilters(), keyword: "", balance: "all"}, parse: parseCustomerFundsUrl, serialize: serializeCustomerFundsUrl});
  const query = useQuery({queryKey: queryKeys.finance.customerFunds(value.dateFilters), queryFn: ({signal}) => customerFundsApi.snapshot(value.dateFilters, signal), enabled: canRead, placeholderData: keepPreviousData, retry: false});
  useEffect(() => {if (query.error instanceof ApiError && query.error.isUnauthorized) logout();}, [logout, query.error]);
  if (status === "loading") return <Card><p className="p-5 text-sm">正在验证客户资金权限…</p></Card>;
  if (status === "error") return <ErpPageError title="无法读取登录状态" description={authError?.message || "请重新登录后继续。"} onRetry={() => void refresh()} />;
  if (!session || !canRead) return <ErpPageError title="当前账号没有客户资金权限" description="服务端不会返回资金往来快照。" />;
  if (query.error && !query.data) return <ErpPageError title="客户资金加载失败" description={query.error.message} onRetry={() => void query.refetch()} />;
  return <FinanceCustomerFundsContent dateFilters={value.dateFilters} setDateFilters={(dateFilters) => commit({...value, dateFilters})} keyword={value.keyword} setKeyword={(keyword) => commit({...value, keyword})} balance={value.balance} setBalance={(balance) => commit({...value, balance: balance as CustomerFundsUrlState["balance"]})} query={query} />;
}

function FinanceCustomerFundsContent({dateFilters, setDateFilters, keyword, setKeyword, balance, setBalance, query}: {dateFilters: CustomerFundsFilters; setDateFilters: (value: CustomerFundsFilters) => void; keyword: string; setKeyword: (value: string) => void; balance: string; setBalance: (value: string) => void; query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof customerFundsApi.snapshot>>>>}) {
  const [detail, setDetail] = useState<CustomerFundsRow | null>(null);
  const snapshot = query.data;
  const rows = useMemo(() => {const value = keyword.trim().toLocaleLowerCase(); return (snapshot?.rows || []).filter((row) => (!value || [row.name, row.partnerType, row.contactPerson, row.phone].join(" ").toLocaleLowerCase().includes(value)) && (balance === "all" || balance === "payable" && row.payable > 0 || balance === "receivable" && row.receivable > 0 || balance === "balanced" && row.payable <= 0.009 && row.receivable <= 0.009));}, [balance, keyword, snapshot?.rows]);
  const quickStatus: QuickStatusItemData[] = [{icon: <ArrowDownLeft className="h-4 w-4" />, label: "待收", value: formatCurrency(snapshot?.currentBalance.receivable || 0), description: "客户应收余额", tone: snapshot?.currentBalance.receivable ? "warning" : "success"}, {icon: <ArrowUpRight className="h-4 w-4" />, label: "待付", value: formatCurrency(snapshot?.currentBalance.payable || 0), description: "供应商应付余额", tone: snapshot?.currentBalance.payable ? "warning" : "success"}];
  const columns = useMemo<ColumnDef<CustomerFundsRow, unknown>[]>(() => [{accessorKey: "name", header: "往来方", size: 180, cell: ({row}) => <span className="font-semibold">{row.original.name}</span>}, {accessorKey: "partnerType", header: "类型", size: 120, cell: ({row}) => <ErpStatusBadge label={row.original.partnerType} tone="info" />}, {accessorKey: "creditLevel", header: "等级", size: 90}, {accessorKey: "receivable", header: "应收", size: 120, cell: ({row}) => <span className="erp-data-number text-[var(--erp-color-danger)]">{formatCurrency(row.original.receivable)}</span>}, {accessorKey: "payable", header: "应付", size: 120, cell: ({row}) => <span className="erp-data-number text-[var(--erp-color-warning)]">{formatCurrency(row.original.payable)}</span>}, {accessorKey: "net", header: "净额", size: 120, cell: ({row}) => <span className="erp-data-number font-semibold">{formatCurrency(row.original.net)}</span>}, {accessorKey: "lastActivityDate", header: "最近往来", size: 120}, {accessorKey: "status", header: "状态", size: 100, cell: ({row}) => <ErpStatusBadge label={row.original.status} tone={row.original.status === "合作中" ? "success" : "warning"} />}, {id: "action", header: "操作", size: 80, cell: ({row}) => <Button type="button" size="sm" variant="ghost" onClick={(event) => {event.stopPropagation(); setDetail(row.original);}}>详情</Button>}], []);
  const reset = () => {setKeyword(""); setBalance("all"); setDateFilters(initialFilters());};
  return <ErpFinancePageFrame><ErpPageHeader title="客户资金" subtitle="查看客户应收、供应商应付与往来风险。" quickStatus={quickStatus} actions={<Button type="button" size="sm" variant="secondary" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw className={query.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />刷新</Button>} /><MetricsRegion><Metric label="应收余额" value={formatCurrency(snapshot?.currentBalance.receivable || 0)} detail="客户待收" tone="danger" /><Metric label="应付余额" value={formatCurrency(snapshot?.currentBalance.payable || 0)} detail="供应商待付" tone="warning" /><Metric label="净往来" value={formatCurrency(snapshot?.currentBalance.net || 0)} detail="应收减应付" /><Metric label="期间净现金" value={formatCurrency(snapshot?.cashTotals.difference || 0)} detail="按所选期间" tone="success" /></MetricsRegion><ErpPageToolbar><ErpFilterBar compact actions={<Button type="button" size="sm" variant="ghost" onClick={reset}><Filter className="h-4 w-4" />重置筛选</Button>}><ErpSearchInput className="min-w-56 flex-1" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="客户、供应商、联系人或电话" aria-label="搜索客户资金" /><Select className="w-32" value={balance} options={[{value: "all", label: "全部余额"}, {value: "receivable", label: "有应收"}, {value: "payable", label: "有应付"}, {value: "balanced", label: "已结清"}]} onValueChange={setBalance} aria-label="余额类型" /><ErpDateRangePicker value={{startDate: dateFilters.startDate, endDate: dateFilters.endDate}} onChange={({startDate, endDate}) => setDateFilters({...dateFilters, startDate, endDate})} density="compact" triggerClassName="sm:w-32" startAriaLabel="资金开始日期" endAriaLabel="资金结束日期" ariaLabel="资金日期范围" /></ErpFilterBar></ErpPageToolbar><ErpPageContent className="space-y-[var(--erp-page-gap)]"><MainFunds snapshot={snapshot} /><DashboardSection title="往来方明细" description="点击行查看余额、账期和最近资金事件。"><ErpDataTable ariaLabel="客户资金往来方明细" columns={columns} data={rows} getRowId={(row) => row.id} loading={query.isPending} fetching={query.isFetching} error={query.error as Error | null} errorTitle="客户资金刷新失败" emptyTitle="暂无往来方" emptyDescription="当前筛选条件没有匹配的客户或供应商。" onRetry={() => void query.refetch()} onRowClick={setDetail} stickyHeader density="compact" /></DashboardSection><ErpDetailDrawer modal={false} resizable drawerKey="finance-customer-funds-detail" defaultWidth={680} minWidth={520} maxWidth={820} open={Boolean(detail)} onOpenChange={(open) => {if (!open) setDetail(null);}} title={detail?.name || "往来方详情"} description={detail ? `${detail.partnerType} · ${detail.creditLevel}` : undefined}>{detail && <div className="space-y-5"><div className="grid grid-cols-2 gap-3"><Fact label="应收" value={formatCurrency(detail.receivable)} /><Fact label="应付" value={formatCurrency(detail.payable)} /><Fact label="净额" value={formatCurrency(detail.net)} /><Fact label="账期" value={`${detail.paymentTermDays} 天`} /><Fact label="联系人" value={detail.contactPerson || "—"} /><Fact label="电话" value={detail.phone || "—"} /></div><DashboardSection title="最近资金事件" description="按时间排列的往来记录。">{detail.transactions.length ? <div className="divide-y divide-[var(--erp-color-border)]">{detail.transactions.slice(0, 12).map((tx) => <div key={tx.id} className="flex items-center justify-between gap-3 py-3"><div><p className="text-sm font-semibold">{tx.label}</p><p className="erp-data-number text-xs text-[var(--erp-color-text-muted)]">{tx.date}{tx.documentNo ? ` · ${tx.documentNo}` : ""}</p></div><span className="erp-data-number text-sm">{formatCurrency(tx.amount)}</span></div>)}</div> : <p className="text-sm text-[var(--erp-color-text-secondary)]">暂无交易明细。</p>}</DashboardSection></div>}</ErpDetailDrawer></ErpPageContent></ErpFinancePageFrame>;
}
function MainFunds({snapshot}: {snapshot: Awaited<ReturnType<typeof customerFundsApi.snapshot>> | undefined}) { return <MainRegionPlaceholder snapshot={snapshot} />; }
function MainRegionPlaceholder({snapshot}: {snapshot: Awaited<ReturnType<typeof customerFundsApi.snapshot>> | undefined}) { return <DashboardSection title="近期往来趋势" description="应收、应付与净额的近期变化。"><div className="grid gap-2 sm:grid-cols-3">{(snapshot?.trend || []).map((point) => <div key={point.key} className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3"><p className="text-xs text-[var(--erp-color-text-muted)]">{point.label}</p><p className="mt-2 erp-data-number text-sm">净额 {formatCurrency(point.net)}</p><p className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">应收 {formatCurrency(point.receivable)} · 应付 {formatCurrency(point.payable)}</p></div>)}</div></DashboardSection>; }
function Metric({label, value, detail, tone = "neutral"}: {label: string; value: string; detail: string; tone?: "neutral" | "success" | "warning" | "danger"}) { return <ErpMetricCard label={label} value={value} detail={detail} tone={tone} valueTone={tone} />; }
const Fact = ErpDetailFact;
