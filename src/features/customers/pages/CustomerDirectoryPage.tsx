import {useErpPhone} from "@/src/hooks/useErpViewport";
import {ErpMobileRecordRow} from "@/src/components/common/ErpMobileRecordRow";
import {ErpMobileActionDock} from "@/src/components/common/ErpMobileActionDock";
import {keepPreviousData, useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useWorkspaceTabActivity} from "@/src/hooks/useWorkspaceTabRuntime";
import type {OnChangeFn, SortingState, VisibilityState} from "@tanstack/react-table";
import {ArrowDown, ArrowUp, BadgeDollarSign, ChevronDown, CircleDollarSign, Download, Filter, Plus, RefreshCw, RotateCcw, ShieldAlert, SlidersHorizontal, Star, UserRound, Users} from "lucide-react";
import {ErpDialogShell, ErpMobileSummary, ErpSearchInput} from "@/src/components/common";
import {useEffect, useMemo, useState, type ReactNode} from "react";
import {notify} from "@/src/utils/notification";
import {Button, Card, Select} from "@/src/components/ui";
import {ErpColumnVisibilityMenu, DashboardSection, ErpConfirmDialog, ErpDataTable, ErpDetailDrawer, ErpDetailFact, ErpFilterBar, ErpListPageFrame, ErpLoadingState, ErpMetricCard, ErpPageContent, ErpPageError, ErpPageHeader, ErpPageToolbar, ErpStatusBadge, ErpTableResultsBar, MetricsRegion, type QuickStatusItemData} from "@/src/components/common";
import {ApiError, customersApi, queryKeys, type AuthSession} from "@/src/services/api";
import {invalidateErpDomains} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import {useTablePreferences} from "@/src/hooks/useTablePreferences";
import {useDebouncedValue} from "@/src/hooks/useDebouncedValue";
import {useUrlSearchState} from "@/src/hooks/useUrlSearchState";
import {formatCurrency} from "@/src/lib/format";
import type {CustomerDirectoryFilters, CustomerDirectoryItem, CustomerRecordFormValues} from "@/src/types/customer";
import {customerLevels} from "@/src/types/customer";
import {createCustomerColumns, customerLevelTone} from "../customer.columns";
import {customerFiltersToSearch, defaultCustomerFilters, parseCustomerFilters} from "../customer.filters";
import {CustomerRecordDialog} from "../components/CustomerRecordDialog";

function useCustomerUrlState() {
  return useUrlSearchState({defaultValue: defaultCustomerFilters, parse: parseCustomerFilters, serialize: customerFiltersToSearch});
}

export function CustomerDirectoryPage() {
  const {active} = useWorkspaceTabActivity();
  const {session, logout} = useAuth();
  const {value: filters, commit: commitFilters} = useCustomerUrlState();
  const [sorting, setSorting] = useState<SortingState>([]);
  const debouncedKeyword = useDebouncedValue(filters.keyword);
  const requestFilters = useMemo(() => ({...filters, keyword: debouncedKeyword}), [debouncedKeyword, filters]);
  const allowed = createCapabilities(session).menu("customers");
  const listQuery = useQuery({queryKey: queryKeys.customers.directory({showProfit: Boolean(session?.permissions.showProfit)}, requestFilters, sorting), queryFn: ({signal}) => customersApi.list(requestFilters, sorting, {showProfit: Boolean(session?.permissions.showProfit)}, signal), enabled: active && Boolean(session && allowed), placeholderData: keepPreviousData, retry: false});
  useEffect(() => {if (listQuery.error instanceof ApiError && listQuery.error.isUnauthorized) logout();}, [listQuery.error, logout]);
  if (!session) return <Card><ErpLoadingState title="正在验证客户档案权限" /></Card>;
  if (!session || !allowed) return <ErpPageError title="当前账号没有客户档案权限" description="服务器权限未包含 customers 菜单，请联系管理员授权。" />;
  return <CustomerDirectoryContent session={session} query={listQuery} filters={filters} sorting={sorting} onSortingChange={setSorting} onFiltersChange={commitFilters} onAuthExpired={logout} />;
}

