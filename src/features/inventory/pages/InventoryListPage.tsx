import {ErpMobileRecordRow} from "@/src/components/common/ErpMobileRecordRow";
import {ErpMobileActionDock} from "@/src/components/common/ErpMobileActionDock";
import {InventoryMobileRecord} from "@/src/features/inventory/components/InventoryMobileRecord";
import {keepPreviousData, useQuery, type UseQueryResult} from "@tanstack/react-query";
import {ArrowDownUp, ArrowRight, Boxes, ImageOff, LockKeyhole, RefreshCw, RotateCcw, ScanLine, ShieldAlert, SlidersHorizontal, Warehouse} from "lucide-react";
import {ErpCheckboxField, ErpSearchInput} from "@/src/components/common";
import {useEffect, useMemo, useState, type ReactNode} from "react";
import {Button, Card, CardContent, Input, Select} from "@/src/components/ui";
import {ErpBarcodeScannerDialog, ErpDialogShell, ErpMobileSummary, ErpColumnVisibilityMenu, ErpDataTable, ErpDetailDrawer, ErpDetailFact, ErpEmptyState, ErpFilterBar, ErpLoadingState, ErpMetricCard, ErpPageContent, ErpPageError, ErpPageHeader, ErpPageToolbar, ErpProductLedgerDrawer, ErpStatusBadge, ErpTableResultsBar, ErpWarehousePageFrame, MetricsRegion, type ProductLedgerSubject, type QuickStatusItemData} from "@/src/components/common";
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
import {defaultInventoryFilters, inventorySelectionScope, inventorySummaryFilters} from "@/src/features/inventory/inventory.filters";
import type {VisibilityState, RowSelectionState, SortingState} from "@tanstack/react-table";
import type {PermissionModel} from "@/src/services/api/endpoints/auth";
import {useProductLedger} from "@/src/hooks/useProductLedger";
import {useWorkspaceTabActivity} from "@/src/hooks/useWorkspaceTabRuntime";
import {usePhoneBackLayer} from "@/src/hooks/usePhoneBack";
import {useErpPhone} from "@/src/hooks/useErpViewport";
import {useDebouncedValue} from "@/src/hooks/useDebouncedValue";
import {isPathAllowed, navigationItems} from "@/src/config/navigation";
import type {ProductLedgerRow} from "@/src/types/product-ledger";
import {defaultInventoryUrlState, parseInventoryUrlState, type InventoryUrlState, serializeInventoryUrlState} from "@/src/features/inventory/inventory.url-state";

