import {keepPreviousData, useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Combine, LockKeyhole, PackageOpen, RefreshCw, Unplug, Wrench} from "lucide-react";
import {ErpSearchInput} from "@/src/components/common";
import {useMemo, useState, type ReactNode} from "react";
import {notify} from "@/src/utils/notification";
import {Button, Card, Input, Select} from "@/src/components/ui";
import {DashboardSection, ErpConfirmDialog, ErpDataTable, ErpDetailDrawer, ErpDetailFact, ErpFilterBar, ErpLoadingState, ErpMetricCard, ErpPageContent, ErpPageError, ErpPageHeader, ErpPageToolbar, ErpStatusBadge, ErpWarehousePageFrame, MainRegion, MetricsRegion, type QuickStatusItemData} from "@/src/components/common";
import {ApiError, assemblyApi, queryKeys, type AuthSession} from "@/src/services/api";
import {invalidateErpDomains, refreshErpAfterDocument} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import {useUrlSearchState} from "@/src/hooks/useUrlSearchState";
import {formatCurrency} from "@/src/lib/format";
import {isInventorySellableStatus} from "@/src/utils/inventoryFilters";
import type {AssemblyOperation, AssemblyOperationFilters} from "@/src/types/assembly";
import {createAssemblyColumns, assemblyOperationValue} from "../assembly.columns";
import {assemblyFiltersToSearch, defaultAssemblyFilters, parseAssemblyFilters} from "../assembly.filters";
import {AssemblyOperationForm} from "../components";

function useAssemblyUrlState() {
  return useUrlSearchState({defaultValue: defaultAssemblyFilters, parse: parseAssemblyFilters, serialize: assemblyFiltersToSearch});
}

export function AssemblyWorkspacePage() {
  const {session, logout} = useAuth();
  const {value: filters, commit} = useAssemblyUrlState();
  const allowed = createCapabilities(session).menu("assembly");
  const access = {showCost: Boolean(session?.permissions.showCost), showProfit: Boolean(session?.permissions.showProfit)};
  const listQuery = useQuery({queryKey: queryKeys.assembly.list(filters, access), queryFn: ({signal}) => assemblyApi.list(filters, access, signal), enabled: Boolean(session && allowed), placeholderData: keepPreviousData, retry: false});
  const referenceQuery = useQuery({queryKey: queryKeys.assembly.referenceData(access), queryFn: ({signal}) => assemblyApi.referenceData(access, signal), enabled: Boolean(session && allowed), staleTime: 30_000, retry: false});
  if (!session) return <Card><ErpLoadingState title="正在验证整机组装权限" /></Card>;
  if (!session || !allowed) return <ErpPageError title="当前账号没有整机组装权限" description="服务器已拒绝 assembly 菜单访问，请联系管理员授权。" />;
  return <AssemblyContent session={session} filters={filters} onFiltersChange={commit} listQuery={listQuery} referenceQuery={referenceQuery} onAuthExpired={logout} />;
}