function CustomerDirectoryContent({session, query, filters, sorting, onSortingChange, onFiltersChange, onAuthExpired}: {session: AuthSession; query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof customersApi.list>>>>; filters: CustomerDirectoryFilters; sorting: SortingState; onSortingChange: OnChangeFn<SortingState>; onFiltersChange: (filters: CustomerDirectoryFilters) => void; onAuthExpired: () => void}) {
  const phone = useErpPhone();
  const [phoneFiltersOpen, setPhoneFiltersOpen] = useState(false);
  const queryClient = useQueryClient();
  const {columnVisibility, setColumnVisibility, density, setDensity} = useTablePreferences<VisibilityState>({feature: "customers", userId: session.user.id, defaultVisibility: {}});
  const [detail, setDetail] = useState<CustomerDirectoryItem | null>(null);
  const [editing, setEditing] = useState<CustomerDirectoryItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<CustomerDirectoryItem | null>(null);
  const customers = query.data?.customers || [];
  const canEdit = createCapabilities(session).menu("crm");
  const canDelete = session.permissions.canDelete;

  const total = query.data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  useEffect(() => {if (filters.page > totalPages) onFiltersChange({...filters, page: totalPages});}, [filters, onFiltersChange, totalPages]);
  const invalidate = () => invalidateErpDomains(queryClient, ["customers", "state", "crm"]);
  const handleMutationError = (error: Error) => {if (error instanceof ApiError && error.isUnauthorized) {onAuthExpired(); return;} notify.error(error.message);};
  const saveMutation = useMutation({mutationFn: ({values, current}: {values: CustomerRecordFormValues; current: CustomerDirectoryItem | null}) => current ? customersApi.update(current.id, values, session.permissions) : customersApi.create(values, session.permissions), onSuccess: async (customer) => {notify.success(`${customer.name} 已保存`); setDialogOpen(false); setEditing(null); setDetail(customer); await invalidate();}, onError: handleMutationError});
  const deleteMutation = useMutation({mutationFn: (id: string) => customersApi.remove(id), onSuccess: async () => {notify.success("客户档案已删除"); setDeleting(null); setDetail(null); await invalidate();}, onError: handleMutationError});
  const openCreate = () => {setEditing(null); setDialogOpen(true); saveMutation.reset();};
  const openEdit = (customer: CustomerDirectoryItem) => {if (!canEdit) return; setEditing(customer); setDialogOpen(true); saveMutation.reset();};
  const columns = useMemo(() => createCustomerColumns({showProfit: session.permissions.showProfit, canEdit, canDelete, onEdit: openEdit, onDelete: setDeleting}), [canDelete, canEdit, session.permissions.showProfit]);
  const coreCount = query.data?.summary.coreCount || 0;
  const receivable = query.data?.summary.receivable || 0;
  const payable = query.data?.summary.payable || 0;
  const activeFilters = Number(Boolean(filters.keyword)) + Number(filters.type !== "all") + Number(filters.channel !== "all") + Number(filters.level !== "all");
  const quickStatus: QuickStatusItemData[] = [
    {icon: <Star className="h-4 w-4" />, label: "核心客户", value: `${coreCount} 位`, description: "核心身份固定 S 级", tone: coreCount ? "info" : "neutral"},
    {icon: <ShieldAlert className="h-4 w-4" />, label: "编辑权限", value: canEdit ? "可编辑" : "仅查看", description: canEdit ? "由 crm 权限控制" : "创建权限不等于 CRM 编辑权限", tone: canEdit ? "success" : "warning"},
  ];

  const exportCustomers = () => {
    const rows = [["档案编号", "客户名称", "联系方式", "类型", "来源", "等级", "CRM状态", "负责人", "累计交易", ...(session.permissions.showProfit ? ["累计利润"] : []), "应收", "应付", "最近交易", "备注"], ...customers.map((item) => [item.id, item.name, item.contact, item.type, item.source, item.level, item.crmStatus, item.owner || "", item.totalAmount, ...(session.permissions.showProfit ? [item.totalProfit || 0] : []), item.receivableBalance, item.payableBalance, item.lastDealTime || "", item.remarks || ""])];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], {type: "text/csv;charset=utf-8"}));
    const link = document.createElement("a"); link.href = url; link.download = "客户档案.csv"; link.click(); URL.revokeObjectURL(url);
  };

  const filterFields = <><Select className="w-40" value={filters.type} onValueChange={(type) => onFiltersChange({...filters, type, page: 1})} options={[{value: "all", label: "全部类型"}, ...(query.data?.types || []).map((value) => ({value, label: value}))]} aria-label="筛选客户类型" /><Select className="w-36" value={filters.channel} onValueChange={(channel) => onFiltersChange({...filters, channel, page: 1})} options={[{value: "all", label: "全部来源"}, ...(query.data?.channels || []).map((value) => ({value, label: value}))]} aria-label="筛选客户来源" /><Select className="w-32" value={filters.level} onValueChange={(level) => onFiltersChange({...filters, level, page: 1})} options={[{value: "all", label: "全部等级"}, ...customerLevels.map((value) => ({value, label: value}))]} aria-label="筛选客户等级" /></>;
  const filterActions = <><Button type="button" size="sm" variant="ghost" onClick={() => onFiltersChange(defaultCustomerFilters)}><RotateCcw className="h-4 w-4" />重置</Button><Button type="button" size="sm" variant="secondary" onClick={exportCustomers}><Download className="h-4 w-4" />导出</Button></>;
  const search = <ErpSearchInput className={phone ? "w-full" : "min-w-64 flex-1"} value={filters.keyword} onChange={(event) => onFiltersChange({...filters, keyword: event.target.value, page: 1})} placeholder={phone ? "搜索名称、电话、微信" : "客户名称、电话、微信、档案编号或备注"} aria-label="搜索客户档案" />;
  const customerTable = <ErpDataTable
    surface={phone ? "plain" : "card"}
    mobilePagination="compact"
    mobileToolbar={({openSorting, sortLabel, descending}) => <div className="erp-customer-list-toolbar"><div className="erp-customer-quick-filters" role="group" aria-label="客户快捷筛选"><Button type="button" variant={filters.level === "all" ? "primary" : "ghost"} aria-pressed={filters.level === "all"} onClick={() => onFiltersChange({...filters, level: "all", page: 1})}>全部</Button><Button type="button" variant={filters.level === "S级" ? "primary" : "ghost"} aria-pressed={filters.level === "S级"} onClick={() => onFiltersChange({...filters, level: "S级", page: 1})}>核心 / S级</Button></div><Button type="button" variant="ghost" className="erp-customer-sort" aria-label="客户排序" onClick={openSorting}><span>{sortLabel || "最近交易"}</span>{descending === undefined ? <ChevronDown className="h-4 w-4" /> : descending ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}</Button></div>}
    mobileRow={(item) => <ErpMobileRecordRow title={item.name} icon={<UserRound className="h-5 w-5" aria-hidden="true" />} meta={item.lastDealTime ? <>最近交易 <time className="erp-customer-last-date" dateTime={item.lastDealTime.slice(0, 10)}>{item.lastDealTime.slice(0, 10)}</time></> : "暂无交易"} statusPlacement="title" status={<ErpStatusBadge label={`${item.level}${item.isCoreCustomer ? " · 核心" : ""}`} tone={customerLevelTone(item.level)} />} amountLabel="累计交易" amount={formatCurrency(item.totalAmount)} onOpen={() => setDetail(item)} />}
    mobileFieldOrder={["contact","level","crmStatus","balance"]} ariaLabel="个人客户明细" columns={columns} data={customers} getRowId={(row) => row.id} loading={query.isPending} fetching={query.isFetching} error={query.error as Error | null} errorTitle="客户档案加载失败" emptyTitle="暂无匹配客户" emptyDescription={activeFilters ? "请调整搜索或筛选条件。" : "点击新建客户创建第一份档案。"} onRetry={() => void query.refetch()} onRowClick={setDetail} manualSorting sorting={sorting} onSortingChange={onSortingChange} page={filters.page} pageSize={filters.pageSize} total={total} onPageChange={(page) => onFiltersChange({...filters, page})} onPageSizeChange={(pageSize) => onFiltersChange({...filters, page: 1, pageSize})} columnVisibility={columnVisibility} onColumnVisibilityChange={setColumnVisibility} enableColumnResizing density={density} stickyHeader
  />;

  return <ErpListPageFrame className="erp-customer-directory" data-phone-layout={phone ? "thumb" : undefined}>
    <ErpPageHeader title={phone ? <span className="erp-customer-phone-title">客户<small>{query.isPending ? "正在加载…" : query.error && !query.data ? "加载失败" : `${total} 位客户`}</small></span> : "客户档案"} subtitle="集中维护个人客户身份、等级、联系方式和往来余额；交易关联与等级校验仍由现有服务端负责。" quickStatus={quickStatus} actions={phone ? <Button type="button" variant="secondary" onClick={() => setPhoneFiltersOpen(true)} aria-label="客户筛选与操作"><SlidersHorizontal className="h-5 w-5" />筛选{activeFilters > 0 && <span className="tabular-nums">{activeFilters}</span>}</Button> : <><Button type="button" size="sm" variant="secondary" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />刷新</Button><Button type="button" size="sm" variant="primary" onClick={openCreate}><Plus className="h-4 w-4" />新建客户</Button></>} />
    {!phone && <><ErpMobileSummary><MetricsRegion><MetricCard label="客户总数" value={`${total} 位`} detail="当前筛选结果" icon={<Users className="h-4 w-4" />} /><MetricCard label="核心 / S级" value={`${coreCount} 位`} detail="当前筛选结果" icon={<Star className="h-4 w-4" />} tone="info" /><MetricCard label="应收余额" value={formatCurrency(receivable)} detail="当前筛选结果" icon={<BadgeDollarSign className="h-4 w-4" />} tone={receivable ? "warning" : "success"} /><MetricCard label="应付余额" value={formatCurrency(payable)} detail="当前筛选结果" icon={<CircleDollarSign className="h-4 w-4" />} tone={payable ? "info" : "success"} /></MetricsRegion></ErpMobileSummary>
    <ErpPageToolbar><ErpFilterBar actions={filterActions}>{search}{filterFields}</ErpFilterBar></ErpPageToolbar></>}
    <ErpPageContent className="space-y-[var(--erp-page-gap)]">
    {!phone && <ErpTableResultsBar summary={<span className="flex flex-wrap items-center gap-2 text-[var(--erp-color-text-muted)]"><Filter className="h-3.5 w-3.5" /><ErpStatusBadge label={activeFilters ? `${activeFilters} 项筛选` : "全部客户"} tone={activeFilters ? "info" : "neutral"} /><span>筛选、排序、汇总和分页均由服务器按当前租户计算。</span></span>} actions={<><ErpColumnVisibilityMenu columns={columns} visibility={columnVisibility} onVisibilityChange={setColumnVisibility} /><div className="inline-flex rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-0.5"><Button type="button" size="sm" variant={density === "comfortable" ? "secondary" : "ghost"} onClick={() => setDensity("comfortable")}>舒适</Button><Button type="button" size="sm" variant={density === "compact" ? "secondary" : "ghost"} onClick={() => setDensity("compact")}>紧凑</Button></div></>} />}
    {phone ? customerTable : <DashboardSection title="个人客户明细" description="点击行查看客户基础档案；新增客户与 CRM 编辑使用现有不同权限接口。" actions={<ErpStatusBadge label={`共 ${total} 条`} tone="info" />}>{customerTable}</DashboardSection>}
    <ErpMobileActionDock hidden={Boolean(detail || dialogOpen || deleting || phoneFiltersOpen)} ariaLabel="客户搜索与新建" primaryAction={<Button type="button" variant="primary" onClick={openCreate}><Plus className="h-5 w-5" />新建客户</Button>}>{search}</ErpMobileActionDock>
    {phone && <ErpDialogShell open={phoneFiltersOpen} onOpenChange={setPhoneFiltersOpen} title="客户筛选与操作" mobilePresentation="sheet" footer={<>{filterActions}<Button type="button" variant="primary" onClick={() => setPhoneFiltersOpen(false)}>查看结果</Button></>}><div className="space-y-4"><div data-erp-region="phone-filter-fields" className="grid gap-3">{filterFields}<Select aria-label="每页条数" value={String(filters.pageSize)} onValueChange={(value) => onFiltersChange({...filters, page: 1, pageSize: Number(value)})} options={[20, 50, 100].map((value) => ({value: String(value), label: `${value} 条/页`}))} /></div><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />刷新</Button><ErpStatusBadge label={canEdit ? "可编辑档案" : "仅查看档案"} tone={canEdit ? "success" : "neutral"} /></div><dl className="erp-customer-filter-summary"><div><dt>核心 / S级</dt><dd>{coreCount} 位</dd></div><div><dt>应收余额</dt><dd>{formatCurrency(receivable)}</dd></div><div><dt>应付余额</dt><dd>{formatCurrency(payable)}</dd></div></dl></div></ErpDialogShell>}
    <CustomerDetailDrawer customer={detail} showProfit={session.permissions.showProfit} canEdit={canEdit} onClose={() => setDetail(null)} onEdit={() => {if (detail) openEdit(detail);}} />
    <CustomerRecordDialog open={dialogOpen} customer={editing} channels={query.data?.channels || []} types={query.data?.types || []} pending={saveMutation.isPending} error={saveMutation.error instanceof Error ? saveMutation.error.message : undefined} onOpenChange={(open) => {setDialogOpen(open); if (!open) setEditing(null);}} onSubmit={async (values) => {await saveMutation.mutateAsync({values, current: editing});}} />
    <DeleteCustomerDialog customer={deleting} pending={deleteMutation.isPending} error={deleteMutation.error instanceof Error ? deleteMutation.error.message : undefined} onClose={() => {setDeleting(null); deleteMutation.reset();}} onConfirm={() => {if (deleting) deleteMutation.mutate(deleting.id);}} />
    </ErpPageContent>
  </ErpListPageFrame>;
}

