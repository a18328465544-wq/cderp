import {keepPreviousData, useQuery, type UseQueryResult} from "@tanstack/react-query";
import {ArrowRight, Boxes, ImageOff, LockKeyhole, RefreshCw, RotateCcw, ShieldAlert, SlidersHorizontal, Warehouse} from "lucide-react";
import {ErpCheckboxField, ErpSearchInput} from "@/src/components/common";
import {useEffect, useMemo, useState, type ReactNode} from "react";
import {Button, Card, CardContent, Input, Select} from "@/src/components/ui";
import {ErpColumnVisibilityMenu, ErpDataTable, ErpDetailDrawer, ErpEmptyState, ErpFilterBar, ErpLoadingState, ErpMetricCard, ErpPageContent, ErpPageError, ErpPageHeader, ErpPageToolbar, ErpProductLedgerDrawer, ErpStatusBadge, ErpTableResultsBar, ErpWarehousePageFrame, MetricsRegion, type ProductLedgerSubject, type QuickStatusItemData} from "@/src/components/common";
import {InventoryStatus, ProfitDisplay} from "@/src/components/domain";
import {queryKeys, inventoryApi} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import {useTablePreferences} from "@/src/hooks/useTablePreferences";
import {useUrlSearchState} from "@/src/hooks/useUrlSearchState";
import {formatCurrency} from "@/src/lib/format";
import {Link, useNavigate} from "@tanstack/react-router";
import {inventoryCategories, inventoryJourneyFinancialMenuValues, inventoryStatuses, type InventoryFilters, type InventoryJourney, type InventoryJourneyEvent, type InventoryListItem, type InventoryModelSummary, type InventorySummary, type InventoryView} from "@/src/types/inventory";
import {createInventoryColumns} from "@/src/features/inventory/inventory.columns";
import {createInventoryModelColumns} from "@/src/features/inventory/inventory.model-columns";
import {InventoryJourneyPanel} from "@/src/features/inventory/components/InventoryJourneyPanel";
import {defaultInventoryFilters, inventorySummaryFilters} from "@/src/features/inventory/inventory.filters";
import type {VisibilityState, RowSelectionState, SortingState} from "@tanstack/react-table";
import type {PermissionModel} from "@/src/services/api/endpoints/auth";
import {useProductLedger} from "@/src/hooks/useProductLedger";
import {useWorkspaceTabActivity} from "@/src/hooks/useWorkspaceTabRuntime";
import type {ProductLedgerRow} from "@/src/types/product-ledger";
import {defaultInventoryUrlState, parseInventoryUrlState, type InventoryUrlState, serializeInventoryUrlState} from "@/src/features/inventory/inventory.url-state";

const emptyInventoryVisibility: VisibilityState = {};
const journeyFinancialMenus = inventoryJourneyFinancialMenuValues;

function toProductLedgerSubject(row: InventoryModelSummary): ProductLedgerSubject {
  return {key: row.key, productName: row.productName, category: row.category, brand: row.brand, model: row.model, version: row.version, vram: row.vram, currentStock: row.totalCount};
}

function useInventoryUrlState() {
  const {value, commit} = useUrlSearchState<InventoryUrlState>({defaultValue: defaultInventoryUrlState, parse: parseInventoryUrlState, serialize: serializeInventoryUrlState});
  const {active} = useWorkspaceTabActivity();
  useEffect(() => {
    if (!active || value.view !== "models" || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has("detail")) return;
    // Canonicalize a malformed deep link once the inventory tab is active.
    // This keeps the address bar and the in-memory state on the same contract.
    commit({filters: value.filters, detailId: null, view: value.view});
  }, [active, commit, value.filters, value.view]);
  return {
    filters: value.filters,
    detailId: value.detailId,
    view: value.view,
    commitFilters: (filters: InventoryFilters) => commit({filters, detailId: value.detailId, view: value.view}),
    commitDetail: (detailId: string | null) => commit({filters: value.filters, detailId, view: value.view}),
    commitView: (view: InventoryView) => commit({filters: value.filters, detailId: null, view}),
    commitState: (state: InventoryUrlState) => commit(state),
  };
}