function AssemblyContent({session, filters, onFiltersChange, listQuery, referenceQuery, onAuthExpired}: {session: AuthSession; filters: AssemblyOperationFilters; onFiltersChange: (filters: AssemblyOperationFilters) => void; listQuery: ReturnType<typeof useQuery<Awaited<ReturnType<typeof assemblyApi.list>>>>; referenceQuery: ReturnType<typeof useQuery<Awaited<ReturnType<typeof assemblyApi.referenceData>>>>; onAuthExpired: () => void}) {
  const queryClient = useQueryClient();
  const [detail, setDetail] = useState<AssemblyOperation | null>(null);
  const [deleting, setDeleting] = useState<AssemblyOperation | null>(null);
  const access = {showCost: session.permissions.showCost, showProfit: session.permissions.showProfit};
  const records = listQuery.data?.items || [];
  const references = referenceQuery.data || {inventory: [], products: []};
  const availableParts = references.inventory.filter((item) => isInventorySellableStatus(item.status)).length;
  const invalidate = () => invalidateErpDomains(queryClient, ["assembly", "inventory", "products", "state"]);
  const handleError = (error: Error) => {if (error instanceof ApiError && error.isUnauthorized) {onAuthExpired(); return;} notify.error(error.message);};
  const createMutation = useMutation({mutationFn: ({values}: {values: Parameters<typeof assemblyApi.create>[0]; reset: () => void}) => assemblyApi.create(values, access), onSuccess: async (operation, variables) => {variables.reset(); notify.success(`${operation.type}单 ${operation.id} 已保存，库存状态已同步`); await refreshErpAfterDocument(queryClient);}, onError: handleError});
  const deleteMutation = useMutation({mutationFn: (id: string) => assemblyApi.remove(id, access), onSuccess: async (operation) => {setDeleting(null); notify.success(`${operation.id} 已删除，库存状态由服务端完成回滚`); await invalidate();}, onError: handleError});
  const columns = useMemo(() => createAssemblyColumns({showProfit: session.permissions.showProfit, canDelete: session.permissions.canDelete, onView: setDetail, onDelete: setDeleting}), [session.permissions.canDelete, session.permissions.showProfit]);
  const quickStatus: QuickStatusItemData[] = [
    {icon: <Wrench className="h-4 w-4" />, label: "操作单", value: `${listQuery.data?.total || 0} 单`, description: "拆卸与组装记录", tone: "success"},
    {icon: <PackageOpen className="h-4 w-4" />, label: "可组装来源", value: `${availableParts} 件`, description: "已入库或已上架", tone: availableParts ? "info" : "neutral"},
    {icon: <LockKeyhole className="h-4 w-4" />, label: "删除回滚", value: session.permissions.canDelete ? "已授权" : "无权限", description: "最终由服务端校验", tone: session.permissions.canDelete ? "warning" : "neutral"},
  ];
  const activeFilters = Number(Boolean(filters.keyword)) + Number(filters.type !== "all") + Number(Boolean(filters.handler));

  return <ErpWarehousePageFrame>
    <ErpPageHeader title="整机与组装" subtitle="拆卸库存、组合配件并追溯每一次库存状态变化；业务原子性继续由现有服务端保证。" quickStatus={quickStatus} actions={<Button type="button" size="sm" variant="secondary" onClick={() => void Promise.all([listQuery.refetch(), referenceQuery.refetch()])} disabled={listQuery.isFetching || referenceQuery.isFetching}><RefreshCw className={`h-4 w-4 ${listQuery.isFetching || referenceQuery.isFetching ? "animate-spin" : ""}`} />刷新</Button>} />
    <MetricsRegion><MetricCard label="操作单总数" value={`${listQuery.data?.total || 0} 单`} detail="按当前服务端筛选" icon={<Wrench className="h-4 w-4" />} /><MetricCard label="本页拆卸" value={`${records.filter((item) => item.type === "拆卸").length} 单`} detail="当前分页结果" icon={<Unplug className="h-4 w-4" />} tone="warning" /><MetricCard label="本页组装" value={`${records.filter((item) => item.type === "组装").length} 单`} detail="当前分页结果" icon={<Combine className="h-4 w-4" />} tone="success" /><MetricCard label="商品模板" value={`${references.products.length} 款`} detail="来自真实商品快照" icon={<PackageOpen className="h-4 w-4" />} /></MetricsRegion>
    {referenceQuery.isPending ? <Card><ErpLoadingState title="正在加载组装参考库存" /></Card> : referenceQuery.error ? <ErpPageError title="无法加载组装参考数据" description={(referenceQuery.error as Error).message} onRetry={() => void referenceQuery.refetch()} /> : <MainRegion variant="70-30"><MainRegion.Primary><AssemblyOperationForm handler={session.user.displayName} references={references} showCost={session.permissions.showCost} showProfit={session.permissions.showProfit} submitting={createMutation.isPending} error={createMutation.error instanceof Error ? createMutation.error.message : undefined} onSubmit={(values, reset) => createMutation.mutate({values, reset})} /></MainRegion.Primary><MainRegion.Secondary><RecentOperations records={records.slice(0, 6)} showProfit={session.permissions.showProfit} onView={setDetail} /></MainRegion.Secondary></MainRegion>}
    <ErpPageToolbar><ErpFilterBar actions={<Button type="button" size="sm" variant="ghost" onClick={() => onFiltersChange(defaultAssemblyFilters)}>重置筛选</Button>}><ErpSearchInput className="min-w-64 flex-1" value={filters.keyword} onChange={(event) => onFiltersChange({...filters, keyword: event.target.value, page: 1})} placeholder="搜索单号、SN、商品或配件" aria-label="搜索组装拆卸记录" /><Select value={filters.type} onValueChange={(type) => onFiltersChange({...filters, type: type as AssemblyOperationFilters["type"], page: 1})} options={[{value: "all", label: "全部类型"}, {value: "拆卸", label: "拆卸"}, {value: "组装", label: "组装"}]} className="w-36" aria-label="筛选操作类型" /><Input className="w-40" value={filters.handler} onChange={(event) => onFiltersChange({...filters, handler: event.target.value, page: 1})} placeholder="经办人精确筛选" aria-label="筛选经办人" /></ErpFilterBar></ErpPageToolbar>
    <ErpPageContent className="space-y-[var(--erp-page-gap)]">
    <DashboardSection title="组装拆卸历史" description="列表使用服务端搜索、类型、经办人和分页；不对大数据伪装本地分页。" actions={<ErpStatusBadge label={activeFilters ? `${activeFilters} 项筛选` : "全部记录"} tone={activeFilters ? "info" : "neutral"} />}><ErpDataTable ariaLabel="组装拆卸历史" columns={columns} data={records} getRowId={(row) => row.id} loading={listQuery.isPending} fetching={listQuery.isFetching} error={listQuery.error as Error | null} errorTitle="组装拆卸记录加载失败" emptyTitle="暂无组装拆卸记录" emptyDescription={activeFilters ? "请调整筛选条件。" : "保存第一张拆卸或组装单后会显示在这里。"} onRetry={() => void listQuery.refetch()} onRowClick={setDetail} page={filters.page} pageSize={filters.pageSize} total={listQuery.data?.total || 0} onPageChange={(page) => onFiltersChange({...filters, page})} onPageSizeChange={(pageSize) => onFiltersChange({...filters, page: 1, pageSize})} enableColumnResizing density="compact" stickyHeader /></DashboardSection>
    <AssemblyDetail record={detail} showCost={session.permissions.showCost} showProfit={session.permissions.showProfit} onClose={() => setDetail(null)} />
    <DeleteAssemblyDialog record={deleting} pending={deleteMutation.isPending} onClose={() => setDeleting(null)} onConfirm={() => {if (deleting) deleteMutation.mutate(deleting.id);}} />
    </ErpPageContent>
  </ErpWarehousePageFrame>;
}