function CustomerDetailDrawer({customer, showProfit, canEdit, onClose, onEdit}: {customer: CustomerDirectoryItem | null; showProfit: boolean; canEdit: boolean; onClose: () => void; onEdit: () => void}) {
  const phone = useErpPhone();
  if (phone) return <ErpDetailDrawer modal={false} resizable drawerKey="customer-detail" defaultWidth={720} minWidth={560} maxWidth={920} open={Boolean(customer)} onOpenChange={(open) => {if (!open) onClose();}} title={customer?.name || "客户详情"} description={customer ? `${customer.id} · ${customer.type}` : undefined} footer={canEdit && customer ? <Button className="w-full" variant="primary" onClick={onEdit}>编辑客户档案</Button> : undefined}>
    {customer && <div className="erp-phone-document" data-phone-detail="document"><section><div className="erp-phone-customer-identity"><Users className="h-8 w-8" /><div><h2>{customer.name}</h2><ErpStatusBadge label={`${customer.level}${customer.isCoreCustomer ? " · 核心客户" : ""}`} tone="info" /></div></div></section>
    <section><h2>往来概览</h2><Fact label="累计交易" value={formatCurrency(customer.totalAmount)} /><Fact label="交易次数" value={`买 ${customer.buyCount} · 回收 ${customer.recycleCount}`} /><Fact label="应收余额" value={formatCurrency(customer.receivableBalance)} /><Fact label="应付余额" value={formatCurrency(customer.payableBalance)} />{showProfit && <Fact label="累计利润" value={formatCurrency(customer.totalProfit ?? 0)} />}<Fact label="最近交易" value={customer.lastDealTime?.slice(0, 10) || "暂无"} /></section>
    <section><h2>联系与跟进</h2><Fact label="联系方式" value={customer.contact || "未记录"} /><Fact label="负责人" value={customer.owner || "未分配"} /><Fact label="CRM 状态" value={[customer.crmStatus, customer.crmStage].filter(Boolean).join(" · ")} /><Fact label="来源" value={customer.source} /></section>
    <details><summary>档案与备注</summary><Fact label="意向" value={customer.intent || "未记录"} /><Fact label="售后次数" value={`${customer.aftersalesCount} 次`} />{customer.riskReason && <Fact label="风险原因" value={customer.riskReason} />}{customer.levelReason && <Fact label="等级说明" value={customer.levelReason} />}{customer.tags.length > 0 && <div className="flex flex-wrap gap-2">{customer.tags.map((tag) => <ErpStatusBadge key={tag} label={tag} tone="neutral" />)}</div>}<Fact label="备注" value={customer.remarks || "—"} /></details></div>}
  </ErpDetailDrawer>;
  return <ErpDetailDrawer modal={false} resizable drawerKey="customer-detail" defaultWidth={720} minWidth={560} maxWidth={920} open={Boolean(customer)} onOpenChange={(open) => {if (!open) onClose();}} title={customer?.name || "客户详情"} description={customer ? `${customer.id} · ${customer.type}` : undefined} footer={canEdit && customer ? <Button className="w-full" variant="primary" onClick={onEdit}>编辑客户档案</Button> : undefined}><div className="space-y-5" data-phone-detail="customer">{customer && <><div className="erp-phone-only erp-phone-customer-identity"><Users className="h-8 w-8" /><div><h2>{customer.name}</h2><ErpStatusBadge label={`${customer.level}${customer.isCoreCustomer ? " · 核心客户" : ""}`} tone="info" /></div></div><div className="grid grid-cols-2 gap-3"><Fact label="客户等级" value={`${customer.level}${customer.isCoreCustomer ? " · 核心" : ""}`} /><Fact label="CRM 状态" value={[customer.crmStatus, customer.crmStage].filter(Boolean).join(" · ")} /><Fact label="联系方式" value={customer.contact || "未记录"} /><Fact label="来源" value={customer.source} /><Fact label="负责人" value={customer.owner || "未分配"} /><Fact label="意向" value={customer.intent || "未记录"} /><Fact label="累计交易" value={formatCurrency(customer.totalAmount)} /><Fact label="交易次数" value={`买 ${customer.buyCount} · 回收 ${customer.recycleCount}`} />{showProfit && <Fact label="累计利润" value={formatCurrency(customer.totalProfit || 0)} />}<Fact label="售后次数" value={`${customer.aftersalesCount} 次`} /><Fact label="应收余额" value={formatCurrency(customer.receivableBalance)} /><Fact label="应付余额" value={formatCurrency(customer.payableBalance)} /></div>{customer.riskReason && <DashboardSection title="风险原因"><p className="text-sm text-[var(--erp-color-danger)]">{customer.riskReason}</p></DashboardSection>}{customer.levelReason && <DashboardSection title="等级说明"><p className="text-sm text-[var(--erp-color-text-secondary)]">{customer.levelReason}</p></DashboardSection>}{customer.tags.length > 0 && <div className="flex flex-wrap gap-2">{customer.tags.map((tag) => <ErpStatusBadge key={tag} label={tag} tone="neutral" />)}</div>}{customer.remarks && <p className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3 text-sm text-[var(--erp-color-text-secondary)]">{customer.remarks}</p>}</>}</div></ErpDetailDrawer>;
}

function DeleteCustomerDialog({customer, pending, error, onClose, onConfirm}: {customer: CustomerDirectoryItem | null; pending: boolean; error?: string; onClose: () => void; onConfirm: () => void}) {
  return <ErpConfirmDialog open={Boolean(customer)} onOpenChange={(open) => {if (!open && !pending) onClose();}} title="删除客户档案" description="已有交易、收付款、售后或 CRM 记录的客户会由服务端拒绝删除。" documentName={customer?.name} confirmLabel="确认删除" pendingLabel="删除中…" confirmVariant="danger" pending={pending} error={error} onConfirm={onConfirm} />;
}

function MetricCard({label, value, detail, icon, tone = "neutral"}: {label: string; value: string; detail: string; icon: ReactNode; tone?: "neutral" | "info" | "success" | "warning"}) {return <ErpMetricCard label={label} value={value} detail={detail} icon={icon} tone={tone} />;}
const Fact = ErpDetailFact;
function csvCell(value: string | number) {const text = String(value); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;}
