import {keepPreviousData, useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useWorkspaceTabActivity} from "@/src/hooks/useWorkspaceTabRuntime";
import type {OnChangeFn, SortingState, VisibilityState} from "@tanstack/react-table";
import {BadgeDollarSign, CircleDollarSign, Download, Filter, Handshake, Plus, RefreshCw, RotateCcw, ShieldAlert, Star} from "lucide-react";
import {ErpMobileSummary, ErpSearchInput} from "@/src/components/common";
import {useEffect, useMemo, useState, type ReactNode} from "react";
import {notify} from "@/src/utils/notification";
import {Button, Card, Select} from "@/src/components/ui";
import {ErpColumnVisibilityMenu, DashboardSection, ErpConfirmDialog, ErpDataTable, ErpDetailDrawer, ErpDetailFact, ErpFilterBar, ErpListPageFrame, ErpLoadingState, ErpMetricCard, ErpPageContent, ErpPageError, ErpPageHeader, ErpPageToolbar, ErpStatusBadge, ErpTableResultsBar, MetricsRegion, type QuickStatusItemData} from "@/src/components/common";
import {ApiError, queryKeys, vendorsApi, type AuthSession} from "@/src/services/api";
import {invalidateErpDomains} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import {useTablePreferences} from "@/src/hooks/useTablePreferences";
import {useDebouncedValue} from "@/src/hooks/useDebouncedValue";
import {useUrlSearchState} from "@/src/hooks/useUrlSearchState";
import {formatCurrency} from "@/src/lib/format";
import {vendorLevels, vendorTypes, type VendorDirectoryFilters, type VendorDirectoryItem, type VendorRecordFormValues} from "@/src/types/vendor";
import {VendorRecordDialog} from "../components/VendorRecordDialog";
import {createVendorColumns} from "../vendor.columns";
import {defaultVendorFilters, parseVendorFilters, vendorFiltersToSearch} from "../vendor.filters";

function useVendorUrlState() {
  return useUrlSearchState({defaultValue: defaultVendorFilters, parse: parseVendorFilters, serialize: vendorFiltersToSearch});
}

export function VendorDirectoryPage() {
  const {active} = useWorkspaceTabActivity();
  const {session, logout} = useAuth();
  const {value: filters, commit: commitFilters} = useVendorUrlState();
  const [sorting, setSorting] = useState<SortingState>([]);
  const debouncedKeyword = useDebouncedValue(filters.keyword, 250);
  const serverFilters = {...filters, keyword: debouncedKeyword};
  const allowed = createCapabilities(session).menu("vendors");
  const listQuery = useQuery({queryKey: queryKeys.vendors.directory({showProfit: Boolean(session?.permissions.showProfit)}, serverFilters, sorting), queryFn: ({signal}) => vendorsApi.list(serverFilters, sorting, {showProfit: Boolean(session?.permissions.showProfit)}, signal), enabled: active && Boolean(session && allowed), placeholderData: keepPreviousData, retry: false});
  useEffect(() => {if (listQuery.error instanceof ApiError && listQuery.error.isUnauthorized) logout();}, [listQuery.error, logout]);
  if (!session) return <Card><ErpLoadingState title="正在验证同行档案权限" /></Card>;
  if (!session || !allowed) return <ErpPageError title="当前账号没有同行档案权限" description="服务器权限未包含 vendors 菜单，请联系管理员授权。" />;
  return <VendorDirectoryContent session={session} query={listQuery} filters={filters} sorting={sorting} onSortingChange={(next) => {setSorting(next); commitFilters({...filters, page: 1});}} onFiltersChange={commitFilters} onAuthExpired={logout} />;
}