function MetricCard({label, value, detail, icon, tone = "info"}: {label: string; value: string; detail: string; icon: ReactNode; tone?: "info" | "success" | "warning"}) {return <ErpMetricCard label={label} value={value} detail={detail} icon={icon} tone={tone} />;}

function RecentOperations({records, showProfit, onView}: {records: AssemblyOperation[]; showProfit: boolean; onView: (record: AssemblyOperation) => void}) {return <DashboardSection title="近期操作" description="当前分页中的最新记录" className="sticky top-4"><div className="space-y-2">{records.length ? records.map((record) => <Button type="button" variant="ghost" size="sm" key={record.id} onClick={() => onView(record)} className="h-auto w-full flex-col items-stretch justify-start rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] p-3 text-left hover:bg-[var(--erp-color-surface-muted)]"><div className="flex items-center justify-between gap-2"><strong className="erp-data-number text-sm">{record.id}</strong><ErpStatusBadge label={record.type} tone={record.type === "拆卸" ? "warning" : "info"} /></div><p className="mt-2 truncate text-xs text-[var(--erp-color-text-secondary)]">{record.type === "拆卸" ? `${record.beforeProductName || "库存"} → ${record.afterParts.length} 个配件` : `${record.beforeParts.length} 个配件 → ${record.afterProductName || "组装成品"}`}</p><div className="mt-2 flex justify-between text-xs text-[var(--erp-color-text-muted)]"><span>{record.handler}</span><span>{showProfit ? formatCurrency(assemblyOperationValue(record)) : record.time}</span></div></Button>) : <p className="py-8 text-center text-xs text-[var(--erp-color-text-muted)]">当前没有操作记录</p>}</div></DashboardSection>;}

