import {displayQueryValue} from "@/src/utils/queryDisplay";
import {useDebouncedValue} from "@/src/hooks/useDebouncedValue";
import {keepPreviousData, useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useNavigate} from "@tanstack/react-router";
import type {ColumnDef, SortingState, VisibilityState} from "@tanstack/react-table";
import {Banknote, CircleDollarSign, FileText, Filter, ListFilter, LockKeyhole, PackageCheck, Plus, RefreshCw, RotateCcw, ShoppingCart, Truck} from "lucide-react";
import {ErpSearchInput} from "@/src/components/common";
import {useCallback, useEffect, useMemo, useState, type ReactNode} from "react";
import {notify} from "@/src/utils/notification";
import {Button, Card, CardContent, Select} from "@/src/components/ui";
import {useErpPhone} from "@/src/hooks/useErpViewport";
import {ErpMobileRecordRow} from "@/src/components/common/ErpMobileRecordRow";
import {ErpMobileSummary, ErpColumnVisibilityMenu, ErpDataTable, ErpDateRangePicker, ErpDetailDrawer, ErpDetailFact, ErpDocumentDeleteDialog, ErpEmptyState, ErpFilterBar, ErpListPageFrame, ErpLoadingState, ErpMetricCard, ErpOutstandingSettlementDialog, ErpPageContent, ErpPageError, ErpPageHeader, ErpPageToolbar, ErpTableResultsBar, MetricsRegion, type QuickStatusItemData} from "@/src/components/common";
import {ApiError, queryKeys, salesApi} from "@/src/services/api";
import {financeAccountsApi, financeSettlementApi, invalidateErpDomains} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import {useTablePreferences} from "@/src/hooks/useTablePreferences";
import {useUrlSearchState} from "@/src/hooks/useUrlSearchState";
import {useWorkspaceTabActivity} from "@/src/hooks/useWorkspaceTabRuntime";
import type {AuthSession} from "@/src/services/api";
import type {LinkedSettlementContext} from "@/src/types/finance-settlement";
import {formatCurrency} from "@/src/lib/format";
import {salesChannelValues, salesOutboundStatusValues, salesPaymentStatusValues} from "@/src/types/sales";
import type {SalesListFilters, SalesListItem, SalesListLine, SalesListSortKey} from "@/src/types/sales";
import {cn} from "@/src/lib/cn";
import {createSalesListColumns} from "../sales.columns";
import {SalesDetailActions} from "../components/SalesDetailActions";
import {countActiveSalesListFilters, defaultSalesListFilters, parseSalesListFilters, salesListFiltersToSearch, selectSalesList} from "../sales.filters";

const permissionDefaults = {showCost: false, showProfit: false, canDelete: false, canEditHistory: false, allowedMenus: [] as string[]};
const emptyVisibility: VisibilityState = {channel: false, handleBy: false};
const channelOptions = [{value: "", label: "全部销售渠道"}, ...salesChannelValues.map((value) => ({value, label: value}))];
const paymentOptions = [{value: "", label: "全部收款状态"}, ...salesPaymentStatusValues.map((value) => ({value, label: value}))];
const outboundOptions = [{value: "", label: "全部出库状态"}, ...salesOutboundStatusValues.map((value) => ({value, label: value}))];

function useSalesListUrlState() {
  const {value, commit} = useUrlSearchState({
    defaultValue: {filters: defaultSalesListFilters, detailId: null as string | null},
    parse: (search) => ({filters: parseSalesListFilters(search), detailId: new URLSearchParams(search).get("detail")}),
    serialize: (state: {filters: SalesListFilters; detailId: string | null}) => {
      const params = salesListFiltersToSearch(state.filters);
      if (state.detailId) params.set("detail", state.detailId);
      return params;
    },
  });
  const commitFilters = (filters: SalesListFilters) => commit({filters, detailId: value.detailId});
  const commitDetail = (detailId: string | null) => commit({filters: value.filters, detailId});
  return {filters: value.filters, commitFilters, detailId: value.detailId, commitDetail};
}

