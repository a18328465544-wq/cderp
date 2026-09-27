import {keepPreviousData, useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import type {ColumnDef, OnChangeFn, SortingState} from "@tanstack/react-table";
import {BadgePercent, CheckCircle2, Clock3, Filter, RefreshCw, Settings2, UserRound} from "lucide-react";
import {ErpSearchInput} from "@/src/components/common";
import {useMemo, useState} from "react";
import {notify} from "@/src/utils/notification";
import {Button, Card, Input, Select} from "@/src/components/ui";
import {DashboardSection, AnalyticsKpiRegion, AnalyticsMainRegion, AnalyticsToolbar, ErpAnalyticsPageFrame, ErpConfirmDialog, ErpDataTable, ErpDateRangePicker, ErpDetailDrawer, ErpDetailFact, ErpDetailFactGrid, ErpMetricCard, ErpPageContent, ErpPageError, ErpPageHeader, ErpStatusBadge, type QuickStatusItemData} from "@/src/components/common";
import {financeCommissionApi, queryKeys, type AuthSession, type FinanceCommissionFilters} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import {formatCurrency} from "@/src/lib/format";
import type {CommissionRules} from "@/src/types/legacy";
import type {FinanceCommissionItem, FinanceCommissionSummary} from "@/src/types/finance-remaining";
import {CommissionRulesDialog} from "../components/CommissionRulesDialog";
import {FinanceSectionTabs} from "../components/FinanceSectionTabs";

const defaultSummary: FinanceCommissionSummary = {pendingCount: 0, settledCount: 0, voidedCount: 0, handlerCount: 0};

function initialFilters(mode: FinanceCommissionFilters["mode"]): FinanceCommissionFilters {
  return {mode, page: 1, pageSize: 20, keyword: "", status: "", handler: "", dateStart: "", dateEnd: "", sortKey: "createdAt", sortDirection: "desc"};
}

export function FinanceCommissionPage({mode}: {mode: "purchase" | "sales"}) {
  const {session, status, error: authError, refresh} = useAuth();
  const menu = mode === "purchase" ? "purchase_commission" : "sales_commission";
  const allowed = Boolean(createCapabilities(session).menu(menu));
  const [filters, setFilters] = useState<FinanceCommissionFilters>(() => initialFilters(mode));
  const query = useQuery({queryKey: queryKeys.finance.commissions(filters), queryFn: ({signal}) => financeCommissionApi.list(filters, signal), enabled: allowed, placeholderData: keepPreviousData, retry: false});
  const queryClient = useQueryClient();
  const canManageRules = session?.user.role === "老板";
  const [rulesOpen, setRulesOpen] = useState(false);
  const rulesQuery = useQuery({queryKey: queryKeys.finance.commissionRules(), queryFn: ({signal}) => financeCommissionApi.getRules(signal), enabled: allowed && canManageRules && rulesOpen, retry: false});
  const rulesMutation = useMutation({mutationFn: (rules: CommissionRules) => financeCommissionApi.updateRules(rules), onSuccess: async (updated) => {queryClient.setQueryData(queryKeys.finance.commissionRules(), updated); notify.success("提成规则已保存"); await queryClient.invalidateQueries({queryKey: queryKeys.finance.commissionsRoot()});}});
  const openRules = () => { rulesMutation.reset(); setRulesOpen(true); };
  const updateFilters = (patch: Partial<FinanceCommissionFilters>) => setFilters((current) => ({...current, ...patch}));

  if (status === "loading") return <Card><p className="p-5 text-sm">正在验证提成权限…</p></Card>;
  if (status === "error") return <ErpPageError title="无法读取登录状态" description={authError?.message || "请重新登录后继续。"} onRetry={() => void refresh()} />;
  if (!session || !allowed) return <ErpPageError title={`当前账号没有${mode === "purchase" ? "进货" : "销售"}提成权限`} description="服务端不会为未授权账号加载提成数据。" />;
  if (query.error && !query.data) return <ErpPageError title="提成记录加载失败" description={query.error.message} onRetry={() => void query.refetch()} />;
  const rulesError = rulesMutation.error instanceof Error ? rulesMutation.error.message : rulesQuery.error instanceof Error ? rulesQuery.error.message : undefined;
  return <><FinanceCommissionContent mode={mode} session={session} filters={filters} onFiltersChange={updateFilters} items={query.data?.items || []} summary={query.data?.summary || defaultSummary} total={query.data?.meta.total || 0} loading={query.isPending} fetching={query.isFetching} error={query.error as Error | null} onRetry={() => void query.refetch()} canManageRules={canManageRules} onOpenRules={openRules} /><CommissionRulesDialog open={rulesOpen} initialMode={mode} rules={rulesQuery.data || null} loading={rulesQuery.isPending} pending={rulesMutation.isPending} error={rulesError} onOpenChange={setRulesOpen} onRetry={() => void rulesQuery.refetch()} onSave={async (rules) => {await rulesMutation.mutateAsync(rules);}} /></>;
}

function FinanceCommissionContent({mode, session, filters, onFiltersChange, items, summary, total, loading, fetching, error, onRetry, canManageRules, onOpenRules}: {
  mode: "purchase" | "sales";
  session: AuthSession;
  filters: FinanceCommissionFilters;
  onFiltersChange: (patch: Partial<FinanceCommissionFilters>) => void;
  items: FinanceCommissionItem[];
  summary: FinanceCommissionSummary;
  total: number;
  loading: boolean;
  fetching: boolean;
  error: Error | null;
  onRetry: () => void;
  canManageRules: boolean;
  onOpenRules: () => void;
}) {
  const [detail, setDetail] = useState<FinanceCommissionItem | null>(null);
  const [settling, setSettling] = useState<FinanceCommissionItem | null>(null);
  const queryClient = useQueryClient();
  const showProfit = session.permissions.showProfit;
  const canSettle = session.user.role === "老板";
  const settleMutation = useMutation({
    mutationFn: (id: string) => financeCommissionApi.settle(mode, [id]),
    onSuccess: async () => {
      notify.success("提成已标记为已结算；系统未自动生成账户出账");
      setSettling(null);
      setDetail(null);
      await queryClient.invalidateQueries({queryKey: queryKeys.finance.commissionsRoot()});
    },
    onError: (caught: Error) => notify.error(caught.message),
  });
  const sorting: SortingState = filters.sortKey ? [{id: filters.sortKey, desc: filters.sortDirection === "desc"}] : [];
  const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
    const next = typeof updater === "function" ? updater(sorting) : updater;
    const first = next[0];
    onFiltersChange({sortKey: first?.id || "createdAt", sortDirection: first?.desc ? "desc" : "asc", page: 1});
  };
  const columns = useMemo<ColumnDef<FinanceCommissionItem, unknown>[]>(() => [
    {accessorKey: "productName", header: "商品", size: 220},
    {accessorKey: "sn", header: "SN", size: 150, cell: ({row}) => <span className="erp-data-number">{row.original.sn || "—"}</span>},
    {accessorKey: "handler", header: "经办人", size: 120},
    {accessorKey: "documentNo", header: "关联单据", size: 150},
    {accessorKey: "status", header: "状态", size: 100, cell: ({row}) => <ErpStatusBadge label={row.original.status} tone={row.original.status === "已结算" ? "success" : row.original.status === "已冲销" ? "danger" : "warning"} />},
    {id: "baseAmount", accessorFn: (row) => row.baseAmount ?? null, header: mode === "purchase" ? "成本" : "销售额", size: 120, enableSorting: showProfit, cell: ({row}) => showProfit && row.original.baseAmount !== undefined ? formatCurrency(row.original.baseAmount) : <span className="text-xs text-[var(--erp-color-text-muted)]">无权限</span>},
    {id: "grossProfit", accessorFn: (row) => row.grossProfit ?? null, header: "毛利", size: 120, enableSorting: showProfit, cell: ({row}) => showProfit && row.original.grossProfit !== undefined ? formatCurrency(row.original.grossProfit) : <span className="text-xs text-[var(--erp-color-text-muted)]">无权限</span>},
    {id: "commissionAmount", accessorFn: (row) => row.commissionAmount ?? null, header: "提成", size: 110, enableSorting: showProfit, cell: ({row}) => showProfit && row.original.commissionAmount !== undefined ? <span className="erp-data-number font-semibold text-[var(--erp-color-success)]">{formatCurrency(row.original.commissionAmount)}</span> : <span className="text-xs text-[var(--erp-color-text-muted)]">无权限</span>},
    {accessorKey: "id", header: "记录编号", size: 150, cell: ({row}) => <span className="erp-data-number text-[var(--erp-color-primary)]">{row.original.id}</span>},
    {id: "action", header: "操作", size: 170, enableSorting: false, cell: ({row}) => <div className="flex gap-1"><Button type="button" size="sm" variant="ghost" onClick={(event) => {event.stopPropagation(); setDetail(row.original);}}>详情</Button>{canSettle && row.original.status === "待结算" && <Button type="button" size="sm" variant="secondary" disabled={settleMutation.isPending} onClick={(event) => {event.stopPropagation(); setSettling(row.original);}}>结算</Button>}</div>},
  ], [canSettle, mode, settleMutation, showProfit]);
  const quickStatus: QuickStatusItemData[] = [
    {icon: <BadgePercent className="h-4 w-4" />, label: "记录数", value: `${total} 条`, description: "当前筛选范围", tone: "info"},
    {icon: <UserRound className="h-4 w-4" />, label: "经办人", value: `${summary.handlerCount} 人`, description: "当前筛选范围", tone: "neutral"},
  ];
  const statuses = [{value: "", label: "全部状态"}, {value: "待结算", label: "待结算"}, {value: "已结算", label: "已结算"}, {value: "已冲销", label: "已冲销"}];
  const resetFilters = () => onFiltersChange({keyword: "", status: "", handler: "", dateStart: "", dateEnd: "", page: 1});
  const commissionTotal = showProfit && summary.totalCommission !== undefined ? formatCurrency(summary.totalCommission) : "无权限";
  return <ErpAnalyticsPageFrame>
    <ErpPageHeader title="员工提成" subtitle={mode === "purchase" ? "查看采购经办人的真实提成计算结果。" : "查看销售经办人的真实提成计算结果。"} quickStatus={quickStatus} actions={<div className="flex flex-wrap gap-2">{canManageRules ? <Button type="button" size="sm" variant="secondary" onClick={onOpenRules}><Settings2 className="h-4 w-4" />提成设置</Button> : null}<Button type="button" size="sm" variant="secondary" onClick={onRetry} disabled={fetching}><RefreshCw className={fetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />刷新</Button></div>} />
    <ErpPageContent className="space-y-[var(--erp-page-gap)]">
      <FinanceSectionTabs label="员工提成分类" items={[{label: "进货提成", path: "/finance/purchase-commission", visible: session.permissions.allowedMenus.some((id) => id === "all" || id === "purchase_commission")}, {label: "销售提成", path: "/finance/sales-commission", visible: session.permissions.allowedMenus.some((id) => id === "all" || id === "sales_commission")}]} />
      <AnalyticsKpiRegion primary={<><ErpMetricCard label="提成金额" value={commissionTotal} detail={showProfit ? "当前筛选范围，按冲减后金额" : "需要 showProfit 权限"} icon={<BadgePercent className="h-4 w-4" />} tone={showProfit ? "success" : "neutral"} /><ErpMetricCard label="已结算" value={`${summary.settledCount} 条`} detail="后端记录状态" icon={<CheckCircle2 className="h-4 w-4" />} tone="success" /></>} secondary={<><ErpMetricCard label="提成记录" value={`${total} 条`} detail="当前筛选范围" icon={<BadgePercent className="h-4 w-4" />} tone="info" variant="compact" /><ErpMetricCard label="待结算" value={`${summary.pendingCount} 条`} detail="尚未完成结算" icon={<Clock3 className="h-4 w-4" />} tone="warning" variant="compact" /></>} />
      <AnalyticsToolbar actions={<Button type="button" size="sm" variant="ghost" onClick={resetFilters} disabled={!filters.keyword && !filters.status && !filters.handler && !filters.dateStart && !filters.dateEnd}><Filter className="h-4 w-4" />重置筛选</Button>}>
        <ErpSearchInput className="min-w-64 flex-1" value={filters.keyword} onChange={(event) => onFiltersChange({keyword: event.target.value, page: 1})} placeholder="记录编号、SN、商品或经办人" aria-label="搜索提成记录" />
        <Select className="w-32" value={filters.status} options={statuses} onValueChange={(value) => onFiltersChange({status: value, page: 1})} aria-label="提成状态" />
        <Input className="w-36" value={filters.handler} onChange={(event) => onFiltersChange({handler: event.target.value, page: 1})} placeholder="经办人" aria-label="提成经办人" />
        <ErpDateRangePicker value={{startDate: filters.dateStart, endDate: filters.dateEnd}} onChange={({startDate, endDate}) => onFiltersChange({dateStart: startDate, dateEnd: endDate, page: 1})} density="compact" triggerClassName="w-36" startAriaLabel="提成开始日期" endAriaLabel="提成结束日期" ariaLabel="提成日期范围" />
      </AnalyticsToolbar>
      <AnalyticsMainRegion variant="full"><AnalyticsMainRegion.Visualization size="expanded"><DashboardSection title="提成明细" description="筛选、排序和分页均由服务端执行；金额按退货冲减后的有效提成展示。"><ErpDataTable ariaLabel="员工提成明细" surface="plain" columns={columns} data={items} getRowId={(row) => row.id} loading={loading} fetching={fetching} error={error} errorTitle="提成记录刷新失败" emptyTitle="暂无提成记录" emptyDescription="当前筛选没有匹配记录。" onRetry={onRetry} onRowClick={setDetail} stickyHeader density="compact" mobileFields={7} manualSorting sorting={sorting} onSortingChange={handleSortingChange} page={filters.page} pageSize={filters.pageSize} total={total} onPageChange={(page) => onFiltersChange({page})} onPageSizeChange={(pageSize) => onFiltersChange({page: 1, pageSize})} /></DashboardSection></AnalyticsMainRegion.Visualization></AnalyticsMainRegion>
      <ErpDetailDrawer open={Boolean(detail)} modal={false} resizable drawerKey="finance-commission-detail" defaultWidth={680} minWidth={520} maxWidth={820} onOpenChange={(open) => {if (!open) setDetail(null);}} title={detail?.productName || "提成详情"} description={detail ? `${detail.handlerType} · ${detail.id}` : undefined}>
        {detail && <div className="space-y-4"><ErpDetailFactGrid><Fact label="经办人" value={detail.handler} /><Fact label="关联单据" value={detail.documentNo} /><Fact label="状态" value={detail.status} /><Fact label="创建时间" value={detail.createdAt || "—"} /><Fact label="结算时间" value={detail.settledAt || "未结算"} /><Fact label="结算批次" value={detail.settlementBatchId || "—"} />{showProfit && <><Fact label="基础金额" value={detail.baseAmount === undefined ? "—" : formatCurrency(detail.baseAmount)} /><Fact label="毛利" value={detail.grossProfit === undefined ? "—" : formatCurrency(detail.grossProfit)} /><Fact label="提成比例" value={detail.rate === undefined ? "—" : `${(detail.rate * 100).toFixed(2)}%`} /><Fact label="原始提成" value={detail.originalCommissionAmount === undefined ? "—" : formatCurrency(detail.originalCommissionAmount)} /><Fact label="退货冲减" value={detail.adjustmentAmount === undefined ? "—" : formatCurrency(detail.adjustmentAmount)} /><Fact label="有效提成" value={detail.commissionAmount === undefined ? "—" : formatCurrency(detail.commissionAmount)} /><Fact label="计算方式" value={detail.calculationMethod || "—"} /></>}</ErpDetailFactGrid>{showProfit && detail.adjustments?.length ? <div className="space-y-2"><p className="text-sm font-semibold">冲减明细</p>{detail.adjustments.map((adjustment) => <div key={adjustment.id} className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3 text-sm"><div className="flex justify-between gap-3"><span>{adjustment.reason}</span><span className="erp-data-number">{formatCurrency(adjustment.amount)}</span></div><p className="mt-1 text-xs text-[var(--erp-color-text-muted)]">{adjustment.documentNo || "无关联单据"} · {adjustment.createdAt} · {adjustment.createdBy}</p></div>)}</div> : null}{detail.remarks && <p className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3 text-sm text-[var(--erp-color-text-secondary)]">{detail.remarks}</p>}</div>}
      </ErpDetailDrawer>
      <ErpConfirmDialog
        open={Boolean(settling)}
        title="确认结算提成"
        description={settling ? `确认将提成记录「${settling.id}」标记为已结算吗？此操作只更新提成状态，不会自动扣减资金账户。` : ""}
        confirmLabel="确认结算"
        pendingLabel="结算中…"
        pending={settleMutation.isPending}
        error={settleMutation.error instanceof Error ? settleMutation.error.message : undefined}
        onOpenChange={(open) => {if (!open && !settleMutation.isPending) {setSettling(null); settleMutation.reset();}}}
        onConfirm={() => {if (settling) settleMutation.mutate(settling.id);}}
      />
    </ErpPageContent>
  </ErpAnalyticsPageFrame>;
}

const Fact = ErpDetailFact;