function VendorDirectoryContent({session, query, filters, sorting, onSortingChange, onFiltersChange, onAuthExpired}: {session: AuthSession; query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof vendorsApi.list>>>>; filters: VendorDirectoryFilters; sorting: SortingState; onSortingChange: OnChangeFn<SortingState>; onFiltersChange: (filters: VendorDirectoryFilters) => void; onAuthExpired: () => void}) {
  const queryClient = useQueryClient();
  const {columnVisibility, setColumnVisibility, density, setDensity} = useTablePreferences<VisibilityState>({feature: "vendors", userId: session.user.id, defaultVisibility: {}});
  const [detail, setDetail] = useState<VendorDirectoryItem | null>(null);
  const [editing, setEditing] = useState<VendorDirectoryItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<VendorDirectoryItem | null>(null);
  const vendors = query.data?.vendors || [];
  const canEdit = true;
  const canDelete = session.permissions.canDelete;

  const total = query.data?.meta?.total ?? vendors.length;
  const totalPages = query.data?.meta?.totalPages ?? Math.max(1, Math.ceil(total / filters.pageSize));
  useEffect(() => {if (filters.page > totalPages) onFiltersChange({...filters, page: totalPages});}, [filters, onFiltersChange, totalPages]);
  const invalidate = () => invalidateErpDomains(queryClient, ["vendors", "state", "purchase", "sales"]);
  const handleMutationError = (error: Error) => {if (error instanceof ApiError && error.isUnauthorized) {onAuthExpired(); return;} notify.error(error.message);};
  const saveMutation = useMutation({mutationFn: ({values, current}: {values: VendorRecordFormValues; current: VendorDirectoryItem | null}) => current ? vendorsApi.update(current.id, values, {showProfit: session.permissions.showProfit}) : vendorsApi.create(values, {showProfit: session.permissions.showProfit}), onSuccess: async (vendor) => {notify.success(`${vendor.name} 已保存`); setDialogOpen(false); setEditing(null); setDetail(vendor); await invalidate();}, onError: handleMutationError});
  const deleteMutation = useMutation({mutationFn: (id: string) => vendorsApi.remove(id), onSuccess: async () => {notify.success("同行档案已删除"); setDeleting(null); setDetail(null); await invalidate();}, onError: handleMutationError});
  const openCreate = () => {setEditing(null); setDialogOpen(true); saveMutation.reset();};
  const openEdit = (vendor: VendorDirectoryItem) => {setEditing(vendor); setDialogOpen(true); saveMutation.reset();};
  const columns = useMemo(() => createVendorColumns({showProfit: session.permissions.showProfit, canEdit, canDelete, onEdit: openEdit, onDelete: setDeleting}), [canDelete, session.permissions.showProfit]);
  const coreCount = query.data?.meta?.summary.coreCount ?? vendors.filter((item) => item.isCoreCustomer || item.level === "S级").length;
  const payable = query.data?.meta?.summary.payable ?? vendors.reduce((sum, item) => sum + item.payableBalance, 0);
  const receivable = query.data?.meta?.summary.receivable ?? vendors.reduce((sum, item) => sum + item.receivableBalance, 0);
  const credit = query.data?.meta?.summary.credit ?? vendors.reduce((sum, item) => sum + item.returnCreditBalance, 0);
  const activeFilters = Number(Boolean(filters.keyword)) + Number(filters.type !== "all") + Number(filters.level !== "all") + Number(filters.balance !== "all");
  const quickStatus: QuickStatusItemData[] = [
    {icon: <Star className="h-4 w-4" />, label: "核心同行", value: `${coreCount} 家`, description: "核心采购方固定 S 级", tone: coreCount ? "info" : "neutral"},
    {icon: <ShieldAlert className="h-4 w-4" />, label: "档案权限", value: canDelete ? "可维护 / 删除" : "可维护", description: "删除额外受 canDelete 控制", tone: "success"},
  ];

  const exportVendors = () => {
    const rows = [["档案编号", "同行名称", "联系方式", "类型", "等级", "核心同行", "累计往来", "交易笔数", ...(session.permissions.showProfit ? ["平均利润"] : []), "应付余额", "应收余额", "退货抵扣余额", "最近交易", "备注"], ...vendors.map((item) => [item.id, item.name, item.contact, item.type, item.level, item.isCoreCustomer ? "是" : "否", item.totalBuyAmount, item.totalCount, ...(session.permissions.showProfit ? [item.averageProfit || 0] : []), item.payableBalance, item.receivableBalance, item.returnCreditBalance, item.lastDealTime || "", item.remarks || ""])];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], {type: "text/csv;charset=utf-8"}));
    const link = document.createElement("a"); link.href = url; link.download = "同行档案.csv"; link.click(); URL.revokeObjectURL(url);
  };

  return <ErpListPageFrame>
    <ErpPageHeader title="供应商 / 同行" subtitle="维护供应商、同行与往来余额。" quickStatus={quickStatus} actions={<><Button type="button" size="sm" variant="secondary" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />刷新</Button><Button type="button" size="sm" variant="primary" onClick={openCreate}><Plus className="h-4 w-4" />新建同行</Button></>} />
    <ErpMobileSummary><MetricsRegion><MetricCard label="同行总数" value={`${total} 家`} detail="按当前筛选" icon={<Handshake className="h-4 w-4" />} /><MetricCard label="核心 / S级" value={`${coreCount} 家`} detail="核心采购方与核心同行" icon={<Star className="h-4 w-4" />} tone="info" /><MetricCard label="应付余额" value={formatCurrency(payable)} detail="门店应向同行支付" icon={<BadgeDollarSign className="h-4 w-4" />} tone={payable ? "warning" : "success"} /><MetricCard label="应收 / 退货抵扣" value={`${formatCurrency(receivable)} / ${formatCurrency(credit)}`} detail="应收与抵扣分别核算" icon={<CircleDollarSign className="h-4 w-4" />} tone={receivable || credit ? "info" : "success"} /></MetricsRegion></ErpMobileSummary>
    <ErpPageToolbar><ErpFilterBar actions={<><Button type="button" size="sm" variant="ghost" onClick={() => onFiltersChange(defaultVendorFilters)}><RotateCcw className="h-4 w-4" />重置</Button><Button type="button" size="sm" variant="secondary" onClick={exportVendors}><Download className="h-4 w-4" />导出</Button></>}><ErpSearchInput className="min-w-64 flex-1" value={filters.keyword} onChange={(event) => onFiltersChange({...filters, keyword: event.target.value, page: 1})} placeholder="同行名称、联系方式、档案编号、风险或备注" aria-label="搜索同行档案" /><Select className="w-40" value={filters.type} onValueChange={(type) => onFiltersChange({...filters, type, page: 1})} options={[{value: "all", label: "全部类型"}, ...vendorTypes.map((value) => ({value, label: value}))]} aria-label="筛选同行类型" /><Select className="w-32" value={filters.level} onValueChange={(level) => onFiltersChange({...filters, level, page: 1})} options={[{value: "all", label: "全部等级"}, ...vendorLevels.map((value) => ({value, label: value}))]} aria-label="筛选同行等级" /><Select className="w-40" value={filters.balance} onValueChange={(balance) => onFiltersChange({...filters, balance: balance as VendorDirectoryFilters["balance"], page: 1})} options={[{value: "all", label: "全部往来余额"}, {value: "payable", label: "有应付余额"}, {value: "receivable", label: "有应收余额"}, {value: "credit", label: "有退货抵扣"}]} aria-label="筛选往来余额" /></ErpFilterBar></ErpPageToolbar>
    <ErpPageContent className="space-y-[var(--erp-page-gap)]">
    <ErpTableResultsBar summary={<span className="flex flex-wrap items-center gap-2 text-[var(--erp-color-text-muted)]"><Filter className="h-3.5 w-3.5" /><ErpStatusBadge label={activeFilters ? `${activeFilters} 项筛选` : "全部同行"} tone={activeFilters ? "info" : "neutral"} /><span>筛选、排序和分页仅作用于已加载同行集合。</span></span>} actions={<><ErpColumnVisibilityMenu columns={columns} visibility={columnVisibility} onVisibilityChange={setColumnVisibility} /><div className="inline-flex rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-0.5"><Button type="button" size="sm" variant={density === "comfortable" ? "secondary" : "ghost"} onClick={() => setDensity("comfortable")}>舒适</Button><Button type="button" size="sm" variant={density === "compact" ? "secondary" : "ghost"} onClick={() => setDensity("compact")}>紧凑</Button></div></>} />
    <DashboardSection title="同行档案明细" description="点击行查看基础档案和三类往来余额；删除已关联采购或销售单据的同行会被服务端拒绝。" actions={<ErpStatusBadge label={`当前页 ${vendors.length} / 共 ${total} 条`} tone="info" />}><ErpDataTable mobileFieldOrder={["contact","level","balances","lastDealTime"]} ariaLabel="同行档案明细" columns={columns} data={vendors} getRowId={(row) => row.id} loading={query.isPending} fetching={query.isFetching} error={query.error as Error | null} errorTitle="同行档案加载失败" emptyTitle="暂无匹配同行" emptyDescription={activeFilters ? "请调整搜索或筛选条件。" : "点击新建同行创建第一份档案。"} onRetry={() => void query.refetch()} onRowClick={setDetail} manualSorting sorting={sorting} onSortingChange={onSortingChange} page={filters.page} pageSize={filters.pageSize} total={total} onPageChange={(page) => onFiltersChange({...filters, page})} onPageSizeChange={(pageSize) => onFiltersChange({...filters, page: 1, pageSize})} columnVisibility={columnVisibility} onColumnVisibilityChange={setColumnVisibility} enableColumnResizing density={density} stickyHeader /></DashboardSection>
    <VendorDetailDrawer vendor={detail} showProfit={session.permissions.showProfit} canEdit={canEdit} onClose={() => setDetail(null)} onEdit={() => {if (detail) openEdit(detail);}} />
    <VendorRecordDialog open={dialogOpen} vendor={editing} pending={saveMutation.isPending} error={saveMutation.error instanceof Error ? saveMutation.error.message : undefined} onOpenChange={(open) => {setDialogOpen(open); if (!open) setEditing(null);}} onSubmit={async (values) => {await saveMutation.mutateAsync({values, current: editing});}} />
    <DeleteVendorDialog vendor={deleting} pending={deleteMutation.isPending} error={deleteMutation.error instanceof Error ? deleteMutation.error.message : undefined} onClose={() => {setDeleting(null); deleteMutation.reset();}} onConfirm={() => {if (deleting) deleteMutation.mutate(deleting.id);}} />
    </ErpPageContent>
  </ErpListPageFrame>;
}