export function SalesListPage() {
  const {active} = useWorkspaceTabActivity();
  const navigate = useNavigate();
  const {session, logout} = useAuth();
  const {filters, commitFilters, detailId, commitDetail} = useSalesListUrlState();
  const keyword = useDebouncedValue(filters.keyword, 300);
  const requestFilters = {...filters, keyword};
  const permissions = session?.permissions || permissionDefaults;
  const allowed = createCapabilities(session).menu("sales_list");
  const listQuery = useQuery({
    queryKey: queryKeys.sales.list({userId: session?.user.id || "anonymous", showCost: permissions.showCost, showProfit: permissions.showProfit}, requestFilters),
    queryFn: ({signal}) => salesApi.list(requestFilters, {showCost: permissions.showCost, showProfit: permissions.showProfit}, signal),
    enabled: active && Boolean(session && allowed) && keyword === filters.keyword,
    placeholderData: keepPreviousData,
    retry: false,
  });

  if (!session) return <Card><ErpLoadingState title="正在验证登录状态" /></Card>;
  if (!session || !allowed) return <ErpPageError title="当前账号没有销售单据权限" description="服务器已拒绝 sales_list 菜单访问，请联系管理员授权。" />;

  return <SalesListContent
    filters={filters}
    commitFilters={commitFilters}
    detailId={detailId}
    commitDetail={commitDetail}
    session={session}
    query={listQuery}
    filterPending={keyword !== filters.keyword}
    onCreate={() => void navigate({to: "/sales/new"})}
    onRefresh={() => void listQuery.refetch()}
    onAuthExpired={logout}
  />;
}