export function InventoryListPage() {
  const {session} = useAuth();
  if (!session) return <Card><ErpLoadingState title="正在验证库存权限" description="请稍候，正在读取当前账号权限。" /></Card>;
  const {filters, commitFilters, detailId, commitDetail, view, commitView, commitState} = useInventoryUrlState();
  const permissions = session.permissions;
  const accessGranted = createCapabilities(session).menu("inventory");
  const canViewJourneyFinance = journeyFinancialMenus.some((menu) => permissions.allowedMenus.includes(menu));
  const [ledgerSubject, setLedgerSubject] = useState<ProductLedgerSubject | null>(null);
  const productLedger = useProductLedger({open: Boolean(ledgerSubject), productSkuId: ledgerSubject?.key || "", permissions});
  const navigate = useNavigate();
  const listEnabled = accessGranted;
  const listQuery = useQuery({
    queryKey: queryKeys.inventory.list(filters),
    queryFn: ({signal}) => inventoryApi.list(filters, permissions, signal),
    enabled: listEnabled && view === "cards",
    placeholderData: keepPreviousData,
    retry: false,
  });
  const summaryFilters = useMemo(() => inventorySummaryFilters(filters), [filters]);
  const modelSummaryQuery = useQuery({
    queryKey: queryKeys.inventory.models(summaryFilters),
    queryFn: ({signal}) => inventoryApi.modelSummaries(summaryFilters, permissions, signal),
    enabled: listEnabled,
    placeholderData: keepPreviousData,
    retry: false,
  });
  const detailQuery = useQuery({
    queryKey: queryKeys.inventory.detail(detailId || ""),
    queryFn: ({signal}) => inventoryApi.detail(detailId || "", permissions, signal),
    enabled: listEnabled && view === "cards" && Boolean(detailId),
    retry: false,
  });
  const journeyQuery = useQuery({
    queryKey: queryKeys.inventory.journey(detailId || "", {showCost: permissions.showCost, showProfit: permissions.showProfit, showFinance: canViewJourneyFinance}),
    queryFn: ({signal}) => inventoryApi.journey(detailId || "", permissions, signal),
    enabled: listEnabled && view === "cards" && Boolean(detailId),
    retry: false,
  });

  if (!accessGranted) return <ErpPageError title="当前账号没有库存入口权限" description="服务器已拒绝库存菜单访问（403）。请联系管理员授权后再试。" />;

  const rows = listQuery.data?.data || [];
  const ledgerSubjects = useMemo(() => (modelSummaryQuery.data || []).map(toProductLedgerSubject), [modelSummaryQuery.data]);
  const openDetail = (item: InventoryListItem) => commitDetail(item.id);
  const openCardsForModel = (row: InventoryModelSummary) => commitState({filters: {...filters, keyword: row.productName, page: 1}, detailId: null, view: "cards"});
  const openLedgerForModel = (row: InventoryModelSummary) => setLedgerSubject(toProductLedgerSubject(row));
  const openProductLedgerDocument = (row: ProductLedgerRow) => {
    setLedgerSubject(null);
    if (row.documentType === "采购入库") return void navigate({to: "/purchase", search: {keyword: row.documentNo}});
    if (row.documentType === "采购退货") return void navigate({to: "/purchase/returns", search: {keyword: row.documentNo, detail: row.documentNo, page: 1}});
    if (row.documentType === "销售出库") return void navigate({to: "/sales", search: {keyword: row.documentNo, detail: row.documentNo, page: 1}});
    if (row.documentType === "销售退货") return void navigate({to: "/sales/returns", search: {keyword: row.documentNo, detail: row.documentNo, page: 1}});
    if (row.documentType === "组装拆卸") return void navigate({to: "/assembly", search: {q: row.documentNo}});
    return void navigate({to: "/inventory", search: {keyword: row.documentNo}});
  };
  return <>
    <InventoryPageContent
      filters={filters}
      commitFilters={commitFilters}
      listQuery={listQuery}
      modelSummaryQuery={modelSummaryQuery}
      detailQuery={detailQuery}
      journeyQuery={journeyQuery}
      detailId={detailId}
      onDetail={openDetail}
      onCloseDetail={() => commitDetail(null)}
      rows={rows}
      permissions={permissions}
      onRefresh={() => { void Promise.all([listQuery.refetch(), modelSummaryQuery.refetch()]); }}
      view={view}
      onChangeView={commitView}
      onOpenCards={openCardsForModel}
      onOpenLedger={openLedgerForModel}
      userId={session.user.id}
    />
    <ErpProductLedgerDrawer
      open={Boolean(ledgerSubject)}
      subject={ledgerSubject}
      subjects={ledgerSubjects}
      filters={productLedger.filters}
      page={productLedger.query.data}
      loading={productLedger.query.isPending}
      fetching={productLedger.query.isFetching}
      error={productLedger.query.error as Error | null}
      onRetry={() => { void productLedger.query.refetch(); }}
      onFiltersChange={productLedger.updateFilter}
      onResetFilters={productLedger.clearFilters}
      onPageChange={productLedger.changePage}
      onPageSizeChange={productLedger.changePageSize}
      onOpenChange={(open) => {if (!open) setLedgerSubject(null);}}
      onSubjectChange={setLedgerSubject}
      onOpenDocument={openProductLedgerDocument}
    />
  </>;
}

