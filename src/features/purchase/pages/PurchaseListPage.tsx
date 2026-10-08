import {displayQueryValue} from "@/src/utils/queryDisplay";
import {useDebouncedValue} from "@/src/hooks/useDebouncedValue";
import {keepPreviousData, useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useNavigate} from "@tanstack/react-router";
import type {SortingState, VisibilityState} from "@tanstack/react-table";
import {CircleDollarSign, ClipboardList, Filter, ListFilter, LockKeyhole, PackageCheck, Plus, RefreshCw, RotateCcw} from "lucide-react";
import {ErpSearchInput} from "@/src/components/common";
import {useMemo, useState, type ReactNode} from "react";
import {notify} from "@/src/utils/notification";
import {Button, Card, Select} from "@/src/components/ui";
import {ErpMobileRecordRow} from "@/src/components/common/ErpMobileRecordRow";
import {ErpMobileSummary, ErpColumnVisibilityMenu, ErpDataTable, ErpDateRangePicker, ErpDocumentDeleteDialog, ErpFilterBar, ErpListPageFrame, ErpLoadingState, ErpMetricCard, ErpOutstandingSettlementDialog, ErpPageContent, ErpPageError, ErpPageHeader, ErpPageToolbar, ErpTableResultsBar, MetricsRegion, type QuickStatusItemData} from "@/src/components/common";
import {ApiError, financeAccountsApi, financeSettlementApi, purchaseApi, queryKeys} from "@/src/services/api";
import {invalidateErpDomains} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import {useTablePreferences} from "@/src/hooks/useTablePreferences";
import {useUrlSearchState} from "@/src/hooks/useUrlSearchState";
import {useWorkspaceTabActivity} from "@/src/hooks/useWorkspaceTabRuntime";
import type {AuthSession} from "@/src/services/api";
import type {LinkedSettlementContext} from "@/src/types/finance-settlement";
import {formatCurrency} from "@/src/lib/format";
import {isPersonalPurchaseSource} from "@/src/utils/purchaseSources";
import {purchasePaymentStatusValues} from "@/src/types/purchase";
import type {PurchaseListFilters, PurchaseListItem, PurchaseListSortKey} from "@/src/types/purchase";
import {sourceTypeValues} from "@/src/types/core";
import {createPurchaseListColumns} from "../purchase.columns";
import {countActivePurchaseListFilters, defaultPurchaseListFilters, parsePurchaseListFilters, purchaseListFiltersToSearch, selectPurchaseList} from "../purchase.filters";

const permissionDefaults = {showCost: false, showProfit: false, canDelete: false, canEditHistory: false, allowedMenus: [] as string[]};
const emptyVisibility: VisibilityState = {sourceType: false, inventoryCount: false, estTotalSell: false, estTotalProfit: false, handleBy: false};
const sourceOptions = [
  {value: "", label: "全部采购来源"},
  ...sourceTypeValues.map((value) => ({value, label: value})),
];
const paymentOptions = [
  {value: "", label: "全部付款状态"},
  ...purchasePaymentStatusValues.map((value) => ({value, label: value})),
];

function usePurchaseListUrlState() {
  const {value: filters, commit: commitFilters} = useUrlSearchState({
    defaultValue: defaultPurchaseListFilters,
    parse: parsePurchaseListFilters,
    serialize: purchaseListFiltersToSearch,
  });
  return {filters, commitFilters};
}

export function PurchaseListPage() {
  const {active} = useWorkspaceTabActivity();
  const navigate = useNavigate();
  const {session, logout} = useAuth();
  const {filters, commitFilters} = usePurchaseListUrlState();
  const keyword = useDebouncedValue(filters.keyword, 300);
  const requestFilters = {...filters, keyword};
  const permissions = session?.permissions || permissionDefaults;
  const allowed = createCapabilities(session).menu("purchase_list");
  const listQuery = useQuery({
    queryKey: queryKeys.purchase.list({userId: session?.user.id || "anonymous", showCost: permissions.showCost, showProfit: permissions.showProfit}, requestFilters),
    queryFn: ({signal}) => purchaseApi.list(requestFilters, {showCost: permissions.showCost, showProfit: permissions.showProfit}, signal),
    enabled: active && Boolean(session && allowed) && keyword === filters.keyword,
    placeholderData: keepPreviousData,
    retry: false,
  });

  if (!session) return <Card><ErpLoadingState title="正在验证登录状态" /></Card>;
  if (!session || !allowed) return <ErpPageError title="当前账号没有采购单据权限" description="服务器已拒绝 purchase_list 菜单访问，请联系管理员授权。" />;

  const openDetail = (item: PurchaseListItem) => void navigate({to: "/purchase/$purchaseId", params: {purchaseId: item.id}});
  return <PurchaseListContent
    filters={filters}
    commitFilters={commitFilters}
    session={session}
    query={listQuery}
    filterPending={keyword !== filters.keyword}
    onDetail={openDetail}
    onCreate={() => void navigate({to: "/purchase/new"})}
    onRefresh={() => void listQuery.refetch()}
    onAuthExpired={logout}
  />;
}