const emptyInventoryVisibility: VisibilityState = {brand: false, model: false, inspectionStatus: false, warehouseLocation: false, entryTime: false};
const defaultModelVisibility: VisibilityState = {lockedCount: false, soldCount: false, repairCount: false, warehouseLocation: false, lastEntryTime: false, estimatedProfit: false};
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
  const {active} = useWorkspaceTabActivity();
  if (!session) return <Card><ErpLoadingState title="正在验证库存权限" description="请稍候，正在读取当前账号权限。" /></Card>;
  const {filters, commitFilters, detailId, commitDetail, view, commitView, commitState} = useInventoryUrlState();
  const permissions = session.permissions;
  const accessGranted = createCapabilities(session).menu("inventory");
  const canViewJourneyFinance = journeyFinancialMenus.some((menu) => permissions.allowedMenus.includes(menu));
  const [ledgerSubject, setLedgerSubject] = useState<ProductLedgerSubject | null>(null);
  const productLedger = useProductLedger({open: Boolean(ledgerSubject), productSkuId: ledgerSubject?.key || "", permissions});
  const navigate = useNavigate();
  // Keep the filter/URL responsive while querying only after typing settles.
  const textFilters = useMemo(() => ({keyword: filters.keyword, brand: filters.brand, supplierName: filters.supplierName, warehouseLocation: filters.warehouseLocation}), [filters.keyword, filters.brand, filters.supplierName, filters.warehouseLocation]);
  const debouncedTextFilters = useDebouncedValue(textFilters, 300);
  const searchPending = debouncedTextFilters !== textFilters;
  const requestFilters = useMemo(() => ({...filters, ...debouncedTextFilters}), [filters, debouncedTextFilters]);
  const listEnabled = accessGranted && active && !searchPending;
  const listQuery = useQuery({
    queryKey: queryKeys.inventory.list(requestFilters),
    queryFn: ({signal}) => inventoryApi.list(requestFilters, permissions, signal),
    enabled: listEnabled && view === "cards",
    placeholderData: keepPreviousData,
    retry: false,
  });
  const summaryFilters = useMemo(() => inventorySummaryFilters(requestFilters), [requestFilters]);
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
    enabled: active && accessGranted && view === "cards" && Boolean(detailId),
    retry: false,
  });
  const journeyQuery = useQuery({
    queryKey: queryKeys.inventory.journey(detailId || "", {showCost: permissions.showCost, showProfit: permissions.showProfit, showFinance: canViewJourneyFinance}),
    queryFn: ({signal}) => inventoryApi.journey(detailId || "", permissions, signal),
    enabled: active && accessGranted && view === "cards" && Boolean(detailId),
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
      searchPending={searchPending}
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
      ledgerOpen={Boolean(ledgerSubject)}
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

function InventoryPageContent({filters, commitFilters, listQuery, modelSummaryQuery, searchPending, detailQuery, journeyQuery, detailId, onDetail, onCloseDetail, rows, permissions, onRefresh, view, onChangeView, onOpenCards, onOpenLedger, userId, ledgerOpen}: {
  filters: InventoryFilters;
  commitFilters: (filters: InventoryFilters) => void;
  listQuery: ReturnType<typeof useQuery<Awaited<ReturnType<typeof inventoryApi.list>>>>;
  modelSummaryQuery: UseQueryResult<InventoryModelSummary[], Error>;
  searchPending: boolean;
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
  ledgerOpen: boolean;
}) {
  const phone = useErpPhone();
  const {active} = useWorkspaceTabActivity();
  const [scanOpen, setScanOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  usePhoneBackLayer(active && phone && selectionMode, () => {
    setSelectionMode(false);
    setRowSelection({});
  }, 50);
  const navigate = useNavigate();
  const {columnVisibility, setColumnVisibility, density, setDensity} = useTablePreferences<VisibilityState>({feature: "inventory", userId, defaultVisibility: emptyInventoryVisibility});
  const {columnVisibility: modelColumnVisibility, setColumnVisibility: setModelColumnVisibility, density: modelDensity, setDensity: setModelDensity} = useTablePreferences<VisibilityState>({feature: "inventory-models", userId, defaultVisibility: defaultModelVisibility});
  const modelRows = modelSummaryQuery.data || [];
  const summary = useMemo(() => summarizeInventoryModelRows(modelRows, permissions.showCost), [modelRows, permissions.showCost]);
  const summaryReady = Boolean(modelSummaryQuery.data) && !searchPending && !modelSummaryQuery.isPlaceholderData && !modelSummaryQuery.isFetching && !modelSummaryQuery.isError;
  const summaryDetail = summaryReady ? "按当前筛选" : modelSummaryQuery.isError ? "加载失败" : "更新中";
  const modelPageStart = (filters.page - 1) * filters.pageSize;
  const modelPageRows = modelRows.slice(modelPageStart, modelPageStart + filters.pageSize);
  const selectedCount = Object.values(rowSelection).filter(Boolean).length;
  const activeFilterCount = countActiveInventoryFilters(filters);
  const quickStatus: QuickStatusItemData[] = [
    {icon: <Warehouse className="h-4 w-4" />, label: "库存状态", value: "已连接", description: "库存与库位可查询", tone: "success"},
    {icon: <ShieldAlert className="h-4 w-4" />, label: "待检测", value: summaryReady ? `${summary.pendingCount} 件` : "—", description: summaryReady ? "检测前库存" : summaryDetail, tone: summaryReady && summary.pendingCount ? "warning" : "success"},
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
  const selectionScope = inventorySelectionScope(filters, view);
  useEffect(() => setRowSelection({}), [selectionScope]);
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
  const inventoryMetrics = <MetricsRegion>
        <MetricCard label="库存总数" value={summaryReady ? `${summary.totalCount} 件` : "—"} detail={summaryDetail} icon={<Boxes className="h-4 w-4" />} />
        <MetricCard label="在库数量" value={summaryReady ? `${summary.availableCount} 件` : "—"} detail={summaryReady ? "已入库 / 已上架" : summaryDetail} icon={<Warehouse className="h-4 w-4" />} />
        <MetricCard label="待检测" value={summaryReady ? `${summary.pendingCount} 件` : "—"} detail={summaryReady ? "待检测 / 检测中" : summaryDetail} tone="warning" icon={<ShieldAlert className="h-4 w-4" />} />
        <MetricCard label="已预订" value={summaryReady ? `${summary.lockedCount} 件` : "—"} detail={summaryReady ? "已锁定库存" : summaryDetail} icon={<LockKeyhole className="h-4 w-4" />} />
        {permissions.showCost ? <MetricCard label="库存总成本" value={summaryReady && summary.totalCost !== undefined ? formatCurrency(summary.totalCost) : "—"} detail={summaryReady ? "按接口摘要汇总" : summaryDetail} icon={<Boxes className="h-4 w-4" />} /> : <MetricCard label="成本信息" value="无权限" detail="服务器已隐藏成本字段" tone="muted" icon={<LockKeyhole className="h-4 w-4" />} />}
      </MetricsRegion>;

  const warehouseTasks = navigationItems.filter((item) => ["inspections", "sales_outbound"].includes(item.id) && isPathAllowed(permissions.allowedMenus, item.path));
  const filterFields = <>
    <FilterSelect value={filters.category} onChange={(value) => updateFilter({category: value as InventoryFilters["category"]})} label="商品分类" placeholder="全部分类" options={[...inventoryCategories]} />
    <FilterInput value={filters.brand} onChange={(value) => updateFilter({brand: value})} label="品牌" placeholder="品牌" />
    <FilterInput value={filters.supplierName} onChange={(value) => updateFilter({supplierName: value})} label="供应商" placeholder="供应商" />
    <FilterInput value={filters.warehouseLocation} onChange={(value) => updateFilter({warehouseLocation: value})} label="仓库 / 库位" placeholder="仓位" />
    <FilterSelect value={filters.status} onChange={(value) => updateFilter({status: value, inspectionStatus: ""})} label="库存 / 历史状态" placeholder="当前库存" options={[...inventoryStatuses]} />
    <FilterSelect value={filters.risk} onChange={(value) => updateFilter({risk: value as InventoryFilters["risk"]})} label="风险" placeholder="全部风险" options={["high", "mined", "upturned"]} optionLabels={{high: "高风险", mined: "疑似矿卡", upturned: "倒挂价"}} />
    <ErpCheckboxField label="包含已售出" checked={filters.includeSold} onChange={(event) => updateFilter({includeSold: event.target.checked})} className="h-10 items-center px-3 text-xs text-[var(--erp-color-text-secondary)]" />
  </>;
  const mobileCount = view === "cards"
    ? listQuery.isError ? "加载失败" : searchPending || listQuery.isPending || listQuery.isPlaceholderData ? "更新中" : `${listQuery.data?.meta.total ?? 0} 件`
    : modelSummaryQuery.isError ? "加载失败" : !summaryReady ? "更新中" : `${modelRows.length} 个型号`;
  return <>
    <ErpWarehousePageFrame className="erp-inventory-directory" mobileSearchFirst>
      <ErpPageHeader title={phone ? <span className="erp-inventory-phone-title">库存<small>{filters.status || (filters.includeSold ? "含已售出" : "当前库存")} · {mobileCount}</small></span> : "库存中心"} subtitle="按 SN、型号、库位和状态快速定位库存；默认只展示当前库存，已退货等历史记录请通过状态筛选查看。" quickStatus={phone ? undefined : quickStatus} actions={phone ? <Button type="button" variant="ghost" onClick={() => setFiltersOpen(true)} aria-label={`库存筛选${activeFilterCount ? `，已启用 ${activeFilterCount} 项` : ""}`}><SlidersHorizontal className="h-4 w-4" />筛选{activeFilterCount > 0 && <span>{activeFilterCount}</span>}</Button> : <><InventoryViewSwitcher view={view} onChange={onChangeView} /><Button variant="secondary" onClick={onRefresh} disabled={listQuery.isFetching || modelSummaryQuery.isFetching}><RefreshCw className={listQuery.isFetching || modelSummaryQuery.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />刷新</Button></>} />
      {phone && <div className="erp-inventory-phone-views"><InventoryViewSwitcher view={view} onChange={onChangeView} /></div>}
      {!phone && <ErpMobileSummary label="库存统计">{inventoryMetrics}</ErpMobileSummary>}
      {!phone && summaryReady && (summary.pendingCount > 0 || summary.lockedCount > 0) && <Card data-erp-region="inventory-next-step" className="border-[var(--erp-color-border)] bg-[var(--erp-color-surface)]"><CardContent className="flex flex-wrap items-center justify-between gap-3 p-3"><div className="flex min-w-0 items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--erp-color-warning-soft)] text-[var(--erp-color-warning)]"><ShieldAlert className="h-4 w-4" /></span><div className="min-w-0"><p className="text-sm font-semibold text-[var(--erp-color-text)]">库存下一步</p><p className="truncate text-xs text-[var(--erp-color-text-secondary)]">待检测库存去质检，已预订库存去出库。</p></div></div><div className="flex flex-wrap items-center gap-2">{summary.pendingCount > 0 && <Link to={permissions.allowedMenus.includes("all") || permissions.allowedMenus.includes("inspections") ? "/inspections" : "/inventory"} className="inline-flex items-center gap-1 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-warning)] bg-[var(--erp-color-warning-soft)] px-3 py-2 text-xs font-semibold text-[var(--erp-color-warning)]">待检测 {summary.pendingCount}<ArrowRight className="h-3.5 w-3.5" /></Link>}{summary.lockedCount > 0 && <Link to="/sales/outbound" className="inline-flex items-center gap-1 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-info)] bg-[var(--erp-color-info-soft)] px-3 py-2 text-xs font-semibold text-[var(--erp-color-primary)]">已预订 {summary.lockedCount}<ArrowRight className="h-3.5 w-3.5" /></Link>}</div></CardContent></Card>}
      {!phone && <ErpPageToolbar>
      <ErpFilterBar mobileActiveCount={activeFilterCount - Number(Boolean(filters.keyword))} mobilePrimary={phone ? <div className="flex w-full min-w-0 items-center gap-2"><ErpSearchInput className="min-w-0 flex-1" value={filters.keyword} onChange={(event) => updateFilter({keyword: event.target.value})} placeholder="型号 / SN" aria-label="搜索库存" /><Button type="button" variant="secondary" size="icon" aria-label="扫码搜索库存" onClick={() => setScanOpen(true)}><ScanLine className="h-5 w-5" /></Button></div> : <ErpSearchInput className="min-w-[240px] flex-1" value={filters.keyword} onChange={(event) => updateFilter({keyword: event.target.value})} placeholder="搜索 SN、商品、品牌、型号" aria-label="搜索库存" />} actions={<Button variant="ghost" size="sm" onClick={() => commitFilters(defaultInventoryFilters)}><RotateCcw className="h-4 w-4" />重置筛选</Button>}>
        {filterFields}
      </ErpFilterBar>
      </ErpPageToolbar>}
      {phone && <nav className="erp-phone-category-strip" aria-label="库存分类"><Button type="button" variant="ghost" aria-pressed={!filters.category} onClick={() => updateFilter({category: ""})}>全部</Button>{inventoryCategories.map((category) => <Button key={category} type="button" variant="ghost" aria-pressed={filters.category === category} onClick={() => updateFilter({category})}>{category}</Button>)}</nav>}
      <ErpPageContent className="space-y-[var(--erp-page-gap)]">
      {view === "models" ? <InventoryModelTableRegion filters={filters} commitFilters={commitFilters} modelSummaryQuery={modelSummaryQuery} refreshing={!summaryReady} rows={summaryReady ? modelRows : []} pageRows={summaryReady ? modelPageRows : []} columns={modelColumns} columnVisibility={modelColumnVisibility} setColumnVisibility={setModelColumnVisibility} density={modelDensity} setDensity={setModelDensity} onOpenLedger={onOpenLedger} onOpenCards={onOpenCards} onStats={() => setStatsOpen(true)} /> : <>
        {selectedCount > 0 && <Card data-erp-region="inventory-selection-summary" className="flex flex-wrap items-center justify-between gap-3 border-[var(--erp-color-border-strong)] bg-[var(--erp-color-info-soft)] px-4 py-3"><span role="status" aria-live="polite" aria-atomic="true" className="text-sm font-semibold text-[var(--erp-color-primary)]">已选择 {selectedCount} 条库存</span><Button size="sm" variant="ghost" onClick={() => setRowSelection({})}>清除选择</Button></Card>}
        {phone && selectedCount > 0 && <div data-erp-region="inventory-phone-selection-bar" className="erp-phone-selection-bar"><span role="status" className="text-sm font-semibold text-[var(--erp-color-primary)]">已选择 <strong>{selectedCount}</strong> 件</span><div className="flex items-center gap-1.5"><Button size="sm" variant="ghost" onClick={() => setRowSelection({})}>清除</Button><Button size="sm" variant="primary" onClick={() => {setSelectionMode(false); setRowSelection({});}}>完成选择</Button></div></div>}
        {!phone && <ErpTableResultsBar summary={<span className="flex items-center gap-2"><Boxes className="h-4 w-4 text-[var(--erp-color-primary)]" />筛选结果 · {searchPending || listQuery.isPlaceholderData ? "更新中" : `${listQuery.data?.meta.total ?? 0} 条`}</span>} actions={<><ErpColumnVisibilityMenu columns={columns} visibility={columnVisibility} defaultVisibility={emptyInventoryVisibility} onVisibilityChange={setColumnVisibility} exclude={["select", "actions"]} /><div className="inline-flex rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-0.5"><Button type="button" size="sm" variant={density === "comfortable" ? "secondary" : "ghost"} onClick={() => setDensity("comfortable")}>舒适</Button><Button type="button" size="sm" variant={density === "compact" ? "secondary" : "ghost"} onClick={() => setDensity("compact")}>紧凑</Button></div></>} />}
        <ErpDataTable surface={phone ? "plain" : "card"} mobilePagination="compact" mobileToolbar={({openSorting, sortLabel, descending}) => <InventoryPhoneToolbar openSorting={openSorting} sortLabel={sortLabel} descending={descending} onStats={() => setStatsOpen(true)} onFinishSelection={selectionMode ? () => {setSelectionMode(false); setRowSelection({});} : undefined} />}
          mobileRow={(item) => <InventoryMobileRecord item={item} onOpen={() => onDetail(item)} />} mobileFieldOrder={["status","warehouseLocation","estimatedSellPrice","inventoryDays"]} ariaLabel="库存单卡与 SN 明细" columns={columns} data={searchPending || listQuery.isPlaceholderData ? [] : rows} getRowId={(row) => row.id} loading={listQuery.isPending || searchPending || listQuery.isPlaceholderData} fetching={listQuery.isFetching} error={listQuery.error as Error | null} errorTitle="库存加载失败" onRetry={() => void listQuery.refetch()} onRowClick={onDetail} mobileShowDetailAction={false} manualSorting sorting={sorting} onSortingChange={onSortingChange} page={filters.page} pageSize={filters.pageSize} total={listQuery.data?.meta.total} onPageChange={(page) => commitFilters({...filters, page})} onPageSizeChange={(pageSize) => commitFilters({...filters, page: 1, pageSize})} columnVisibility={phone ? {...columnVisibility, select: selectionMode} : columnVisibility} onColumnVisibilityChange={setColumnVisibility} rowSelection={rowSelection} onRowSelectionChange={setRowSelection} enableSelection enableColumnResizing density={density} stickyHeader virtualized={rows.length >= 50} />
      </>}
      </ErpPageContent>
      <ErpMobileActionDock hidden={filtersOpen || statsOpen || scanOpen || Boolean(detailId) || ledgerOpen} ariaLabel="库存快捷操作" primaryAction={<nav className="erp-inventory-phone-actions" aria-label="库存作业">{warehouseTasks.length ? warehouseTasks.map((item) => <Link key={item.id} to={item.path} className="erp-focus-ring"><item.icon className="h-4 w-4" /><span>{item.id === "inspections" ? "质检入库" : "扫码出库"}</span></Link>) : <Button type="button" variant="secondary" onClick={() => setStatsOpen(true)}>库存统计</Button>}</nav>}>
        <div className="erp-inventory-phone-search"><ErpSearchInput value={filters.keyword} onChange={(event) => updateFilter({keyword: event.target.value})} placeholder="搜索型号 / SN / 库存编号" aria-label="搜索库存" /><Button type="button" variant="secondary" size="icon" aria-label="扫码搜索库存" onClick={() => setScanOpen(true)}><ScanLine className="h-5 w-5" /></Button></div>
      </ErpMobileActionDock>
    </ErpWarehousePageFrame>
    <ErpDialogShell open={phone && filtersOpen} onOpenChange={setFiltersOpen} title="库存筛选" mobilePresentation="sheet" footer={<><Button variant="ghost" onClick={() => commitFilters(defaultInventoryFilters)}><RotateCcw className="h-4 w-4" />重置筛选</Button><Button onClick={() => setFiltersOpen(false)}>查看结果</Button></>}>
      <div className="grid min-w-0 grid-cols-1 gap-3 erp-inventory-phone-filters" data-erp-region="phone-filter-fields">{filterFields}<FilterSelect value={String(filters.pageSize)} onChange={(value) => updateFilter({pageSize: Number(value)})} label="每页条数" placeholder="每页条数" options={["20", "50", "100"]} optionLabels={{20: "20 条 / 页", 50: "50 条 / 页", 100: "100 条 / 页"}} /></div>
      <div className="erp-inventory-phone-filter-actions"><Button variant="secondary" onClick={onRefresh} disabled={listQuery.isFetching || modelSummaryQuery.isFetching}><RefreshCw className="h-4 w-4" />刷新库存</Button>{view === "cards" && <Button variant="secondary" aria-pressed={selectionMode} onClick={() => {setSelectionMode(!selectionMode); setRowSelection({}); setFiltersOpen(false);}}>{selectionMode ? "结束选择" : "选择库存"}</Button>}</div>
    </ErpDialogShell>
    <ErpDialogShell open={phone && statsOpen} onOpenChange={setStatsOpen} title="库存视图与统计" mobilePresentation="sheet"><InventoryViewSwitcher view={view} onChange={(next) => {onChangeView(next); setStatsOpen(false);}} /><div className="mt-4">{inventoryMetrics}</div></ErpDialogShell>
    <ErpBarcodeScannerDialog open={phone && scanOpen} onOpenChange={setScanOpen} onDetected={(keyword) => updateFilter({keyword})} title="扫码搜索库存" description="扫描 SN 或库存编号，在当前筛选范围内查找商品；不会自动修改库存。" />
    <ErpDetailDrawer open={view === "cards" && Boolean(detailId)} onOpenChange={(open) => {if (!open) onCloseDetail();}} modal={false} resizable drawerKey="inventory-detail" defaultWidth={820} minWidth={640} maxWidth={1100} title={journeyQuery.data?.card.productName || detailQuery.data?.item?.productName || detailId || "库存详情"}>
      {detailQuery.isPending && detailQuery.fetchStatus !== "idle" && !detailItem ? <ErpLoadingState title="正在加载库存详情" /> : detailQuery.error && !detailItem ? <ErpEmptyState title="详情加载失败" description={(detailQuery.error as Error).message} action={<Button size="sm" onClick={() => void detailQuery.refetch()}>重试</Button>} /> : detailItem ? <InventoryDetail item={detailItem} journey={journeyQuery.data} journeyLoading={journeyQuery.isPending && journeyQuery.fetchStatus !== "idle"} journeyError={journeyQuery.error as Error | null} onRetryJourney={() => void journeyQuery.refetch()} onOpenJourneyDocument={openJourneyDocument} showCost={permissions.showCost} showProfit={permissions.showProfit} /> : <ErpEmptyState title="库存记录不存在" description="该记录可能已被删除或当前账号无权访问。" />}
    </ErpDetailDrawer>
  </>;
}

function InventoryModelTableRegion({filters, commitFilters, modelSummaryQuery, refreshing, rows, pageRows, columns, columnVisibility, setColumnVisibility, density, setDensity, onOpenLedger, onOpenCards, onStats}: {
  filters: InventoryFilters;
  commitFilters: (filters: InventoryFilters) => void;
  modelSummaryQuery: UseQueryResult<InventoryModelSummary[], Error>;
  refreshing: boolean;
  rows: InventoryModelSummary[];
  pageRows: InventoryModelSummary[];
  columns: ReturnType<typeof createInventoryModelColumns>;
  columnVisibility: VisibilityState;
  setColumnVisibility: (updater: VisibilityState | ((old: VisibilityState) => VisibilityState)) => void;
  density: "comfortable" | "compact";
  setDensity: (density: "comfortable" | "compact") => void;
  onOpenLedger: (row: InventoryModelSummary) => void;
  onOpenCards: (row: InventoryModelSummary) => void;
  onStats: () => void;
}) {
  const phone = useErpPhone();
  return <>
    {!phone && <ErpTableResultsBar summary={<span className="flex items-center gap-2"><Boxes className="h-4 w-4 text-[var(--erp-color-primary)]" />型号汇总 · {rows.length} 个型号</span>} actions={<><ErpColumnVisibilityMenu columns={columns} visibility={columnVisibility} defaultVisibility={defaultModelVisibility} onVisibilityChange={setColumnVisibility} exclude={["select", "actions"]} /><div className="inline-flex rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-0.5"><Button type="button" size="sm" variant={density === "comfortable" ? "secondary" : "ghost"} onClick={() => setDensity("comfortable")}>舒适</Button><Button type="button" size="sm" variant={density === "compact" ? "secondary" : "ghost"} onClick={() => setDensity("compact")}>紧凑</Button></div></>} />}
    <ErpDataTable surface={phone ? "plain" : "card"} mobilePagination="compact" mobileToolbar={({openSorting, sortLabel, descending}) => <InventoryPhoneToolbar openSorting={openSorting} sortLabel={sortLabel} descending={descending} onStats={onStats} />}
      mobileRow={(row) => <div className="erp-inventory-phone-model"><ErpMobileRecordRow title={row.productName} icon={<Boxes className="h-5 w-5" />} subtitle={row.category} meta={<><span>在库 {row.availableCount} · 待检 {row.pendingCount} · 锁定 {row.lockedCount}</span><span className="erp-inventory-phone-location">{row.warehouseLocations.join("、") || "未设置库位"}</span></>} amountLabel="库存数量" amount={`${row.totalCount} 件`} onOpen={() => onOpenLedger(row)} /><Button variant="ghost" onClick={() => onOpenCards(row)}>查看单卡<ArrowRight className="h-4 w-4" /></Button></div>}
      ariaLabel="型号库存汇总" columns={columns} data={pageRows} getRowId={(row) => row.key} loading={refreshing && !modelSummaryQuery.isError} fetching={modelSummaryQuery.isFetching} error={modelSummaryQuery.error as Error | null} errorTitle="型号库存加载失败" emptyTitle="暂无型号库存" emptyDescription="当前筛选条件下没有可聚合的库存。" onRetry={() => void modelSummaryQuery.refetch()} onRowClick={onOpenLedger} mobileShowDetailAction={false} page={filters.page} pageSize={filters.pageSize} total={rows.length} onPageChange={(page) => commitFilters({...filters, page})} onPageSizeChange={(pageSize) => commitFilters({...filters, page: 1, pageSize})} columnVisibility={columnVisibility} onColumnVisibilityChange={setColumnVisibility} enableColumnResizing density={density} stickyHeader virtualized={pageRows.length >= 50} />
  </>;
}

function InventoryPhoneToolbar({openSorting, sortLabel, descending, onStats, onFinishSelection}: {openSorting: () => void; sortLabel: string; descending: boolean | undefined; onStats: () => void; onFinishSelection?: () => void}) {
  return <div className="erp-inventory-phone-toolbar">{onFinishSelection ? <Button variant="ghost" onClick={onFinishSelection}>完成选择</Button> : <Button variant="ghost" onClick={onStats}><Boxes className="h-4 w-4" />库存统计</Button>}<Button variant="ghost" onClick={openSorting}><ArrowDownUp className="h-4 w-4" /><span>{sortLabel || "默认顺序"}{descending === undefined ? "" : descending ? " ↓" : " ↑"}</span></Button></div>;
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
  const phone = useErpPhone();
  const sold = item.inventoryStatus === "已售出";
  const phonePrice = sold ? item.salesPrice : item.estimatedSellPrice;
  const details: Array<[string, string | undefined]> = [
    ["SN / 库存编号", item.serialNumber], ["品牌 / 型号", `${item.brand} ${item.model}`], ["显存 / 版本", `${item.vram || "—"} ${item.version || ""}`.trim()], ["成色", item.condition], ["仓库 / 库位", item.warehouse], ["检测状态", item.inspectionStatus], ["库存状态", item.inventoryStatus], ["入库时间", item.entryTime || "—"], ["库存龄", `${item.inventoryDays} 天`], ["来源", item.sourceType || "—"], ["供应商 / 客户", item.supplierName || item.buyerName || "—"],
  ];
  return <div className="space-y-6" data-phone-detail="inventory">
    <section className="space-y-3">
      <div data-phone-image-empty={!item.imageUrl || undefined} className="flex h-36 items-center justify-center overflow-hidden rounded-[var(--erp-radius-lg)] bg-[var(--erp-color-surface-muted)]">{item.imageUrl ? <img src={item.imageUrl} alt={item.productName} className="h-full max-w-full object-contain" /> : <div className="flex flex-col items-center gap-2 text-xs text-[var(--erp-color-text-muted)]"><ImageOff className="h-7 w-7" />{phone ? "暂无商品图片" : "接口未返回商品图片"}</div>}</div>
      <div className="erp-inventory-detail-identity flex items-start justify-between gap-3"><div className="min-w-0"><p className="erp-inventory-detail-title truncate text-lg font-semibold text-[var(--erp-color-text)]">{item.productName}</p><p className="mt-1 text-xs text-[var(--erp-color-text-muted)]">{item.category}</p></div><InventoryStatus status={item.inventoryStatus} /></div>
      <div className="erp-phone-only"><span className="erp-phone-detail-price erp-data-number">{phonePrice === undefined ? "未设置售价" : formatCurrency(phonePrice)}</span><p className="text-xs text-[var(--erp-color-text-muted)]">{sold ? "实际成交价" : "预计售价"} · {item.condition} · {item.vram}</p></div>
    </section>
    <InventoryDetailSection title="基础信息"><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{phone ? <><DetailField label="SN" value={item.serialNumber} /><DetailField label="库存编号" value={item.id} /><DetailField label="仓库 / 库位" value={item.warehouse} /><DetailField label="库存龄" value={`${item.inventoryDays} 天`} /><DetailField label="检测状态" value={item.inspectionStatus} /></> : details.map(([label, value]) => <DetailField key={label} label={label} value={value} />)}</div>{phone && <details className="erp-inventory-phone-more"><summary>更多档案信息</summary><div className="grid grid-cols-1 gap-2">{details.filter(([label]) => !["SN / 库存编号", "仓库 / 库位", "库存龄", "检测状态"].includes(label)).map(([label, value]) => <DetailField key={label} label={label} value={value} />)}</div></details>}</InventoryDetailSection>
    <InventoryJourneyPanel item={item} journey={journey} showCost={showCost} showProfit={showProfit} loading={journeyLoading} error={journeyError} onRetry={onRetryJourney} onOpenDocument={onOpenJourneyDocument} />
    {item.inventoryStatus !== "已售出" && showCost && <InventoryDetailSection title="成本与售价"><div className="grid grid-cols-2 gap-4 sm:grid-cols-3"><DetailAmount label="成本价" value={item.costPrice} /><DetailAmount label="预计售价" value={item.estimatedSellPrice} /><div><p className="text-xs text-[var(--erp-color-text-muted)]">预计利润</p><p className="mt-1 text-base"><ProfitDisplay value={showProfit ? item.estimatedProfit : undefined} /></p></div></div></InventoryDetailSection>}
    <InventoryDetailSection title="库存属性"><div className="flex flex-wrap gap-2"><ErpStatusBadge label={item.inWarranty ? "质保中" : "无质保"} tone={item.inWarranty ? "success" : "neutral"} />{item.repaired && <ErpStatusBadge label="维修记录" tone="warning" />}{item.gpuRisk && <ErpStatusBadge label="风险库存" tone="danger" />}{item.fullBox && <ErpStatusBadge label="全套包装" tone="info" />}</div>{item.remarks && <p className="mt-3 text-xs leading-5 text-[var(--erp-color-text-secondary)]">备注：{item.remarks}</p>}</InventoryDetailSection>
  </div>;
}

function InventoryDetailSection({title, children}: {title: string; children: ReactNode}) { return <section className="rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-4"><h3 className="text-sm font-semibold text-[var(--erp-color-text)]">{title}</h3><div className="mt-3">{children}</div></section>; }
function DetailField({label, value}: {label: string; value: string | undefined}) { return <ErpDetailFact label={label} value={value || "—"} />; }
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