function InventoryPageContent({filters, commitFilters, listQuery, modelSummaryQuery, detailQuery, journeyQuery, detailId, onDetail, onCloseDetail, rows, permissions, onRefresh, view, onChangeView, onOpenCards, onOpenLedger, userId}: {
  filters: InventoryFilters;
  commitFilters: (filters: InventoryFilters) => void;
  listQuery: ReturnType<typeof useQuery<Awaited<ReturnType<typeof inventoryApi.list>>>>;
  modelSummaryQuery: UseQueryResult<InventoryModelSummary[], Error>;
  detailQuery: ReturnType<typeof useQuery<Awaited<ReturnType<typeof inventoryApi.detail>>>>;
  journeyQuery: ReturnType<typeof useQuery<Awaited<ReturnType<typeof inventoryApi.journey>>>>;
  detailId: string | null;
  onDetail: (item: InventoryListItem) => void;
  onCloseDetail: () => void;
  rows: InventoryListItem[];
  permissions: PermissionModel;
  onRefresh: () => void;
  view: InventoryView;
  onChangeView: (view: InventoryView) => void;
  onOpenCards: (row: InventoryModelSummary) => void;
  onOpenLedger: (row: InventoryModelSummary) => void;
  userId: string;
}) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const navigate = useNavigate();
  const {columnVisibility, setColumnVisibility, density, setDensity} = useTablePreferences<VisibilityState>({feature: "inventory", userId, defaultVisibility: emptyInventoryVisibility});
  const {columnVisibility: modelColumnVisibility, setColumnVisibility: setModelColumnVisibility, density: modelDensity, setDensity: setModelDensity} = useTablePreferences<VisibilityState>({feature: "inventory-models", userId, defaultVisibility: emptyInventoryVisibility});
  const modelRows = modelSummaryQuery.data || [];
  const summary = useMemo(() => summarizeInventoryModelRows(modelRows, permissions.showCost), [modelRows, permissions.showCost]);
  const modelPageStart = (filters.page - 1) * filters.pageSize;
  const modelPageRows = modelRows.slice(modelPageStart, modelPageStart + filters.pageSize);
  const selectedCount = Object.values(rowSelection).filter(Boolean).length;
  const activeFilterCount = countActiveInventoryFilters(filters);
  const quickStatus: QuickStatusItemData[] = [
    {icon: <Warehouse className="h-4 w-4" />, label: "库存状态", value: "已连接", description: "库存与库位可查询", tone: "success"},
    {icon: <ShieldAlert className="h-4 w-4" />, label: "待检测", value: modelSummaryQuery.data ? `${summary.pendingCount} 件` : "—", description: "检测前库存", tone: summary.pendingCount ? "warning" : "success"},
    {icon: <SlidersHorizontal className="h-4 w-4" />, label: "筛选状态", value: activeFilterCount ? `${activeFilterCount} 项` : "全部", description: "筛选状态已同步 URL", tone: activeFilterCount ? "info" : "neutral"},
    {icon: <LockKeyhole className="h-4 w-4" />, label: "成本权限", value: permissions.showCost ? "可查看" : "已隐藏", description: permissions.showCost ? "按账号权限展示" : "服务器已隐藏", tone: permissions.showCost ? "success" : "neutral"},
  ];
  const columns = useMemo(() => createInventoryColumns({showCost: permissions.showCost, showProfit: permissions.showProfit, onDetail}), [onDetail, permissions.showCost, permissions.showProfit]);
  const modelColumns = useMemo(() => createInventoryModelColumns({showCost: permissions.showCost, showProfit: permissions.showProfit, onOpenCards, onOpenLedger}), [onOpenCards, onOpenLedger, permissions.showCost, permissions.showProfit]);
  const updateFilter = (patch: Partial<InventoryFilters>) => commitFilters({...filters, ...patch, page: 1});
  const serverToColumnSort: Record<InventoryFilters["sortKey"], string> = {id: "id", product: "product", cost: "costPrice", profit: "estimatedProfit", days: "inventoryDays", status: "status", warehouseLocation: "warehouseLocation", entryTime: "entryTime"};
  const columnToServerSort: Record<string, InventoryFilters["sortKey"]> = {id: "id", product: "product", costPrice: "cost", estimatedProfit: "profit", inventoryDays: "days", status: "status", warehouseLocation: "warehouseLocation", entryTime: "entryTime"};
  const sorting: SortingState = filters.sortKey ? [{id: serverToColumnSort[filters.sortKey], desc: filters.sortDirection === "desc"}] : [];
  const onSortingChange = (updater: SortingState | ((old: SortingState) => SortingState)) => {
    const next = typeof updater === "function" ? updater(sorting) : updater;
    const first = next[0];
    commitFilters({...filters, sortKey: columnToServerSort[first?.id || ""] || "entryTime", sortDirection: first?.desc ? "desc" : "asc", page: 1});
  };
  useEffect(() => setRowSelection({}), [filters]);
  const openJourneyDocument = (event: InventoryJourneyEvent) => {
    const documentNo = event.documentNo?.trim();
    // A journey event already carries the authoritative document number. Pass
    // it through the destination URL so the target list can resolve the exact
    // record instead of inheriting the inventory card's `detail` parameter.
    if (event.type === "sale" && documentNo) {
      void navigate({to: "/sales", search: {keyword: documentNo, detail: documentNo, page: 1}});
      return;
    }
    if (event.type === "return" && documentNo) {
      const target = event.title === "销售退货" ? "/sales/returns" : "/purchase/returns";
      void navigate({to: target, search: {keyword: documentNo, detail: documentNo, page: 1}});
      return;
    }
    const target = event.type === "purchase" ? "/purchase"
      : event.type === "inspection" ? "/inspections"
        : event.type === "payment" ? "/finance/ledger"
          : event.type === "aftersales" ? "/aftersales"
            : event.type === "assembly" ? "/assembly"
              : undefined;
    if (!target) return;
    void navigate({to: target, search: {}});
  };
  const detailItem = journeyQuery.data?.card ?? detailQuery.data?.item ?? null;

  return <>
    <ErpWarehousePageFrame>
      <ErpPageHeader title="库存中心" subtitle="按 SN、型号、库位和状态快速定位库存；默认只展示当前库存，已退货等历史记录请通过状态筛选查看。" quickStatus={quickStatus} actions={<><InventoryViewSwitcher view={view} onChange={onChangeView} /><Button variant="secondary" onClick={onRefresh} disabled={listQuery.isFetching || modelSummaryQuery.isFetching}><RefreshCw className={listQuery.isFetching || modelSummaryQuery.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />刷新</Button></>} />
      <MetricsRegion>
        <MetricCard label="库存总数" value={modelSummaryQuery.data ? `${summary.totalCount} 件` : "—"} detail="按当前筛选" icon={<Boxes className="h-4 w-4" />} />
        <MetricCard label="在库数量" value={modelSummaryQuery.data ? `${summary.availableCount} 件` : "—"} detail="已入库 / 已上架" icon={<Warehouse className="h-4 w-4" />} />
        <MetricCard label="待检测" value={modelSummaryQuery.data ? `${summary.pendingCount} 件` : "—"} detail="待检测 / 检测中" tone="warning" icon={<ShieldAlert className="h-4 w-4" />} />
        <MetricCard label="已预订" value={modelSummaryQuery.data ? `${summary.lockedCount} 件` : "—"} detail="已锁定库存" icon={<LockKeyhole className="h-4 w-4" />} />
        {permissions.showCost ? <MetricCard label="库存总成本" value={summary.totalCost === undefined ? "—" : formatCurrency(summary.totalCost)} detail="按接口摘要汇总" icon={<Boxes className="h-4 w-4" />} /> : <MetricCard label="成本信息" value="无权限" detail="服务器已隐藏成本字段" tone="muted" icon={<LockKeyhole className="h-4 w-4" />} />}
      </MetricsRegion>
      {(summary.pendingCount > 0 || summary.lockedCount > 0) && <Card className="border-[var(--erp-color-border)] bg-[var(--erp-color-surface)]"><CardContent className="flex flex-wrap items-center justify-between gap-3 p-3"><div className="flex min-w-0 items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--erp-color-warning-soft)] text-[var(--erp-color-warning)]"><ShieldAlert className="h-4 w-4" /></span><div className="min-w-0"><p className="text-sm font-semibold text-[var(--erp-color-text)]">库存下一步</p><p className="truncate text-xs text-[var(--erp-color-text-secondary)]">把需要人工处理的库存直接送到对应工作台，列表本身只负责查询。</p></div></div><div className="flex flex-wrap items-center gap-2">{summary.pendingCount > 0 && <Link to={permissions.allowedMenus.includes("all") || permissions.allowedMenus.includes("inspections") ? "/inspections" : "/inventory"} className="inline-flex items-center gap-1 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-warning)] bg-[var(--erp-color-warning-soft)] px-3 py-2 text-xs font-semibold text-[var(--erp-color-warning)]">待检测 {summary.pendingCount}<ArrowRight className="h-3.5 w-3.5" /></Link>}{summary.lockedCount > 0 && <Link to="/sales/outbound" className="inline-flex items-center gap-1 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-info)] bg-[var(--erp-color-info-soft)] px-3 py-2 text-xs font-semibold text-[var(--erp-color-primary)]">已预订 {summary.lockedCount}<ArrowRight className="h-3.5 w-3.5" /></Link>}</div></CardContent></Card>}
      <ErpPageToolbar>
      <ErpFilterBar actions={<Button variant="ghost" size="sm" onClick={() => commitFilters(defaultInventoryFilters)}><RotateCcw className="h-4 w-4" />重置筛选</Button>}>
        <ErpSearchInput className="min-w-[240px] flex-1" value={filters.keyword} onChange={(event) => updateFilter({keyword: event.target.value})} placeholder="搜索 SN、商品、品牌、型号" aria-label="搜索库存" />
        <FilterSelect value={filters.category} onChange={(value) => updateFilter({category: value as InventoryFilters["category"]})} label="商品分类" placeholder="全部分类" options={[...inventoryCategories]} />
        <FilterInput value={filters.brand} onChange={(value) => updateFilter({brand: value})} label="品牌" placeholder="品牌" />
        <FilterInput value={filters.supplierName} onChange={(value) => updateFilter({supplierName: value})} label="供应商" placeholder="供应商" />
        <FilterInput value={filters.warehouseLocation} onChange={(value) => updateFilter({warehouseLocation: value})} label="仓库 / 库位" placeholder="仓位" />
        <FilterSelect value={filters.status} onChange={(value) => updateFilter({status: value, inspectionStatus: ""})} label="库存 / 历史状态" placeholder="当前库存" options={[...inventoryStatuses]} />
        <FilterSelect value={filters.risk} onChange={(value) => updateFilter({risk: value as InventoryFilters["risk"]})} label="风险" placeholder="全部风险" options={["high", "mined", "upturned"]} optionLabels={{high: "高风险", mined: "疑似矿卡", upturned: "倒挂价"}} />
        <ErpCheckboxField label="包含已售出" checked={filters.includeSold} onChange={(event) => updateFilter({includeSold: event.target.checked})} className="h-10 items-center px-3 text-xs text-[var(--erp-color-text-secondary)]" />
      </ErpFilterBar>
      </ErpPageToolbar>
      <ErpPageContent className="space-y-[var(--erp-page-gap)]">
      {view === "models" ? <InventoryModelTableRegion filters={filters} commitFilters={commitFilters} modelSummaryQuery={modelSummaryQuery} rows={modelRows} pageRows={modelPageRows} columns={modelColumns} columnVisibility={modelColumnVisibility} setColumnVisibility={setModelColumnVisibility} density={modelDensity} setDensity={setModelDensity} onOpenLedger={onOpenLedger} /> : <>
        {selectedCount > 0 && <Card className="flex flex-wrap items-center justify-between gap-3 border-[var(--erp-color-border-strong)] bg-[var(--erp-color-info-soft)] px-4 py-3"><span className="text-sm font-semibold text-[var(--erp-color-primary)]">已选择 {selectedCount} 条库存</span><Button size="sm" variant="ghost" onClick={() => setRowSelection({})}>清除选择</Button></Card>}
        <ErpTableResultsBar summary={<span className="flex items-center gap-2"><Boxes className="h-4 w-4 text-[var(--erp-color-primary)]" />服务端分页 · {listQuery.data?.meta.total ?? 0} 条</span>} actions={<><ErpColumnVisibilityMenu columns={columns} visibility={columnVisibility} onVisibilityChange={setColumnVisibility} exclude={["select", "actions"]} /><div className="inline-flex rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-0.5"><Button type="button" size="sm" variant={density === "comfortable" ? "secondary" : "ghost"} onClick={() => setDensity("comfortable")}>舒适</Button><Button type="button" size="sm" variant={density === "compact" ? "secondary" : "ghost"} onClick={() => setDensity("compact")}>紧凑</Button></div></>} />
        <ErpDataTable ariaLabel="库存单卡与 SN 明细" columns={columns} data={rows} getRowId={(row) => row.id} loading={listQuery.isPending} fetching={listQuery.isFetching} error={listQuery.error as Error | null} errorTitle="库存加载失败" onRetry={() => void listQuery.refetch()} onRowClick={onDetail} manualSorting sorting={sorting} onSortingChange={onSortingChange} page={filters.page} pageSize={filters.pageSize} total={listQuery.data?.meta.total} onPageChange={(page) => commitFilters({...filters, page})} onPageSizeChange={(pageSize) => commitFilters({...filters, page: 1, pageSize})} columnVisibility={columnVisibility} onColumnVisibilityChange={setColumnVisibility} rowSelection={rowSelection} onRowSelectionChange={setRowSelection} enableSelection enableColumnResizing density={density} stickyHeader virtualized={rows.length >= 50} />
      </>}
      </ErpPageContent>
    </ErpWarehousePageFrame>
    <ErpDetailDrawer open={view === "cards" && Boolean(detailId)} onOpenChange={(open) => {if (!open) onCloseDetail();}} modal={false} resizable drawerKey="inventory-detail" defaultWidth={820} minWidth={640} maxWidth={1100} title={journeyQuery.data?.card.productName || detailQuery.data?.item?.productName || detailId || "库存详情"}>
      {detailQuery.isPending && detailQuery.fetchStatus !== "idle" && !detailItem ? <ErpLoadingState title="正在加载库存详情" /> : detailQuery.error && !detailItem ? <ErpEmptyState title="详情加载失败" description={(detailQuery.error as Error).message} action={<Button size="sm" onClick={() => void detailQuery.refetch()}>重试</Button>} /> : detailItem ? <InventoryDetail item={detailItem} journey={journeyQuery.data} journeyLoading={journeyQuery.isPending && journeyQuery.fetchStatus !== "idle"} journeyError={journeyQuery.error as Error | null} onRetryJourney={() => void journeyQuery.refetch()} onOpenJourneyDocument={openJourneyDocument} showCost={permissions.showCost} showProfit={permissions.showProfit} /> : <ErpEmptyState title="库存记录不存在" description="该记录可能已被删除或当前账号无权访问。" />}
    </ErpDetailDrawer>
  </>;
}