function PurchaseListContent({filters, commitFilters, session, query, filterPending, onDetail, onCreate, onRefresh, onAuthExpired}: {
  filters: PurchaseListFilters;
  commitFilters: (filters: PurchaseListFilters) => void;
  session: AuthSession;
  filterPending: boolean;
  query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof purchaseApi.list>>>>;
  onDetail: (item: PurchaseListItem) => void;
  onCreate: () => void;
  onRefresh: () => void;
  onAuthExpired: () => void;
}) {
  const {active} = useWorkspaceTabActivity();
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState<PurchaseListItem | null>(null);
  const [settling, setSettling] = useState<PurchaseListItem | null>(null);
  const {columnVisibility, setColumnVisibility, density, setDensity} = useTablePreferences<VisibilityState>({feature: "purchase-list", userId: session.user.id, defaultVisibility: emptyVisibility});
  const selection = useMemo(() => query.data?.selection || selectPurchaseList(query.data?.items || [], filters), [filters, query.data]);
  const metricValue = (value: string | number) => displayQueryValue(query, value, filterPending);
  const invalidate = () => invalidateErpDomains(queryClient, ["purchase", "inventory", "finance", "customers", "crm", "state"]);
  const handleMutationError = (error: Error) => {if (error instanceof ApiError && error.isUnauthorized) {onAuthExpired(); return;} notify.error(error.message);};
  const deleteMutation = useMutation({mutationFn: (id: string) => purchaseApi.remove(id), onSuccess: async (result, id) => {setDeleting(null); notify.success(`采购单 ${result.invoice.invoiceNo || id} 已删除`, {description: "待检测库存、付款流水和财务关联已由服务端同步清理。"}); await invalidate();}, onError: handleMutationError});
  const canPay = createCapabilities(session).menu("payment_out") && createCapabilities(session).menu("settlement_accounts");
  const accountsQuery = useQuery({queryKey: queryKeys.finance.accounts(), queryFn: ({signal}) => financeAccountsApi.listAll(signal), enabled: active && Boolean(canPay), staleTime: 60_000, retry: false});
  const settlementContext: LinkedSettlementContext | null = settling && (settling.unpaidAmount || 0) > 0 ? {kind: "expense", relatedDocType: "采购单", relatedDocNo: settling.invoiceNo || settling.id, partyName: settling.supplierName, partyId: settling.sourcePartnerId, partnerType: settling.sourcePartnerType || (isPersonalPurchaseSource(settling.sourceType) ? "customer" : "vendor"), defaultAccountId: settling.settlementAccountId, remainingAmount: settling.unpaidAmount || 0} : null;
  const settlementMutation = useMutation({
    mutationFn: (values: Parameters<typeof financeSettlementApi.createExpense>[0]) => {
      if (!settlementContext) throw new Error("采购单未处于待付款状态");
      return financeSettlementApi.createExpense(values, settlementContext, session.user.displayName);
    },
    onSuccess: async () => {setSettling(null); notify.success("采购付款已补录", {description: "已关联原采购单，并同步更新付款状态与往来余额。"}); await invalidateErpDomains(queryClient, ["purchase", "finance", "vendors", "customers", "state"]);},
    onError: handleMutationError,
  });
  const columns = useMemo(() => createPurchaseListColumns({showCost: session.permissions.showCost, showProfit: session.permissions.showProfit, canDelete: session.permissions.canDelete, canPay, onDetail, onDelete: setDeleting, onPay: setSettling}), [canPay, onDetail, session.permissions.canDelete, session.permissions.showCost, session.permissions.showProfit]);
  const activeFilterCount = countActivePurchaseListFilters(filters);
  const canCreate = createCapabilities(session).menu("purchase_add");
  const sorting: SortingState = [{id: filters.sortKey, desc: filters.sortDirection === "desc"}];
  const sortableColumns = new Set<PurchaseListSortKey>(["date", "invoiceNo", "supplierName", "totalCount", "totalCost", "paymentStatus", "handleBy"]);
  const onSortingChange = (updater: SortingState | ((old: SortingState) => SortingState)) => {
    const next = typeof updater === "function" ? updater(sorting) : updater;
    const first = next[0];
    const candidate = first?.id as PurchaseListSortKey | undefined;
    const sortKey = candidate && sortableColumns.has(candidate) ? candidate : "date";
    commitFilters({...filters, sortKey, sortDirection: first?.desc ? "desc" : "asc", page: 1});
  };
  const updateFilters = (patch: Partial<PurchaseListFilters>) => commitFilters({...filters, ...patch, page: 1});
  const quickStatus: QuickStatusItemData[] = [
    {icon: <ListFilter className="h-4 w-4" />, label: "筛选状态", value: activeFilterCount ? `${activeFilterCount} 项` : "全部", description: "已同步到当前 URL", tone: activeFilterCount ? "info" : "neutral"},
    {icon: <CircleDollarSign className="h-4 w-4" />, label: "待付款单", value: metricValue(`${selection.summary.pendingPaymentCount} 单`), description: "未付款与部分付款", tone: selection.summary.pendingPaymentCount ? "warning" : "success"},
    {icon: <LockKeyhole className="h-4 w-4" />, label: "成本权限", value: session.permissions.showCost ? "可查看" : "已隐藏", description: "按账号权限裁剪", tone: session.permissions.showCost ? "success" : "neutral"},
  ];

  return <ErpListPageFrame mobileSearchFirst>
    <ErpPageHeader
      title="采购单据"
      subtitle="查看采购来源、商品数量、付款状态与已生成库存；具备历史编辑权限时，可在详情页按业务阶段修改。"
      quickStatus={quickStatus}
      actions={<><Button type="button" size="sm" variant="secondary" onClick={onRefresh} disabled={query.isFetching}><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />刷新</Button>{canCreate && <Button type="button" size="sm" variant="primary" onClick={onCreate}><Plus className="h-4 w-4" />新建采购单</Button>}</>}
    />

    <ErpMobileSummary label="采购统计" summary={metricValue(`${selection.summary.orderCount} 单 · 待付款 ${selection.summary.pendingPaymentCount}`)}><MetricsRegion>
      <MetricCard label="采购单数" value={metricValue(`${selection.summary.orderCount} 单`)} detail="按当前筛选" icon={<ClipboardList className="h-4 w-4" />} />
      <MetricCard label="采购件数" value={metricValue(`${selection.summary.unitCount} 件`)} detail="采购单实物数量" icon={<PackageCheck className="h-4 w-4" />} />
      <MetricCard label="待付款" value={metricValue(`${selection.summary.pendingPaymentCount} 单`)} detail="未付款 / 部分付款" tone={selection.summary.pendingPaymentCount ? "warning" : "neutral"} icon={<CircleDollarSign className="h-4 w-4" />} />
      <MetricCard label="采购总额" value={metricValue(session.permissions.showCost && selection.summary.totalCost !== undefined ? formatCurrency(selection.summary.totalCost) : "无权查看")} detail={session.permissions.showCost ? "当前筛选汇总" : "成本字段已裁剪"} icon={<LockKeyhole className="h-4 w-4" />} />
      {session.permissions.showCost && session.permissions.showProfit && <MetricCard label="预计利润" value={metricValue(selection.summary.estimatedProfit === undefined ? "—" : formatCurrency(selection.summary.estimatedProfit))} detail="当前筛选汇总" icon={<CircleDollarSign className="h-4 w-4" />} />}
    </MetricsRegion></ErpMobileSummary>

    <ErpPageToolbar><ErpFilterBar mobileActiveCount={activeFilterCount - Number(Boolean(filters.keyword))} mobilePrimary={<ErpSearchInput className="min-w-[260px] flex-1" value={filters.keyword} onChange={(event) => updateFilters({keyword: event.target.value})} placeholder="搜索采购单号、来源、商品或经办人" aria-label="搜索采购单据" />} actions={<Button type="button" variant="ghost" size="sm" onClick={() => commitFilters(defaultPurchaseListFilters)}><RotateCcw className="h-4 w-4" />重置筛选</Button>}>
      <Select className="w-36" value={filters.sourceType} options={sourceOptions} onValueChange={(value) => updateFilters({sourceType: value as PurchaseListFilters["sourceType"]})} aria-label="采购来源筛选" />
      <Select className="w-36" value={filters.paymentStatus} options={paymentOptions} onValueChange={(value) => updateFilters({paymentStatus: value as PurchaseListFilters["paymentStatus"]})} aria-label="付款状态筛选" />
      <ErpDateRangePicker value={{startDate: filters.dateStart, endDate: filters.dateEnd}} onChange={({startDate, endDate}) => updateFilters({dateStart: startDate, dateEnd: endDate})} triggerClassName="sm:w-36" startAriaLabel="采购开始日期" endAriaLabel="采购结束日期" ariaLabel="采购日期范围" />
    </ErpFilterBar></ErpPageToolbar>

    <ErpPageContent className="space-y-[var(--erp-page-gap)]">
    <ErpTableResultsBar summary={<span className="flex items-center gap-2"><Filter className="h-4 w-4 text-[var(--erp-color-primary)]" />共 {selection.meta.total} 条</span>} actions={<>
        <ErpColumnVisibilityMenu columns={columns} visibility={columnVisibility} defaultVisibility={emptyVisibility} onVisibilityChange={setColumnVisibility} />
        <div className="inline-flex rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-0.5"><Button type="button" size="sm" variant={density === "comfortable" ? "secondary" : "ghost"} onClick={() => setDensity("comfortable")}>舒适</Button><Button type="button" size="sm" variant={density === "compact" ? "secondary" : "ghost"} onClick={() => setDensity("compact")}>紧凑</Button></div>
    </>} />

    <ErpDataTable
      mobileRow={(item) => <ErpMobileRecordRow title={item.invoiceNo} subtitle={item.supplierName} meta={`${item.totalCount} 件 · ${item.date} · ${item.handleBy}`} amount={item.totalCost !== undefined ? formatCurrency(item.totalCost) : undefined} status={<span>{item.paymentStatus}</span>} onOpen={() => onDetail(item)} />}
      columns={columns}
      data={selection.data}
      mobileFieldOrder={["supplierName","paymentStatus","totalCost","handleBy","date","totalCount"]}
      mobileFields={6}
      ariaLabel="采购单据明细"
      getRowId={(row) => row.id}
      loading={query.isPending}
      fetching={query.isFetching || filterPending}
      error={query.error as Error | null}
      errorTitle="采购单据加载失败"
      emptyTitle="暂无采购单据"
      emptyDescription={activeFilterCount ? "当前筛选条件没有匹配的采购单。" : "服务器当前没有返回采购单据。"}
      onRetry={() => void query.refetch()}
      onRowClick={onDetail}
      mobileShowDetailAction={false}
      manualSorting
      sorting={sorting}
      onSortingChange={onSortingChange}
      page={selection.meta.page}
      pageSize={selection.meta.pageSize}
      total={selection.meta.total}
      onPageChange={(page) => commitFilters({...filters, page})}
      onPageSizeChange={(pageSize) => commitFilters({...filters, page: 1, pageSize})}
      columnVisibility={columnVisibility}
      onColumnVisibilityChange={setColumnVisibility}
      enableColumnResizing
      density={density}
      stickyHeader
    />
    <ErpDocumentDeleteDialog
      open={Boolean(deleting)}
      title="删除采购单"
      documentName={deleting?.invoiceNo || "当前采购单"}
      description="仅尚未入库且未开始检测的采购单允许删除；删除会清理待检测库存、付款流水和财务关联，服务端会再次核验业务状态。"
      pending={deleteMutation.isPending}
      error={deleteMutation.error instanceof Error ? deleteMutation.error.message : undefined}
      onOpenChange={(open) => {if (!open) {setDeleting(null); deleteMutation.reset();}}}
      onConfirm={() => {if (deleting) deleteMutation.mutate(deleting.id);}}
    />
    <ErpOutstandingSettlementDialog open={Boolean(settling)} context={settlementContext} accounts={accountsQuery.data?.accounts || []} accountsLoading={accountsQuery.isPending || accountsQuery.isFetching} error={settlementMutation.error instanceof Error ? settlementMutation.error.message : accountsQuery.error instanceof Error ? accountsQuery.error.message : undefined} pending={settlementMutation.isPending} onOpenChange={(open) => {if (!open) {setSettling(null); settlementMutation.reset();}}} onSubmit={(values) => settlementMutation.mutateAsync(values).then(() => undefined)} />
    </ErpPageContent>
  </ErpListPageFrame>;
}

function MetricCard({label, value, detail, icon, tone = "neutral"}: {label: string; value: string; detail: string; icon: ReactNode; tone?: "neutral" | "warning"}) {
  return <ErpMetricCard label={label} value={value} detail={detail} icon={icon} tone={tone === "warning" ? "warning" : "info"} />;
}