function SalesListContent({filters, commitFilters, detailId, commitDetail, session, query, filterPending, onCreate, onRefresh, onAuthExpired}: {
  filters: SalesListFilters;
  commitFilters: (filters: SalesListFilters) => void;
  detailId: string | null;
  commitDetail: (id: string | null) => void;
  session: AuthSession;
  filterPending: boolean;
  query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof salesApi.list>>>>;
  onCreate: () => void;
  onRefresh: () => void;
  onAuthExpired: () => void;
}) {
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState<SalesListItem | null>(null);
  const [settling, setSettling] = useState<SalesListItem | null>(null);
  const {columnVisibility, setColumnVisibility, density, setDensity} = useTablePreferences<VisibilityState>({feature: "sales-list", userId: session.user.id, defaultVisibility: emptyVisibility});
  const selection = useMemo(() => query.data?.selection || selectSalesList(query.data?.items || [], filters), [filters, query.data]);
  const metricValue = (value: string | number) => displayQueryValue(query, value, filterPending);
  const {active} = useWorkspaceTabActivity();
  const phone = useErpPhone();
  const updateFilters = useCallback((patch: Partial<SalesListFilters>) => commitFilters({...filters, ...patch, page: 1}), [commitFilters, filters]);
  const phoneStatusPresets = useMemo(() => [
    {id: "all", label: "全部", active: !filters.paymentStatus && !filters.outboundStatus, apply: () => updateFilters({paymentStatus: "", outboundStatus: ""})},
    {id: "pending_outbound", label: "待出库", count: selection.summary.pendingOutboundCount, active: filters.outboundStatus === "待出库" && !filters.paymentStatus, apply: () => updateFilters({outboundStatus: "待出库", paymentStatus: ""})},
    {id: "pending_payment", label: "待收款", count: selection.summary.pendingPaymentCount, active: filters.paymentStatus === "未收款" && !filters.outboundStatus, apply: () => updateFilters({paymentStatus: "未收款", outboundStatus: ""})},
    {id: "completed", label: "已完成", active: filters.outboundStatus === "已出库" && filters.paymentStatus === "已收款", apply: () => updateFilters({outboundStatus: "已出库", paymentStatus: "已收款"})},
  ], [filters.outboundStatus, filters.paymentStatus, selection.summary.pendingOutboundCount, selection.summary.pendingPaymentCount, updateFilters]);
  const selectedDetailFromPage = useMemo(() => query.data?.items.find((item) => item.id === detailId || item.invoiceNo === detailId) || null, [detailId, query.data?.items]);
  const detailQuery = useQuery({
    queryKey: queryKeys.sales.detail(detailId || ""),
    queryFn: ({signal}) => salesApi.findByReference(detailId || "", {showCost: session.permissions.showCost, showProfit: session.permissions.showProfit}, signal),
    enabled: active && Boolean(detailId && !selectedDetailFromPage),
    retry: false,
  });
  useEffect(() => {if (detailQuery.error instanceof ApiError && detailQuery.error.isUnauthorized) onAuthExpired();}, [detailQuery.error, onAuthExpired]);
  const selectedDetail = selectedDetailFromPage || detailQuery.data || null;
  const canReceive = createCapabilities(session).menu("payment_in") && createCapabilities(session).menu("settlement_accounts");
  const accountsQuery = useQuery({queryKey: queryKeys.finance.accounts(), queryFn: ({signal}) => financeAccountsApi.listAll(signal), enabled: active && Boolean(canReceive), staleTime: 60_000, retry: false});
  const openDetail = useCallback((item: SalesListItem) => commitDetail(item.id), [commitDetail]);
  const invalidate = () => invalidateErpDomains(queryClient, ["sales", "inventory", "finance", "customers", "crm", "state"]);
  const handleMutationError = (error: Error) => {if (error instanceof ApiError && error.isUnauthorized) {onAuthExpired(); return;} notify.error(error.message);};
  const deleteMutation = useMutation({mutationFn: (id: string) => salesApi.remove(id), onSuccess: async (result, id) => {setDeleting(null); commitDetail(null); notify.success(`销售单 ${result.invoiceNo || id} 已删除`, {description: "关联待出库占用、收款流水和财务关联已由服务端同步清理。"}); await invalidate();}, onError: handleMutationError});
  const settlementContext: LinkedSettlementContext | null = settling && settling.unpaidAmount > 0 ? {kind: "income", relatedDocType: "销售单", relatedDocNo: settling.invoiceNo || settling.id, partyName: settling.customerName, partyId: settling.customerId, partnerType: settling.customerPartnerType, defaultAccountId: settling.settlementAccountId, remainingAmount: settling.unpaidAmount} : null;
  const settlementMutation = useMutation({
    mutationFn: (values: Parameters<typeof financeSettlementApi.createIncome>[0]) => {
      if (!settlementContext) throw new Error("销售单未处于待收款状态");
      return financeSettlementApi.createIncome(values, settlementContext, session.user.displayName);
    },
    onSuccess: async () => {setSettling(null); notify.success("销售收款已补录", {description: "已关联原销售单，并同步更新收款状态与往来余额。"}); await invalidateErpDomains(queryClient, ["sales", "finance", "customers", "vendors", "state"]);},
    onError: handleMutationError,
  });
  const columns = useMemo(() => createSalesListColumns({showProfit: session.permissions.showProfit, canDelete: session.permissions.canDelete, canReceive, onDetail: openDetail, onDelete: setDeleting, onReceive: setSettling}), [canReceive, openDetail, session.permissions.canDelete, session.permissions.showProfit]);
  const activeFilterCount = countActiveSalesListFilters(filters);
  const canCreate = createCapabilities(session).menu("sales_add");
  const sorting: SortingState = [{id: filters.sortKey, desc: filters.sortDirection === "desc"}];
  const sortableColumns = new Set<SalesListSortKey>(["date", "invoiceNo", "customerName", "totalCount", "totalAmount", "totalProfit", "paymentStatus", "outboundStatus", "handleBy"]);
  const onSortingChange = (updater: SortingState | ((old: SortingState) => SortingState)) => {
    const next = typeof updater === "function" ? updater(sorting) : updater;
    const first = next[0];
    const candidate = first?.id as SalesListSortKey | undefined;
    const sortKey = candidate && sortableColumns.has(candidate) ? candidate : "date";
    commitFilters({...filters, sortKey, sortDirection: first?.desc ? "desc" : "asc", page: 1});
  };
  const quickStatus: QuickStatusItemData[] = [
    {icon: <ListFilter className="h-4 w-4" />, label: "筛选状态", value: activeFilterCount ? `${activeFilterCount} 项` : "全部", description: "已同步到当前 URL", tone: activeFilterCount ? "info" : "neutral"},
    {icon: <Truck className="h-4 w-4" />, label: "待出库", value: metricValue(`${selection.summary.pendingOutboundCount} 单`), description: "等待仓库绑定 SN", tone: selection.summary.pendingOutboundCount ? "warning" : "success"},
    {icon: <LockKeyhole className="h-4 w-4" />, label: "利润权限", value: session.permissions.showProfit ? "可查看" : "已隐藏", description: "按账号权限裁剪", tone: session.permissions.showProfit ? "success" : "neutral"},
  ];

  return <>
    <ErpListPageFrame>
      <ErpPageHeader title="销售单据" subtitle="查看销售客户、成交金额、收款状态和出库进度。" quickStatus={quickStatus} actions={<><Button type="button" size="sm" variant="secondary" onClick={onRefresh} disabled={query.isFetching}><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />刷新</Button>{canCreate && <Button type="button" size="sm" variant="primary" onClick={onCreate}><Plus className="h-4 w-4" />新建销售单</Button>}</>} />
      <ErpPageContent mobileSearchFirst className="space-y-[var(--erp-page-gap)]">
      <ErpMobileSummary label="销售统计" summary={metricValue(`${selection.summary.orderCount} 单 · 待出库 ${selection.summary.pendingOutboundCount}`)}><MetricsRegion>
        <MetricCard label="销售单数" value={metricValue(`${selection.summary.orderCount} 单`)} detail="按当前筛选" icon={<FileText className="h-4 w-4" />} />
        <MetricCard label="销售金额" value={metricValue(formatCurrency(selection.summary.totalAmount))} detail="当前筛选汇总" icon={<ShoppingCart className="h-4 w-4" />} />
        <MetricCard label="销售件数" value={metricValue(`${selection.summary.unitCount} 件`)} detail="销售单实物数量" icon={<PackageCheck className="h-4 w-4" />} />
        <MetricCard label="待收款" value={metricValue(`${selection.summary.pendingPaymentCount} 单`)} detail="未收款 / 部分收款" tone={selection.summary.pendingPaymentCount ? "warning" : "neutral"} icon={<Banknote className="h-4 w-4" />} />
        <MetricCard label="待出库" value={metricValue(`${selection.summary.pendingOutboundCount} 单`)} detail="等待仓库处理" tone={selection.summary.pendingOutboundCount ? "warning" : "neutral"} icon={<Truck className="h-4 w-4" />} />
        {session.permissions.showProfit && <MetricCard label="销售利润" value={metricValue(selection.summary.totalProfit === undefined ? "—" : formatCurrency(selection.summary.totalProfit))} detail="当前筛选汇总" icon={<CircleDollarSign className="h-4 w-4" />} />}
      </MetricsRegion></ErpMobileSummary>

      <ErpPageToolbar>
        {phone && (
          <div className="erp-phone-chips-scroll mb-2" role="group" aria-label="快捷状态筛选">
            {phoneStatusPresets.map((preset) => (
              <Button
                key={preset.id}
                type="button"
                size="sm"
                variant={preset.active ? "secondary" : "ghost"}
                className={cn("erp-phone-chip shrink-0", preset.active && "erp-phone-chip-active font-semibold")}
                aria-pressed={preset.active}
                onClick={preset.apply}
              >
                <span>{preset.label}</span>
                {preset.count !== undefined && preset.count > 0 && (
                  <span className="tabular-nums text-xs opacity-80">({preset.count})</span>
                )}
              </Button>
            ))}
          </div>
        )}
        <ErpFilterBar mobileActiveCount={activeFilterCount - Number(Boolean(filters.keyword))} mobilePrimary={<ErpSearchInput className="min-w-[260px] flex-1" value={filters.keyword} onChange={(event) => updateFilters({keyword: event.target.value})} placeholder="搜索销售单号、客户、商品、SN 或经办人" aria-label="搜索销售单据" />} actions={<Button type="button" variant="ghost" size="sm" onClick={() => commitFilters(defaultSalesListFilters)}><RotateCcw className="h-4 w-4" />重置筛选</Button>}>
        <Select className="w-36" value={filters.channel} options={channelOptions} onValueChange={(value) => updateFilters({channel: value as SalesListFilters["channel"]})} aria-label="销售渠道筛选" />
        <Select className="w-36" value={filters.paymentStatus} options={paymentOptions} onValueChange={(value) => updateFilters({paymentStatus: value as SalesListFilters["paymentStatus"]})} aria-label="收款状态筛选" />
        <Select className="w-36" value={filters.outboundStatus} options={outboundOptions} onValueChange={(value) => updateFilters({outboundStatus: value as SalesListFilters["outboundStatus"]})} aria-label="出库状态筛选" />
        <ErpDateRangePicker value={{startDate: filters.dateStart, endDate: filters.dateEnd}} onChange={({startDate, endDate}) => updateFilters({dateStart: startDate, dateEnd: endDate})} triggerClassName="sm:w-36" startAriaLabel="销售开始日期" endAriaLabel="销售结束日期" ariaLabel="销售日期范围" />
      </ErpFilterBar></ErpPageToolbar>

      {!phone && <ErpTableResultsBar summary={<span className="flex items-center gap-2"><Filter className="h-4 w-4 text-[var(--erp-color-primary)]" />共 {selection.meta.total} 条</span>} actions={<><ErpColumnVisibilityMenu columns={columns} visibility={columnVisibility} defaultVisibility={emptyVisibility} onVisibilityChange={setColumnVisibility} /><div className="inline-flex rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-0.5"><Button type="button" size="sm" variant={density === "comfortable" ? "secondary" : "ghost"} onClick={() => setDensity("comfortable")}>舒适</Button><Button type="button" size="sm" variant={density === "compact" ? "secondary" : "ghost"} onClick={() => setDensity("compact")}>紧凑</Button></div></>} />}

      <ErpDataTable mobileRow={(item) => <ErpMobileRecordRow title={item.invoiceNo} subtitle={item.customerName} meta={`${item.totalCount} 件 · ${item.date} · ${item.handleBy}`} amount={formatCurrency(item.totalAmount)} status={<span>{item.paymentStatus} · {item.outboundStatus}</span>} onOpen={() => openDetail(item)} />} mobileFields={6} mobileFieldOrder={["customerName","totalAmount","paymentStatus","outboundStatus","handleBy","date","totalCount"]} ariaLabel="销售单据明细" columns={columns} data={selection.data} getRowId={(row) => row.id} loading={query.isPending} fetching={query.isFetching || filterPending} error={query.error as Error | null} errorTitle="销售单据加载失败" emptyTitle="暂无销售单据" emptyDescription={activeFilterCount ? "当前筛选条件没有匹配的销售单。" : "服务器当前没有返回销售单据。"} onRetry={() => void query.refetch()} onRowClick={openDetail} mobileShowDetailAction={false} manualSorting sorting={sorting} onSortingChange={onSortingChange} page={selection.meta.page} pageSize={selection.meta.pageSize} total={selection.meta.total} onPageChange={(page) => commitFilters({...filters, page})} onPageSizeChange={(pageSize) => commitFilters({...filters, page: 1, pageSize})} columnVisibility={columnVisibility} onColumnVisibilityChange={setColumnVisibility} enableColumnResizing density={density} stickyHeader />
      </ErpPageContent>
    </ErpListPageFrame>

    <ErpDetailDrawer open={Boolean(detailId)} onOpenChange={(open) => {if (!open) commitDetail(null);}} modal={false} resizable drawerKey="sales-detail" defaultWidth={900} minWidth={720} maxWidth={1160} title={selectedDetail?.invoiceNo || detailId || "销售单摘要"} description="销售单摘要" footer={selectedDetail ? <SalesDetailActions item={selectedDetail} canReceive={canReceive} canEditHistory={session.permissions.canEditHistory} canDelete={session.permissions.canDelete} onReceive={(item) => {settlementMutation.reset(); setSettling(item);}} onDelete={setDeleting} /> : undefined}>
      {selectedDetail ? <SalesSnapshotDetail item={selectedDetail} showCost={session.permissions.showCost} showProfit={session.permissions.showProfit} /> : detailQuery.isPending || query.isPending ? <ErpLoadingState title="正在定位销售单" description="正在跨页查找完整销售单明细。" /> : detailQuery.error ? <ErpEmptyState title="销售单详情加载失败" description={(detailQuery.error as Error).message} action={<Button type="button" size="sm" variant="secondary" onClick={() => void detailQuery.refetch()}>重试</Button>} /> : <div className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-warning-soft)] p-4 text-sm text-[var(--erp-color-warning)]">当前未找到该销售单，可能已删除或当前账号无权查看。</div>}
    </ErpDetailDrawer>
    <ErpOutstandingSettlementDialog open={Boolean(settling)} context={settlementContext} accounts={accountsQuery.data?.accounts || []} accountsLoading={accountsQuery.isPending || accountsQuery.isFetching} error={settlementMutation.error instanceof Error ? settlementMutation.error.message : accountsQuery.error instanceof Error ? accountsQuery.error.message : undefined} pending={settlementMutation.isPending} onOpenChange={(open) => {if (!open) {setSettling(null); settlementMutation.reset();}}} onSubmit={(values) => settlementMutation.mutateAsync(values).then(() => undefined)} />
    <ErpDocumentDeleteDialog
      open={Boolean(deleting)}
      title="删除销售单"
      documentName={deleting?.invoiceNo || "当前销售单"}
      description="仅待出库销售单允许删除；服务端会再次检查出库状态，并同步恢复关联库存、收款流水和财务记录。"
      pending={deleteMutation.isPending}
      error={deleteMutation.error instanceof Error ? deleteMutation.error.message : undefined}
      onOpenChange={(open) => {if (!open) {setDeleting(null); deleteMutation.reset();}}}
      onConfirm={() => {if (deleting) deleteMutation.mutate(deleting.id);}}
    />
  </>;
}