function InventoryModelTableRegion({filters, commitFilters, modelSummaryQuery, rows, pageRows, columns, columnVisibility, setColumnVisibility, density, setDensity, onOpenLedger}: {
  filters: InventoryFilters;
  commitFilters: (filters: InventoryFilters) => void;
  modelSummaryQuery: UseQueryResult<InventoryModelSummary[], Error>;
  rows: InventoryModelSummary[];
  pageRows: InventoryModelSummary[];
  columns: ReturnType<typeof createInventoryModelColumns>;
  columnVisibility: VisibilityState;
  setColumnVisibility: (updater: VisibilityState | ((old: VisibilityState) => VisibilityState)) => void;
  density: "comfortable" | "compact";
  setDensity: (density: "comfortable" | "compact") => void;
  onOpenLedger: (row: InventoryModelSummary) => void;
}) {
  return <>
    <ErpTableResultsBar summary={<span className="flex items-center gap-2"><Boxes className="h-4 w-4 text-[var(--erp-color-primary)]" />服务端型号聚合 · {rows.length} 个型号</span>} actions={<><ErpColumnVisibilityMenu columns={columns} visibility={columnVisibility} onVisibilityChange={setColumnVisibility} exclude={["select", "actions"]} /><div className="inline-flex rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-0.5"><Button type="button" size="sm" variant={density === "comfortable" ? "secondary" : "ghost"} onClick={() => setDensity("comfortable")}>舒适</Button><Button type="button" size="sm" variant={density === "compact" ? "secondary" : "ghost"} onClick={() => setDensity("compact")}>紧凑</Button></div></>} />
    <ErpDataTable ariaLabel="型号库存汇总" columns={columns} data={pageRows} getRowId={(row) => row.key} loading={modelSummaryQuery.isPending} fetching={modelSummaryQuery.isFetching} error={modelSummaryQuery.error as Error | null} errorTitle="型号库存加载失败" emptyTitle="暂无型号库存" emptyDescription="当前筛选条件下没有可聚合的库存。" onRetry={() => void modelSummaryQuery.refetch()} onRowClick={onOpenLedger} mobileShowDetailAction={false} page={filters.page} pageSize={filters.pageSize} total={rows.length} onPageChange={(page) => commitFilters({...filters, page})} onPageSizeChange={(pageSize) => commitFilters({...filters, page: 1, pageSize})} columnVisibility={columnVisibility} onColumnVisibilityChange={setColumnVisibility} enableColumnResizing density={density} stickyHeader virtualized={pageRows.length >= 50} />
  </>;
}