function VendorDetailDrawer({vendor, showProfit, canEdit, onClose, onEdit}: {vendor: VendorDirectoryItem | null; showProfit: boolean; canEdit: boolean; onClose: () => void; onEdit: () => void}) {
  return <ErpDetailDrawer modal={false} resizable drawerKey="vendor-detail" defaultWidth={720} minWidth={560} maxWidth={920} open={Boolean(vendor)} onOpenChange={(open) => {if (!open) onClose();}} title={vendor?.name || "同行详情"} description={vendor ? `${vendor.id} · ${vendor.type}` : undefined} footer={canEdit && vendor ? <Button className="w-full" variant="primary" onClick={onEdit}>编辑同行档案</Button> : undefined}><div className="space-y-5">{vendor && <><div className="grid grid-cols-2 gap-3"><Fact label="同行等级" value={`${vendor.level}${vendor.isCoreCustomer ? " · 核心" : ""}`} /><Fact label="往来类型" value={vendor.type} /><Fact label="联系方式" value={vendor.contact || "未记录"} /><Fact label="联系人" value={vendor.contactPerson || "未记录"} /><Fact label="累计往来" value={formatCurrency(vendor.totalBuyAmount)} /><Fact label="交易笔数" value={`${vendor.totalCount} 笔`} />{showProfit && <Fact label="平均利润" value={formatCurrency(vendor.averageProfit || 0)} />}<Fact label="售后记录" value={`${vendor.aftersalesCount} 次 · ${vendor.aftersalesRate}%`} /><Fact label="应付余额" value={formatCurrency(vendor.payableBalance)} /><Fact label="应收余额" value={formatCurrency(vendor.receivableBalance)} /><Fact label="退货抵扣余额" value={formatCurrency(vendor.returnCreditBalance)} /><Fact label="最近交易" value={vendor.lastDealTime || "暂无"} /></div>{vendor.riskReason && <DashboardSection title="风险原因"><p className="text-sm text-[var(--erp-color-danger)]">{vendor.riskReason}</p></DashboardSection>}{vendor.levelReason && <DashboardSection title="等级说明"><p className="text-sm text-[var(--erp-color-text-secondary)]">{vendor.levelReason}</p></DashboardSection>}{vendor.remarks && <p className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3 text-sm text-[var(--erp-color-text-secondary)]">{vendor.remarks}</p>}</>}</div></ErpDetailDrawer>;
}

function DeleteVendorDialog({vendor, pending, error, onClose, onConfirm}: {vendor: VendorDirectoryItem | null; pending: boolean; error?: string; onClose: () => void; onConfirm: () => void}) {
  return <ErpConfirmDialog open={Boolean(vendor)} onOpenChange={(open) => {if (!open && !pending) onClose();}} title="删除同行档案" description="已有采购或销售单据的同行会由服务端拒绝删除；有风险的同行建议保留档案并标记 R 级。" documentName={vendor?.name} confirmLabel="确认删除" pendingLabel="删除中…" confirmVariant="danger" pending={pending} error={error} onConfirm={onConfirm} />;
}

function MetricCard({label, value, detail, icon, tone = "neutral"}: {label: string; value: string; detail: string; icon: ReactNode; tone?: "neutral" | "info" | "success" | "warning"}) {return <ErpMetricCard label={label} value={value} detail={detail} icon={icon} tone={tone} />;}
const Fact = ErpDetailFact;
function csvCell(value: string | number) {const text = String(value); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;}