export function SalesSnapshotDetail({item, showCost, showProfit}: {item: SalesListItem; showCost: boolean; showProfit: boolean}) {
  const phone = useErpPhone();
  const columns = useMemo<ColumnDef<SalesListLine, unknown>[]>(() => {
    const result: ColumnDef<SalesListLine, unknown>[] = [
      {accessorKey: "productName", header: "商品", size: 220, cell: ({row}) => <div><p className="font-semibold">{row.original.productName}</p><p className="mt-1 erp-data-number text-xs text-[var(--erp-color-text-muted)]">{row.original.sn || "SN 待出库绑定"}</p></div>},
      {accessorKey: "condition", header: "成色", size: 90, cell: ({getValue}) => String(getValue() || "—")},
      {accessorKey: "quantity", header: "数量", size: 70, cell: ({getValue}) => `${Number(getValue() || 0)} 件`},
      {accessorKey: "sellPrice", header: "售价", size: 100, cell: ({getValue}) => <span className="erp-data-number font-semibold">{formatCurrency(Number(getValue() || 0))}</span>},
    ];
    if (showCost) result.push({accessorKey: "costPrice", header: "成本", size: 100, cell: ({getValue}) => getValue() === undefined ? "—" : formatCurrency(Number(getValue()))});
    if (showProfit) result.push({accessorKey: "profit", header: "利润", size: 100, cell: ({getValue}) => <span className="erp-data-number text-[var(--erp-color-success)]">{getValue() === undefined ? "—" : formatCurrency(Number(getValue()))}</span>});
    return result;
  }, [showCost, showProfit]);
  if (phone) return <div className="erp-phone-document" data-phone-detail="document">
    <section><DetailFact label="客户" value={item.customerName || "—"} /><DetailFact label="下单日期" value={item.date} /><DetailFact label="经办人" value={item.handleBy || "—"} /><DetailFact label="状态" value={`${item.paymentStatus} · ${item.outboundStatus}`} /></section>
    <section><h2>商品明细</h2><ErpDataTable mobileSorting={false} mobileRow={(line) => <div className="erp-phone-line-fact"><div><strong>{line.productName}</strong><small>{line.condition} · {line.quantity} 件 · SN {line.sn || "待出库绑定"}</small>{showCost && line.costPrice !== undefined && <small>成本 {formatCurrency(line.costPrice)}</small>}{showProfit && line.profit !== undefined && <small>利润 {formatCurrency(line.profit)}</small>}</div><span className="erp-data-number">{formatCurrency(line.sellPrice)}</span></div>} ariaLabel="销售单商品明细" columns={columns} data={item.lines} getRowId={(line) => line.id} surface="plain" emptyTitle="该销售单没有商品明细" /></section>
    <section><h2>结算</h2><DetailFact label="销售金额" value={formatCurrency(item.totalAmount)} /><DetailFact label="已收款" value={formatCurrency(item.paidAmount)} /><DetailFact label="未收款" value={formatCurrency(item.unpaidAmount)} />{showProfit && item.totalProfit !== undefined && <DetailFact label="销售利润" value={formatCurrency(item.totalProfit)} />}</section>
    <details><summary>物流与补充信息</summary><DetailFact label="联系方式" value={item.contact || "—"} /><DetailFact label="渠道" value={item.channel} /><DetailFact label="物流" value={item.freeShipping ? "客户自提 / 无需物流" : [item.expressCompany, item.expressNo].filter(Boolean).join(" · ") || "未填写"} /><DetailFact label="需要发票" value={item.needInvoice ? "是" : "否"} /><DetailFact label="售后条款" value={item.aftersalesTerms || "—"} /><DetailFact label="备注" value={item.remarks || "—"} /></details>
  </div>;
  return <div className="space-y-5" data-phone-detail="document">
    <div className="grid gap-3 sm:grid-cols-2"><DetailFact label="客户" value={item.customerName || "—"} /><DetailFact label="联系方式" value={item.contact || "—"} /><DetailFact label="渠道" value={item.channel} /><DetailFact label="经办人" value={item.handleBy || "—"} /><DetailFact label="销售金额" value={formatCurrency(item.totalAmount)} /><DetailFact label="销售利润" value={showProfit && item.totalProfit !== undefined ? formatCurrency(item.totalProfit) : "无权查看"} /><DetailFact label="收款状态" value={`${item.paymentStatus} · 已收 ${formatCurrency(item.paidAmount)} · 未收 ${formatCurrency(item.unpaidAmount)}`} /><DetailFact label="出库状态" value={`${item.outboundStatus}${item.outboundTime ? ` · ${item.outboundTime}` : ""}`} /></div>
    <Card><CardContent className="p-4"><div className="grid gap-3 sm:grid-cols-2"><DetailFact label="物流" value={item.freeShipping ? "客户自提 / 无需物流" : [item.expressCompany, item.expressNo].filter(Boolean).join(" · ") || "未填写"} /><DetailFact label="需要发票" value={item.needInvoice ? "是" : "否"} /><DetailFact label="售后条款" value={item.aftersalesTerms || "—"} /><DetailFact label="备注" value={item.remarks || "—"} /></div></CardContent></Card>
    <div><h3 className="mb-3 text-sm font-semibold">商品明细</h3><ErpDataTable mobileRow={(line) => <div className="erp-phone-line-fact"><div><strong>{line.productName}</strong><small>{line.condition} · {line.quantity} 件 · SN {line.sn || "待出库绑定"}</small></div><span className="erp-data-number">{formatCurrency(line.sellPrice)}</span></div>} ariaLabel="销售单商品明细" columns={columns} data={item.lines} getRowId={(line) => line.id} density="compact" stickyHeader emptyTitle="该销售单没有商品明细" /></div>
  </div>;
}

const DetailFact = ErpDetailFact;

function MetricCard({label, value, detail, icon, tone = "neutral"}: {label: string; value: string; detail: string; icon: ReactNode; tone?: "neutral" | "warning"}) {
  return <ErpMetricCard label={label} value={value} detail={detail} icon={icon} tone={tone === "warning" ? "warning" : "info"} />;
}