function InventoryViewSwitcher({view, onChange}: {view: InventoryView; onChange: (view: InventoryView) => void}) {
  return <div role="group" aria-label="库存视图" className="inline-flex rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] p-0.5">
    <Button type="button" aria-pressed={view === "cards"} size="sm" variant={view === "cards" ? "secondary" : "ghost"} onClick={() => onChange("cards")}>单卡 / SN</Button>
    <Button type="button" aria-pressed={view === "models"} size="sm" variant={view === "models" ? "secondary" : "ghost"} onClick={() => onChange("models")}>型号汇总</Button>
  </div>;
}

function InventoryDetail({item, journey, journeyLoading, journeyError, onRetryJourney, onOpenJourneyDocument, showCost, showProfit}: {
  item: InventoryListItem;
  journey?: InventoryJourney;
  journeyLoading: boolean;
  journeyError: Error | null;
  onRetryJourney: () => void;
  onOpenJourneyDocument: (event: InventoryJourneyEvent) => void;
  showCost: boolean;
  showProfit: boolean;
}) {
  const details: Array<[string, string | undefined]> = [
    ["SN / 库存编号", item.serialNumber], ["品牌 / 型号", `${item.brand} ${item.model}`], ["显存 / 版本", `${item.vram || "—"} ${item.version || ""}`.trim()], ["成色", item.condition], ["仓库 / 库位", item.warehouse], ["检测状态", item.inspectionStatus], ["库存状态", item.inventoryStatus], ["入库时间", item.entryTime || "—"], ["库存龄", `${item.inventoryDays} 天`], ["来源", item.sourceType || "—"], ["供应商 / 客户", item.supplierName || item.buyerName || "—"],
  ];
  return <div className="space-y-6">
    <section className="space-y-3">
      <div className="flex h-36 items-center justify-center overflow-hidden rounded-[var(--erp-radius-lg)] bg-[var(--erp-color-surface-muted)]">{item.imageUrl ? <img src={item.imageUrl} alt={item.productName} className="h-full max-w-full object-contain" /> : <div className="flex flex-col items-center gap-2 text-xs text-[var(--erp-color-text-muted)]"><ImageOff className="h-7 w-7" />接口未返回商品图片</div>}</div>
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-lg font-semibold text-[var(--erp-color-text)]">{item.productName}</p><p className="mt-1 text-xs text-[var(--erp-color-text-muted)]">{item.category}</p></div><InventoryStatus status={item.inventoryStatus} /></div>
    </section>
    <InventoryDetailSection title="基础信息"><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{details.map(([label, value]) => <DetailField key={label} label={label} value={value} />)}</div></InventoryDetailSection>
    <InventoryJourneyPanel item={item} journey={journey} showCost={showCost} showProfit={showProfit} loading={journeyLoading} error={journeyError} onRetry={onRetryJourney} onOpenDocument={onOpenJourneyDocument} />
    {item.inventoryStatus !== "已售出" && showCost && <InventoryDetailSection title="成本与售价"><div className="grid grid-cols-2 gap-4 sm:grid-cols-3"><DetailAmount label="成本价" value={item.costPrice} /><DetailAmount label="预计售价" value={item.estimatedSellPrice} /><div><p className="text-xs text-[var(--erp-color-text-muted)]">预计利润</p><p className="mt-1 text-base"><ProfitDisplay value={showProfit ? item.estimatedProfit : undefined} /></p></div></div></InventoryDetailSection>}
    <InventoryDetailSection title="库存属性"><div className="flex flex-wrap gap-2"><ErpStatusBadge label={item.inWarranty ? "质保中" : "无质保"} tone={item.inWarranty ? "success" : "neutral"} />{item.repaired && <ErpStatusBadge label="维修记录" tone="warning" />}{item.gpuRisk && <ErpStatusBadge label="风险库存" tone="danger" />}{item.fullBox && <ErpStatusBadge label="全套包装" tone="info" />}</div>{item.remarks && <p className="mt-3 text-xs leading-5 text-[var(--erp-color-text-secondary)]">备注：{item.remarks}</p>}</InventoryDetailSection>
  </div>;
}