function AssemblyDetail({record, showCost, showProfit, onClose}: {record: AssemblyOperation | null; showCost: boolean; showProfit: boolean; onClose: () => void}) {const parts = record?.type === "拆卸" ? record.afterParts : record?.beforeParts || []; return <ErpDetailDrawer modal={false} resizable drawerKey="assembly-detail" defaultWidth={720} minWidth={560} maxWidth={920} open={Boolean(record)} onOpenChange={(open) => {if (!open) onClose();}} title={record ? `${record.type}单 ${record.id}` : "组装拆卸详情"} description="展示真实操作记录；库存状态与可删除性仍以服务端为准。"><div className="space-y-4">{record && <><div className="grid grid-cols-2 gap-3"><Fact label="操作类型" value={record.type} /><Fact label="经办人" value={record.handler} /><Fact label="操作时间" value={record.time || "—"} /><Fact label="配件数量" value={`${parts.length} 件`} /><Fact label="操作前" value={record.type === "拆卸" ? `${record.beforeProductName || "库存"} · ${record.beforeSn || "—"}` : `${record.beforeParts.length} 个来源配件`} /><Fact label="操作后" value={record.type === "组装" ? `${record.afterProductName || "组装成品"} · ${record.afterSn || "—"}` : `${record.afterParts.length} 个新配件`} /></div><DashboardSection title="配件明细"><div className="space-y-2">{parts.map((part) => <div key={`${part.sn}-${part.productId || part.partName}`} className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3"><div className="flex items-center justify-between gap-3"><strong>{part.partName}</strong><ErpStatusBadge label={part.category} tone="neutral" /></div><p className="mt-1 erp-data-number text-xs text-[var(--erp-color-text-secondary)]">SN：{part.sn}</p><p className="mt-2 text-xs text-[var(--erp-color-text-muted)]">{showCost && part.costPrice !== undefined ? `成本 ${formatCurrency(part.costPrice)}` : "成本无权限"}{showProfit && part.estSellPrice !== undefined ? ` · 预计 ${formatCurrency(part.estSellPrice)}` : " · 预计价值无权限"}</p>{part.remarks && <p className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">{part.remarks}</p>}</div>)}</div></DashboardSection>{record.remarks && <DashboardSection title="操作备注"><p className="text-sm text-[var(--erp-color-text-secondary)]">{record.remarks}</p></DashboardSection>}</>}</div></ErpDetailDrawer>;}

const Fact = ErpDetailFact;

function DeleteAssemblyDialog({record, pending, onClose, onConfirm}: {record: AssemblyOperation | null; pending: boolean; onClose: () => void; onConfirm: () => void}) {return <ErpConfirmDialog open={Boolean(record)} onOpenChange={(open) => {if (!open && !pending) onClose();}} title="删除并回滚库存" description="服务端仅在相关库存尚未被后续业务使用时允许删除，并同步回滚库存状态。" documentName={record?.id} confirmLabel="确认删除" pendingLabel="处理中…" confirmVariant="danger" pending={pending} onConfirm={onConfirm} />;}