function InventoryDetailSection({title, children}: {title: string; children: ReactNode}) { return <section className="rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-4"><h3 className="text-sm font-semibold text-[var(--erp-color-text)]">{title}</h3><div className="mt-3">{children}</div></section>; }
function DetailField({label, value}: {label: string; value: string | undefined}) { return <div className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3"><p className="text-xs text-[var(--erp-color-text-muted)]">{label}</p><p className="mt-1 break-words text-sm font-semibold text-[var(--erp-color-text)]">{value || "—"}</p></div>; }
function DetailAmount({label, value}: {label: string; value: number | undefined}) { return <div><p className="text-xs text-[var(--erp-color-text-muted)]">{label}</p><p className="mt-1 erp-data-number text-base font-semibold">{value === undefined ? "—" : formatCurrency(value)}</p></div>; }

function MetricCard({label, value, detail, icon, tone = "normal"}: {label: string; value: string; detail: string; icon: ReactNode; tone?: "normal" | "warning" | "muted"}) { return <ErpMetricCard label={label} value={value} detail={detail} icon={icon} tone={tone === "normal" || tone === "muted" ? "neutral" : "warning"} valueTone={tone === "muted" ? "muted" : tone === "warning" ? "warning" : "neutral"} />; }

function summarizeInventoryModelRows(rows: InventoryModelSummary[], showCost: boolean): InventorySummary {
  const summary = rows.reduce<InventorySummary>((result, row) => ({
    totalCount: result.totalCount + row.totalCount,
    availableCount: result.availableCount + row.availableCount,
    pendingCount: result.pendingCount + row.pendingCount,
    lockedCount: result.lockedCount + row.lockedCount,
    soldCount: result.soldCount + row.soldCount,
    totalCost: result.totalCost === undefined || row.totalCost === undefined ? undefined : result.totalCost + row.totalCost,
    totalEstSell: result.totalEstSell === undefined || row.totalEstSell === undefined ? undefined : result.totalEstSell + row.totalEstSell,
  }), {totalCount: 0, availableCount: 0, pendingCount: 0, lockedCount: 0, soldCount: 0, ...(showCost ? {totalCost: 0, totalEstSell: 0} : {})});
  return summary;
}

function FilterSelect({value, onChange, label, placeholder, options = [], optionLabels = {}}: {value: string; onChange: (value: string) => void; label: string; placeholder: string; options?: string[]; optionLabels?: Record<string, string>}) { const selectOptions = options.map((option) => ({value: option, label: optionLabels[option] || option})); return <label className="relative"><span className="sr-only">{label}</span><Select aria-label={label} className="min-w-[132px]" value={value} onValueChange={onChange} options={selectOptions} placeholder={placeholder} /></label>; }

function FilterInput({value, onChange, label, placeholder}: {value: string; onChange: (value: string) => void; label: string; placeholder: string}) { return <label className="relative min-w-0"><span className="sr-only">{label}</span><Input className="w-full lg:w-28" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={label} /></label>; }

function countActiveInventoryFilters(filters: InventoryFilters) {
  return [filters.keyword, filters.category, filters.brand, filters.supplierName, filters.model, filters.warehouseLocation, filters.condition, filters.inspectionStatus, filters.status, filters.entryStart, filters.entryEnd, filters.risk, filters.minStorageDays, filters.maxStorageDays, filters.minProfitMargin].filter(Boolean).length + (filters.includeSold ? 1 : 0);
}
