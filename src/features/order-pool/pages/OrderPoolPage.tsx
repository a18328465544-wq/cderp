import {keepPreviousData, useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import type {ColumnDef} from "@tanstack/react-table";
import {AlertTriangle, CalendarClock, CheckCircle2, CircleDot, ClipboardList, Link2, MessageSquarePlus, Plus, RefreshCw, RotateCcw, UserRound, Users} from "lucide-react";
import {ErpDateTimePicker, ErpDetailFact, ErpField, ErpSearchInput} from "@/src/components/common";
import {useEffect, useMemo, useState, type FormEvent, type ReactNode} from "react";
import {notify} from "@/src/utils/notification";
import {Button, Card, Input, Select, Textarea} from "@/src/components/ui";
import {DashboardSection, ErpDataTable, ErpDetailDrawer, ErpFilterBar, ErpListPageFrame, ErpLoadingState, ErpMetricCard, ErpPageContent, ErpPageError, ErpPageHeader, ErpPageToolbar, ErpStatusBadge, MainRegion, MetricsRegion, type QuickStatusItemData} from "@/src/components/common";
import {createCapabilities, useAuth} from "@/src/app/auth";
import {ApiError, orderPoolApi, queryKeys, refreshErpAfterDocument, type AuthSession} from "@/src/services/api";
import {invalidateErpDomains} from "@/src/services/api/invalidation";
import {useUrlSearchState} from "@/src/hooks/useUrlSearchState";
import type {CustomerOrder, OrderPoolBlocker, OrderPoolCollaboratorOption, OrderPoolCreateInput, OrderPoolDocumentLinkInput, OrderPoolFilters, OrderPoolOrderType, OrderPoolPriority, OrderPoolQueue, OrderPoolStage, OrderPoolUpdateInput} from "@/src/types/order-pool";
import {orderPoolPartyTypeValues, orderPoolPriorityValues} from "@/src/types/order-pool";
import {formatStoreDateTime} from "@/src/utils/storeTime";
import {orderPoolMainStageOptions, orderPoolOrderTypeDefaultBlocker, orderPoolOrderTypeOptions, orderPoolQueueOptions, orderPoolStageOptions, orderPoolBlockerOptions, orderPoolStageTone, orderPoolTypeTone, isOrderPoolDueToday, isOrderPoolOverdue} from "../order-pool.logic";
import {countActiveOrderPoolFilters, defaultOrderPoolFilters, orderPoolFiltersToSearch, parseOrderPoolFilters} from "../order-pool.filters";

const partyTypeLabels: Record<(typeof orderPoolPartyTypeValues)[number], string> = {customer: "个人客户", vendor: "同行 / 供应商", mixed: "客户 + 同行"};
const partyTypeOptions = orderPoolPartyTypeValues.map((value) => ({value, label: partyTypeLabels[value]}));
const priorityLabels: Record<(typeof orderPoolPriorityValues)[number], string> = {normal: "普通", high: "高优先级", urgent: "紧急", low: "低优先级"};
const priorityOptions = orderPoolPriorityValues.map((value) => ({value, label: priorityLabels[value]}));
const blockerOptions = [{value: "none", label: "无阻塞"}, ...orderPoolBlockerOptions];
const documentTypeOptions = [
  {value: "quote", label: "报价单"},
  {value: "sales", label: "销售单"},
  {value: "purchase", label: "采购单"},
  {value: "return", label: "退货单"},
  {value: "inspection", label: "检测单"},
  {value: "payment_in", label: "收款单"},
  {value: "payment_out", label: "付款单"},
  {value: "inventory", label: "库存记录"},
  {value: "aftersales", label: "售后单"},
];
const documentTypeLabels = Object.fromEntries(documentTypeOptions.map((item) => [item.value, item.label]));

function useOrderPoolUrlState() {
  return useUrlSearchState({defaultValue: defaultOrderPoolFilters, parse: parseOrderPoolFilters, serialize: orderPoolFiltersToSearch});
}

export function OrderPoolPage() {
  const {session, logout} = useAuth();
  const {value: filters, commit} = useOrderPoolUrlState();
  const allowed = createCapabilities(session).menu("order_pool");
  const query = useQuery({
    queryKey: queryKeys.orderPool.list(filters),
    queryFn: ({signal}) => orderPoolApi.list(filters, signal),
    enabled: Boolean(session && allowed),
    placeholderData: keepPreviousData,
    retry: false,
  });
  useEffect(() => {if (query.error instanceof ApiError && query.error.isUnauthorized) logout();}, [logout, query.error]);
  if (!session) return <Card><ErpLoadingState title="正在验证订单池权限" /></Card>;
  if (!allowed) return <ErpPageError title="当前账号没有订单池权限" description="服务器权限未包含 order_pool 菜单，请联系管理员授权。" />;
  return <OrderPoolContent session={session} filters={filters} commitFilters={commit} query={query} onAuthExpired={logout} />;
}

function OrderPoolContent({session, filters, commitFilters, query, onAuthExpired}: {
  session: AuthSession;
  filters: OrderPoolFilters;
  commitFilters: (filters: OrderPoolFilters) => void;
  query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof orderPoolApi.list>>>>;
  onAuthExpired: () => void;
}) {
  const queryClient = useQueryClient();
  const collaboratorQuery = useQuery({queryKey: queryKeys.orderPool.collaborators(), queryFn: ({signal}) => orderPoolApi.listCollaborators(signal), enabled: Boolean(session), retry: false});
  const [selected, setSelected] = useState<CustomerOrder | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const collection = query.data || {items: [], page: filters.page, pageSize: filters.pageSize, total: 0, summary: {total: 0, pendingClaim: 0, following: 0, waitingCustomer: 0, pendingExecution: 0, completed: 0, exceptions: 0, mine: 0, unassigned: 0, dueToday: 0, overdue: 0}};
  const items = collection.items;
  const mineQueueEmpty = filters.queue === "mine" && items.length === 0 && collection.summary.total > collection.summary.mine;
  const collaboratorOptions = collaboratorQuery.data || [];
  const owners = useMemo(() => {
    const values = new Map<string, string>();
    collaboratorOptions.forEach((option) => values.set(option.id, option.displayName));
    items.forEach((item) => {if (item.ownerId) values.set(item.ownerId, item.ownerName || item.ownerId); if (item.ownerName) values.set(item.ownerName, item.ownerName); item.collaborators.forEach((collaborator) => {if (collaborator.userId) values.set(collaborator.userId, collaborator.displayName || collaborator.userId); if (collaborator.displayName) values.set(collaborator.displayName, collaborator.displayName);});});
    return Array.from(values.entries()).sort((left, right) => left[1].localeCompare(right[1], "zh-CN") || left[0].localeCompare(right[0])).map(([value, label]) => ({value, label}));
  }, [collaboratorOptions, items]);
  const updateFilters = (patch: Partial<OrderPoolFilters>) => commitFilters({...filters, ...patch, page: patch.page ?? 1});
  const invalidate = () => invalidateErpDomains(queryClient, ["orderPool", "state"]);
  const handleError = (error: Error) => {if (error instanceof ApiError && error.isUnauthorized) {onAuthExpired(); return;} notify.error(error.message);};
  const createMutation = useMutation({mutationFn: (input: OrderPoolCreateInput) => orderPoolApi.create(input), onSuccess: async (order) => {notify.success(`${order.orderNo} 已加入订单池`); setCreateOpen(false); setSelected(order); setDetailOpen(true); await refreshErpAfterDocument(queryClient);}, onError: handleError});
  const updateMutation = useMutation({mutationFn: ({id, patch}: {id: string; patch: OrderPoolUpdateInput; feedback?: string}) => orderPoolApi.update(id, patch), onSuccess: async (order, variables) => {setSelected(order); notify.success(variables.feedback || "订单池信息已更新"); await invalidate();}, onError: handleError});
  const noteMutation = useMutation({mutationFn: ({id, content}: {id: string; content: string}) => orderPoolApi.addNote(id, {content}), onSuccess: async (order) => {setSelected(order); notify.success("跟进记录已添加"); await invalidate();}, onError: handleError});
  const linkMutation = useMutation({mutationFn: ({id, input}: {id: string; input: OrderPoolDocumentLinkInput}) => orderPoolApi.linkDocument(id, input), onSuccess: async (order) => {setSelected(order); notify.success("业务单据已关联"); await invalidate();}, onError: handleError});
  const activeFilterCount = countActiveOrderPoolFilters(filters);
  const queueCounts: Record<OrderPoolQueue, number> = {
    mine: collection.summary.mine,
    all: collection.summary.total,
    unassigned: collection.summary.unassigned,
    waiting_customer: collection.summary.waitingCustomer,
    due_today: collection.summary.dueToday,
    overdue: collection.summary.overdue,
    exceptions: collection.summary.exceptions,
  };
  const updateOrder = (order: CustomerOrder, patch: OrderPoolUpdateInput, message: string) => {
    setSelected(order);
    updateMutation.mutate({id: order.id, patch, feedback: message});
  };
  const openDetails = (order: CustomerOrder) => {setSelected(order); setDetailOpen(true);};
  const claimOrder = (order: CustomerOrder) => updateOrder(order, {ownerId: session.user.id, ownerName: session.user.displayName}, "已认领，订单进入你的待办");
  const assignOrder = (order: CustomerOrder, ownerId: string) => {
    const owner = collaboratorOptions.find((option) => option.id === ownerId);
    if (owner) updateOrder(order, {ownerId: owner.id, ownerName: owner.displayName}, `已转交给${owner.displayName}`);
  };
  const releaseOrder = (order: CustomerOrder) => updateOrder(order, {ownerId: null, ownerName: null}, "订单已回到待认领队列");
  const pauseOrder = (order: CustomerOrder) => updateOrder(order, {mainStage: "暂停"}, "订单已暂停，仍保留在协同主线");
  const resumeOrder = (order: CustomerOrder) => updateOrder(order, {mainStage: "跟进中"}, "订单已恢复跟进");
  const completeOrder = (order: CustomerOrder) => updateOrder(order, {mainStage: "已完成", blocker: null, nextAction: null, nextFollowUpAt: null}, "订单已标记完成");
  const quickStatus: QuickStatusItemData[] = [
    {icon: <Users className="h-4 w-4" />, label: "协同订单", value: `${collection.summary.total} 单`, description: "客户、同行和供应商共用订单主线", tone: "info", action: () => updateFilters({queue: "all"})},
    {icon: <CircleDot className="h-4 w-4" />, label: "待认领", value: `${collection.summary.pendingClaim} 单`, description: "进入共享队列后由成员认领", tone: collection.summary.pendingClaim ? "warning" : "success", action: () => updateFilters({queue: "unassigned"})},
    {icon: <CalendarClock className="h-4 w-4" />, label: "待客户", value: `${collection.summary.waitingCustomer} 单`, description: "等待客户确认或回复", tone: collection.summary.waitingCustomer ? "warning" : "neutral", action: () => updateFilters({queue: "waiting_customer"})},
    {icon: <AlertTriangle className="h-4 w-4" />, label: "异常", value: `${collection.summary.exceptions} 单`, description: "暂停、丢单、取消或售后中", tone: collection.summary.exceptions ? "danger" : "success", action: () => updateFilters({queue: "exceptions"})},
  ];
  const columns = useMemo<ColumnDef<CustomerOrder, unknown>[]>(() => [
    {
      id: "order",
      header: "订单 / 客户",
      accessorFn: (row) => `${row.orderNo} ${row.title} ${row.customerName}`,
      cell: ({row}) => <div className="min-w-[220px]"><p className="erp-data-number text-xs font-semibold text-[var(--erp-color-primary)]">{row.original.orderNo}</p><p className="mt-1 truncate font-semibold text-[var(--erp-color-text)]">{row.original.title}</p><p className="mt-1 truncate text-xs text-[var(--erp-color-text-secondary)]">{row.original.customerName}{row.original.contact ? ` · ${row.original.contact}` : ""}</p></div>,
    },
    {id: "type", header: "业务类型", accessorKey: "orderType", cell: ({row}) => <ErpStatusBadge label={row.original.orderType} tone={orderPoolTypeTone(row.original.orderType)} />},
    {
      id: "stage",
      header: "当前阶段",
      accessorKey: "mainStage",
      cell: ({row}) => <div className="flex min-w-[130px] flex-col items-start gap-1"><ErpStatusBadge label={row.original.mainStage} tone={orderPoolStageTone(row.original.mainStage)} />{row.original.blocker ? <span className="text-xs text-[var(--erp-color-warning)]">{row.original.blocker}</span> : <span className="text-xs text-[var(--erp-color-text-muted)]">无待办阻塞</span>}{isOrderPoolOverdue(row.original) && <span className="text-xs font-semibold text-[var(--erp-color-danger)]">跟进已逾期</span>}</div>,
    },
    {
      id: "people",
      header: "负责人 / 协作者",
      accessorFn: (row) => [row.ownerName, ...row.collaborators.map((item) => item.displayName)].filter(Boolean).join(" "),
      cell: ({row}) => <div className="min-w-[150px]"><p className="flex items-center gap-1 text-sm font-medium"><UserRound className="h-3.5 w-3.5 text-[var(--erp-color-text-muted)]" />{row.original.ownerName || "待认领"}</p>{row.original.collaborators.length ? <p className="mt-1 truncate text-xs text-[var(--erp-color-text-muted)]">协作：{row.original.collaborators.map((item) => item.displayName).join("、")}</p> : <p className="mt-1 text-xs text-[var(--erp-color-text-muted)]">暂无协作者</p>}</div>,
    },
    {
      id: "nextAction",
      header: "下一步",
      accessorKey: "nextAction",
      cell: ({row}) => <div className="min-w-[170px]"><p className="truncate text-sm text-[var(--erp-color-text-secondary)]">{row.original.nextAction || "待安排"}</p>{row.original.nextFollowUpAt ? <p className={`mt-1 text-xs ${isOrderPoolOverdue(row.original) ? "text-[var(--erp-color-danger)]" : "text-[var(--erp-color-text-muted)]"}`}>{formatDateTime(row.original.nextFollowUpAt)}</p> : null}</div>,
    },
    {id: "updatedAt", header: "最近更新", accessorKey: "updatedAt", cell: ({row}) => <span className="erp-data-number text-xs text-[var(--erp-color-text-muted)]">{formatDateTime(row.original.updatedAt)}</span>},
    {id: "action", header: "操作", cell: ({row}) => <div className="flex items-center justify-end gap-1" onClick={(event) => event.stopPropagation()}>
      {!row.original.ownerId && !row.original.ownerName ? <Button type="button" size="xs" variant="primary" onClick={() => claimOrder(row.original)} disabled={updateMutation.isPending}>我来跟进</Button> : row.original.mainStage !== "已完成" && row.original.ownerId === session.user.id ? <Button type="button" size="xs" variant="ghost" onClick={() => completeOrder(row.original)} disabled={updateMutation.isPending}>完成</Button> : null}
      <Button type="button" size="xs" variant="ghost" onClick={() => openDetails(row.original)}>查看</Button>
    </div>},
  ], [claimOrder, completeOrder, session.user.id, updateMutation.isPending]);
  return <ErpListPageFrame>
    <ErpPageHeader title="客户订单池" subtitle="把客户意向、销售、回收和置换放在一条协同主线上；业务单据只保存引用，金额和库存仍以原模块为准。" quickStatus={quickStatus} actions={<><Button type="button" size="sm" variant="secondary" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />刷新</Button><Button type="button" size="sm" variant="primary" onClick={() => {createMutation.reset(); setCreateOpen(true);}}><Plus className="h-4 w-4" />新建协同订单</Button></>} />
    <OrderPoolQueueBar active={filters.queue} counts={queueCounts} onChange={(queue) => updateFilters({queue})} />
    <MetricsRegion>
      <Metric label="待认领" value={`${collection.summary.pendingClaim} 单`} detail="共享队列中尚未分配负责人" icon={<CircleDot className="h-4 w-4" />} tone={collection.summary.pendingClaim ? "warning" : "neutral"} />
      <Metric label="跟进中" value={`${collection.summary.following} 单`} detail="已有负责人持续推进" icon={<Users className="h-4 w-4" />} tone="info" />
      <Metric label="待执行" value={`${collection.summary.pendingExecution} 单`} detail="报价、备货、收款或出库" icon={<ClipboardList className="h-4 w-4" />} tone={collection.summary.pendingExecution ? "warning" : "neutral"} />
      <Metric label="已完成" value={`${collection.summary.completed} 单`} detail="主线已闭环" icon={<CheckCircle2 className="h-4 w-4" />} tone="success" />
      <Metric label="异常订单" value={`${collection.summary.exceptions} 单`} detail="暂停 / 丢单 / 取消 / 售后" icon={<AlertTriangle className="h-4 w-4" />} tone={collection.summary.exceptions ? "danger" : "neutral"} />
    </MetricsRegion>
    <ErpPageToolbar><ErpFilterBar compact actions={<Button type="button" size="sm" variant="ghost" disabled={!activeFilterCount} onClick={() => commitFilters(defaultOrderPoolFilters)}><RotateCcw className="h-4 w-4" />重置</Button>}>
      <ErpSearchInput className="min-w-[260px] flex-1" density="compact" value={filters.keyword} onChange={(event) => updateFilters({keyword: event.target.value})} placeholder="搜索订单号、客户、联系人、下一步或备注" aria-label="搜索客户协同订单" />
      <Select size="sm" className="w-32" value={filters.orderType} onValueChange={(value) => updateFilters({orderType: value as OrderPoolFilters["orderType"]})} options={[{value: "all", label: "全部类型"}, ...orderPoolOrderTypeOptions]} aria-label="订单类型筛选" />
      <Select size="sm" className="w-36" value={filters.mainStage} onValueChange={(value) => updateFilters({mainStage: value as OrderPoolFilters["mainStage"]})} options={[{value: "all", label: "全部阶段"}, ...orderPoolStageOptions]} aria-label="订单阶段筛选" />
      <Select size="sm" className="w-40" value={filters.owner} onValueChange={(owner) => updateFilters({owner})} options={[{value: "", label: "全部协作者"}, ...owners]} aria-label="负责人或协作者筛选" />
    </ErpFilterBar></ErpPageToolbar>
    <ErpPageContent className="space-y-[var(--erp-page-gap)]">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--erp-color-text-muted)]"><span>{activeFilterCount ? `${activeFilterCount} 项筛选 · ` : ""}服务端返回 {collection.total} 条订单</span><ErpStatusBadge label="协同主线" tone="info" /></div>
      <MainRegion variant="70-30" className="lg:grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px]">
        <DashboardSection title="协同订单列表" description="主状态表达阶段，待办标签说明卡点；行内可直接认领或完成，点击订单查看完整协作上下文。" actions={<ErpStatusBadge label={`共 ${collection.total} 单`} tone="info" />}>
          <ErpDataTable columns={columns} data={items} getRowId={(row) => row.id} loading={query.isPending} fetching={query.isFetching} error={query.error as Error | null} errorTitle="订单池加载失败" emptyTitle="暂无协同订单" emptyDescription={activeFilterCount ? "请调整队列或筛选条件；也可以切换到全部订单查看共享队列。" : mineQueueEmpty ? "当前没有分配给你的订单，请切换“全部订单”或“待认领”查看共享队列。" : "点击右上角新建一条客户协同订单。"} onRetry={() => void query.refetch()} onRowClick={setSelected} page={collection.page} pageSize={collection.pageSize} total={collection.total} onPageChange={(page) => updateFilters({page})} onPageSizeChange={(pageSize) => updateFilters({page: 1, pageSize})} density="compact" stickyHeader ariaLabel="客户协同订单列表" />
        </DashboardSection>
        <OrderPoolSidePanel order={selected} session={session} collaboratorOptions={collaboratorOptions} collaboratorOptionsLoading={collaboratorQuery.isPending || collaboratorQuery.isFetching} pending={updateMutation.isPending} onClaim={claimOrder} onAssign={assignOrder} onRelease={releaseOrder} onPause={pauseOrder} onResume={resumeOrder} onComplete={completeOrder} onOpenDetails={() => {if (selected) openDetails(selected);}} />
      </MainRegion>
    </ErpPageContent>
    <OrderPoolDetailDrawer order={detailOpen ? selected : null} session={session} collaboratorOptions={collaboratorOptions} collaboratorOptionsLoading={collaboratorQuery.isPending || collaboratorQuery.isFetching} pending={updateMutation.isPending || noteMutation.isPending || linkMutation.isPending} onClose={() => setDetailOpen(false)} onAssign={(patch) => {if (selected) updateMutation.mutate({id: selected.id, patch});}} onSave={(patch) => {if (selected) updateMutation.mutate({id: selected.id, patch});}} onAddNote={(content) => {if (selected) noteMutation.mutate({id: selected.id, content});}} onLink={(input) => {if (selected) linkMutation.mutate({id: selected.id, input});}} />
    <CreateOrderDrawer open={createOpen} session={session} collaboratorOptions={collaboratorOptions} collaboratorOptionsLoading={collaboratorQuery.isPending || collaboratorQuery.isFetching} pending={createMutation.isPending} error={createMutation.error instanceof Error ? createMutation.error.message : undefined} onClose={() => setCreateOpen(false)} onSubmit={(input) => createMutation.mutate(input)} />
  </ErpListPageFrame>;
}

function OrderPoolQueueBar({active, counts, onChange}: {active: OrderPoolQueue; counts: Record<OrderPoolQueue, number>; onChange: (queue: OrderPoolQueue) => void}) {
  return <section data-erp-component="order-pool-queues" className="erp-card-surface min-w-0 border p-2.5 sm:p-3" aria-label="订单工作队列">
    <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2" role="tablist" aria-label="订单工作队列">
      {orderPoolQueueOptions.map((option) => {
        const selected = active === option.value;
        return <Button key={option.value} type="button" size="sm" variant={selected ? "primary" : "ghost"} aria-selected={selected} role="tab" onClick={() => onChange(option.value)} title={`查看${option.label}（${counts[option.value]}单）`}>
          <span>{option.label}</span><span className="erp-data-number text-xs tabular-nums opacity-80">{counts[option.value]}</span>
        </Button>;
      })}
    </div>
    <p className="mt-2 text-xs text-[var(--erp-color-text-muted)]">队列只改变当前视图，不会改变订单阶段；所有成员看到同一条协作主线。</p>
  </section>;
}

function OrderPoolSidePanel({order, session, collaboratorOptions, collaboratorOptionsLoading, pending, onClaim, onAssign, onRelease, onPause, onResume, onComplete, onOpenDetails}: {order: CustomerOrder | null; session: AuthSession; collaboratorOptions: OrderPoolCollaboratorOption[]; collaboratorOptionsLoading: boolean; pending: boolean; onClaim: (order: CustomerOrder) => void; onAssign: (order: CustomerOrder, ownerId: string) => void; onRelease: (order: CustomerOrder) => void; onPause: (order: CustomerOrder) => void; onResume: (order: CustomerOrder) => void; onComplete: (order: CustomerOrder) => void; onOpenDetails: () => void}) {
  const ownedByMe = Boolean(order && (order.ownerId === session.user.id || order.ownerName === session.user.displayName));
  const ownerOptions = order ? orderPoolOwnerOptions(order, collaboratorOptions) : [];
  return <DashboardSection title="当前协作" description="选中订单后在这里处理最常用的跟单动作。" actions={order ? <ErpStatusBadge label={order.orderType} tone={orderPoolTypeTone(order.orderType)} /> : undefined}>
    {!order ? <div className="flex min-h-[190px] flex-col items-center justify-center rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] px-4 text-center"><Users className="h-7 w-7 text-[var(--erp-color-text-muted)]" /><p className="mt-3 text-sm font-semibold text-[var(--erp-color-text-secondary)]">选择一条订单开始协作</p><p className="mt-1 text-xs text-[var(--erp-color-text-muted)]">列表点击只打开预览，编辑和时间线在“查看详情”中进行。</p></div> : <div className="space-y-4">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="erp-data-number text-xs font-semibold text-[var(--erp-color-primary)]">{order.orderNo}</p><p className="mt-1 truncate text-base font-semibold text-[var(--erp-color-text)]">{order.title}</p><p className="mt-1 truncate text-xs text-[var(--erp-color-text-secondary)]">{order.customerName}{order.contact ? ` · ${order.contact}` : ""}</p></div><ErpStatusBadge label={order.mainStage} tone={orderPoolStageTone(order.mainStage)} /></div>
      <div className="flex flex-wrap gap-1.5">{order.blocker ? <ErpStatusBadge label={order.blocker} tone="warning" /> : <ErpStatusBadge label="无待办阻塞" tone="neutral" />}{order.priority !== "normal" && <ErpStatusBadge label={priorityLabel(order.priority)} tone={order.priority === "urgent" ? "danger" : "info"} />}{isOrderPoolOverdue(order) && <ErpStatusBadge label="跟进已逾期" tone="danger" />}{isOrderPoolDueToday(order) && !isOrderPoolOverdue(order) && <ErpStatusBadge label="今日到期" tone="warning" />}</div>
      <div className="rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] p-3"><p className="text-xs font-semibold text-[var(--erp-color-text-muted)]">下一步动作</p><p className="mt-1 text-sm font-semibold text-[var(--erp-color-text)]">{order.nextAction || "待安排下一步"}</p><p className={`mt-1 text-xs ${isOrderPoolOverdue(order) ? "font-semibold text-[var(--erp-color-danger)]" : "text-[var(--erp-color-text-muted)]"}`}>{order.nextFollowUpAt ? `截止 ${formatDateTime(order.nextFollowUpAt)}` : "尚未设置跟进时间"}</p></div>
      <div className="grid grid-cols-2 gap-2"><div className="col-span-2 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3"><p className="text-xs text-[var(--erp-color-text-muted)]">负责人</p><Select size="sm" className="mt-1.5" value={orderPoolOwnerValue(order)} options={ownerOptions} onValueChange={(value) => {if (value === "__unassigned") onRelease(order); else if (value !== "__current_owner__" && value !== order.ownerId) onAssign(order, value);}} disabled={pending || collaboratorOptionsLoading} aria-label="订单负责人" /></div><Fact label="协作者" value={order.collaborators.length ? order.collaborators.map((item) => item.displayName).join("、") : "暂无"} /><Fact label="关联单据" value={`${order.linkedDocuments.length} 条`} /><Fact label="最近更新" value={formatDateTime(order.updatedAt)} /></div>
      <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant={order.ownerId || order.ownerName ? "secondary" : "primary"} onClick={() => (order.ownerId || order.ownerName) ? onRelease(order) : onClaim(order)} disabled={pending}>{order.ownerId || order.ownerName ? "转为待认领" : "我来跟进"}</Button>{ownedByMe && order.mainStage !== "已完成" ? <Button type="button" size="sm" variant="primary" onClick={() => onComplete(order)} disabled={pending}>完成订单</Button> : null}{order.mainStage === "暂停" ? <Button type="button" size="sm" variant="ghost" onClick={() => onResume(order)} disabled={pending}>恢复跟进</Button> : order.mainStage !== "已完成" ? <Button type="button" size="sm" variant="ghost" onClick={() => onPause(order)} disabled={pending}>暂停</Button> : null}<Button type="button" size="sm" variant="ghost" onClick={onOpenDetails}>查看详情</Button></div>
      <p className="text-xs text-[var(--erp-color-text-muted)]">详情中可编辑阶段、待办、协作者、备注并补充跟进记录。</p>
    </div>}
  </DashboardSection>;
}

function Metric({label, value, detail, icon, tone}: {label: string; value: string; detail: string; icon: ReactNode; tone: "neutral" | "info" | "success" | "warning" | "danger"}) {
  return <ErpMetricCard label={label} value={value} detail={detail} icon={icon} tone={tone} valueTone={tone} variant="compact" />;
}

function OrderPoolDetailDrawer({order, session, collaboratorOptions, collaboratorOptionsLoading, pending, onClose, onAssign, onSave, onAddNote, onLink}: {order: CustomerOrder | null; session: AuthSession; collaboratorOptions: OrderPoolCollaboratorOption[]; collaboratorOptionsLoading: boolean; pending: boolean; onClose: () => void; onAssign: (patch: OrderPoolUpdateInput) => void; onSave: (patch: OrderPoolUpdateInput) => void; onAddNote: (content: string) => void; onLink: (input: OrderPoolDocumentLinkInput) => void}) {
  const [stage, setStage] = useState<OrderPoolStage>(order?.mainStage || "待接单");
  const [blocker, setBlocker] = useState<OrderPoolBlocker | "">(order?.blocker || "");
  const [priority, setPriority] = useState<OrderPoolPriority>(order?.priority || "normal");
  const [nextAction, setNextAction] = useState(order?.nextAction || "");
  const [nextFollowUpAt, setNextFollowUpAt] = useState(toDateTimeInput(order?.nextFollowUpAt));
  const [remarks, setRemarks] = useState(order?.remarks || "");
  const [collaboratorIds, setCollaboratorIds] = useState("");
  const [note, setNote] = useState("");
  const [documentType, setDocumentType] = useState<OrderPoolDocumentLinkInput["type"]>("sales");
  const [documentId, setDocumentId] = useState("");
  const [documentLabel, setDocumentLabel] = useState("");
  useEffect(() => {
    if (!order) return;
    setStage(order.mainStage); setBlocker(order.blocker || ""); setPriority(order.priority); setNextAction(order.nextAction || ""); setNextFollowUpAt(toDateTimeInput(order.nextFollowUpAt)); setRemarks(order.remarks || ""); setCollaboratorIds(order.collaborators.map((item) => item.userId).filter(Boolean).join(", ")); setNote(""); setDocumentId(""); setDocumentLabel("");
  }, [order?.id, order?.updatedAt]);
  const save = () => onSave({mainStage: stage, blocker: blocker || null, priority, nextAction: nextAction.trim() || null, nextFollowUpAt: nextFollowUpAt || null, remarks: remarks.trim() || null, collaboratorIds: collaboratorIds.split(/[，,\s]+/).map((value) => value.trim()).filter(Boolean)});
  const claim = () => onSave({ownerId: session.user.id, ownerName: session.user.displayName});
  const unassign = () => onSave({ownerId: null, ownerName: null});
  const submitNote = (event: FormEvent<HTMLFormElement>) => {event.preventDefault(); const content = note.trim(); if (content) {onAddNote(content); setNote("");}};
  const submitLink = (event: FormEvent<HTMLFormElement>) => {event.preventDefault(); const id = documentId.trim(); if (id) {onLink({type: documentType, id, label: documentLabel.trim() || undefined}); setDocumentId(""); setDocumentLabel("");}};
  const ownerOptions = order ? orderPoolOwnerOptions(order, collaboratorOptions) : [];
  return <ErpDetailDrawer resizable drawerKey="order-pool-detail" defaultWidth={760} minWidth={600} maxWidth={960} open={Boolean(order)} onOpenChange={(open) => {if (!open) onClose();}} title={order?.orderNo || "订单详情"} description={order ? `${order.title} · ${order.customerName}` : undefined} footer={order && <div className="flex flex-wrap justify-end gap-2"><Button type="button" size="sm" variant="secondary" onClick={order.ownerId || order.ownerName ? unassign : claim} disabled={pending}>{order.ownerId || order.ownerName ? "转为待认领" : "我来跟进"}</Button><Button type="button" size="sm" variant="primary" onClick={save} disabled={pending}>{pending ? "保存中…" : "保存订单"}</Button></div>}>
    {order ? <div className="space-y-5">
      <div className="flex flex-wrap gap-2"><ErpStatusBadge label={order.orderType} tone={orderPoolTypeTone(order.orderType)} /><ErpStatusBadge label={order.mainStage} tone={orderPoolStageTone(order.mainStage)} />{order.blocker && <ErpStatusBadge label={order.blocker} tone="warning" />}{order.priority !== "normal" && <ErpStatusBadge label={priorityLabel(order.priority)} tone={order.priority === "urgent" ? "danger" : "info"} />}</div>
      <div className="grid gap-3 sm:grid-cols-2"><Fact label="客户 / 同行" value={order.customerName} /><Fact label="联系方式" value={order.contact || "未记录"} /><Fact label="负责人" value={order.ownerName || "待认领"} /><Fact label="创建时间" value={formatDateTime(order.createdAt)} /><Fact label="创建人" value={order.createdBy} /><Fact label="关联单据" value={`${order.linkedDocuments.length} 条`} /></div>
      <DashboardSection title="协同状态" description="只改订单池协同上下文，不直接改销售、采购或库存事实。"><div className="grid gap-3 sm:grid-cols-2"><Field label="主状态"><Select value={stage} options={orderPoolStageOptions} onValueChange={(value) => setStage(value as OrderPoolStage)} aria-label="订单主状态" /></Field><Field label="负责人"><Select value={orderPoolOwnerValue(order)} options={ownerOptions} onValueChange={(value) => {if (value === "__unassigned") onAssign({ownerId: null, ownerName: null}); else if (value !== "__current_owner__") {const owner = collaboratorOptions.find((option) => option.id === value); if (owner) onAssign({ownerId: owner.id, ownerName: owner.displayName});}}} disabled={pending || collaboratorOptionsLoading} aria-label="订单负责人" /></Field><Field label="当前待办"><Select value={blocker || "none"} options={blockerOptions} onValueChange={(value) => setBlocker(value === "none" ? "" : value as OrderPoolBlocker)} aria-label="订单待办标签" /></Field><Field label="优先级"><Select value={priority} options={priorityOptions} onValueChange={(value) => setPriority(value as OrderPoolPriority)} aria-label="订单优先级" /></Field><Field label="下次跟进"><ErpDateTimePicker value={nextFollowUpAt} onChange={setNextFollowUpAt} aria-label="下次跟进时间" /></Field></div><Field label="下一步动作" className="mt-3"><Input value={nextAction} onChange={(event) => setNextAction(event.target.value)} placeholder="例如：确认显卡型号和预算" aria-label="下一步动作" /></Field><div className="mt-3"><span className="mb-1.5 block text-xs font-semibold text-[var(--erp-color-text-secondary)]">协作者（可选）</span><CollaboratorPicker value={collaboratorIds} onChange={setCollaboratorIds} options={collaboratorOptions} excludeId={order?.ownerId} loading={collaboratorOptionsLoading} disabled={pending} /></div><Field label="备注" className="mt-3"><Textarea rows={3} value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="记录对订单推进有帮助的背景信息" aria-label="订单备注" /></Field></DashboardSection>
      <DashboardSection title="关联业务单据" description="可关联多张报价、销售、采购、检测、收付款和售后单。"><div className="space-y-2">{order.linkedDocuments.length ? order.linkedDocuments.map((link) => <div key={`${link.type}-${link.id}`} className="flex items-center justify-between gap-3 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] px-3 py-2 text-sm"><span className="min-w-0 truncate"><span className="mr-2 text-xs text-[var(--erp-color-text-muted)]">{documentTypeLabels[link.type] || link.type}</span><span className="erp-data-number text-[var(--erp-color-primary)]">{link.id}</span>{link.label ? <span className="ml-2 text-xs text-[var(--erp-color-text-secondary)]">{link.label}</span> : null}</span><Link2 className="h-4 w-4 shrink-0 text-[var(--erp-color-text-muted)]" /></div>) : <p className="text-sm text-[var(--erp-color-text-muted)]">暂无关联单据</p>}</div><form className="mt-3 grid gap-2 sm:grid-cols-[130px_minmax(0,1fr)]" onSubmit={submitLink}><Select value={documentType} options={documentTypeOptions} onValueChange={(value) => setDocumentType(value as OrderPoolDocumentLinkInput["type"])} aria-label="关联单据类型" /><Input value={documentId} onChange={(event) => setDocumentId(event.target.value)} placeholder="单据编号" aria-label="关联单据编号" required /><Input className="sm:col-span-2" value={documentLabel} onChange={(event) => setDocumentLabel(event.target.value)} placeholder="单据说明（可选）" aria-label="关联单据说明" /><Button className="sm:col-span-2" type="submit" size="sm" variant="secondary" disabled={pending || !documentId.trim()}><Link2 className="h-4 w-4" />关联单据</Button></form></DashboardSection>
      <DashboardSection title="跟进时间线" description="所有协作者看到同一条事件记录。"><div className="space-y-3">{order.events.length ? order.events.map((event) => <div key={event.id} className="flex gap-3"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--erp-color-primary)]" /><div className="min-w-0 flex-1 border-b border-[var(--erp-color-border)] pb-3 last:border-0"><p className="whitespace-pre-wrap text-sm text-[var(--erp-color-text-secondary)]">{event.content}</p><p className="mt-1 erp-data-number text-xs text-[var(--erp-color-text-muted)]">{event.actor} · {formatDateTime(event.occurredAt)}</p></div></div>) : <p className="text-sm text-[var(--erp-color-text-muted)]">暂无跟进记录</p>}</div><form className="mt-4 space-y-2" onSubmit={submitNote}><Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="记录客户回复、内部交接或下一步安排" aria-label="新增跟进记录" required /><Button type="submit" size="sm" variant="secondary" disabled={pending || !note.trim()}><MessageSquarePlus className="h-4 w-4" />添加跟进</Button></form></DashboardSection>
    </div> : null}
  </ErpDetailDrawer>;
}

function CreateOrderDrawer({open, session, collaboratorOptions, collaboratorOptionsLoading, pending, error, onClose, onSubmit}: {open: boolean; session: AuthSession; collaboratorOptions: OrderPoolCollaboratorOption[]; collaboratorOptionsLoading: boolean; pending: boolean; error?: string; onClose: () => void; onSubmit: (input: OrderPoolCreateInput) => void}) {
  const [orderType, setOrderType] = useState<OrderPoolOrderType>("销售");
  const [partyType, setPartyType] = useState<OrderPoolCreateInput["partyType"]>("customer");
  const [title, setTitle] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [contact, setContact] = useState("");
  const [mainStage, setMainStage] = useState<OrderPoolStage>("待接单");
  const [blocker, setBlocker] = useState<OrderPoolBlocker>("待报价");
  const [priority, setPriority] = useState<OrderPoolPriority>("normal");
  const [nextAction, setNextAction] = useState("");
  const [nextFollowUpAt, setNextFollowUpAt] = useState("");
  const [collaboratorIds, setCollaboratorIds] = useState("");
  const [remarks, setRemarks] = useState("");
  useEffect(() => {if (open) {setOrderType("销售"); setPartyType("customer"); setTitle(""); setCustomerName(""); setContact(""); setMainStage("待接单"); setBlocker("待报价"); setPriority("normal"); setNextAction(""); setNextFollowUpAt(""); setCollaboratorIds(""); setRemarks("");}}, [open]);
  const submit = (event: FormEvent<HTMLFormElement>) => {event.preventDefault(); onSubmit({title: title.trim() || undefined, orderType, partyType, customerName: customerName.trim(), contact: contact.trim() || undefined, mainStage, blocker, priority, ownerId: session.user.id, ownerName: session.user.displayName, collaboratorIds: collaboratorIds.split(/[，,\s]+/).map((value) => value.trim()).filter(Boolean), nextAction: nextAction.trim() || undefined, nextFollowUpAt: nextFollowUpAt || undefined, remarks: remarks.trim() || undefined});};
  return <ErpDetailDrawer open={open} onOpenChange={(nextOpen) => {if (!nextOpen && !pending) onClose();}} title="新建客户协同订单" description="先建立一条共享主线，后续再关联报价、销售、回收、检测和收付款单据。" footer={<div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose} disabled={pending}>取消</Button><Button type="submit" form="order-pool-create-form" variant="primary" disabled={pending || !customerName.trim()}>{pending ? "创建中…" : "创建订单"}</Button></div>}>
    <form id="order-pool-create-form" className="space-y-5" onSubmit={submit}><DashboardSection title="订单基础信息"><div className="grid gap-3 sm:grid-cols-2"><Field label="业务类型"><Select value={orderType} options={orderPoolOrderTypeOptions} onValueChange={(value) => {const nextType = value as OrderPoolOrderType; setOrderType(nextType); setBlocker(orderPoolOrderTypeDefaultBlocker(nextType));}} aria-label="业务类型" /></Field><Field label="关联主体"><Select value={partyType || "customer"} options={partyTypeOptions} onValueChange={(value) => setPartyType(value as OrderPoolCreateInput["partyType"])} aria-label="关联主体类型" /></Field></div><Field label="客户 / 同行名称" className="mt-3"><Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="例如：张三 / 成都某电子" required aria-label="客户或同行名称" /></Field><Field label="联系方式" className="mt-3"><Input value={contact} onChange={(event) => setContact(event.target.value)} placeholder="电话、微信或其他联系方式" aria-label="联系方式" /></Field><Field label="订单标题（可选）" className="mt-3"><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="不填写时自动使用客户名称和业务类型" aria-label="订单标题" /></Field></DashboardSection><DashboardSection title="协同安排"><div className="grid gap-3 sm:grid-cols-2"><Field label="主状态"><Select value={mainStage} options={orderPoolMainStageOptions} onValueChange={(value) => setMainStage(value as OrderPoolStage)} aria-label="主状态" /></Field><Field label="当前待办"><Select value={blocker} options={orderPoolBlockerOptions} onValueChange={(value) => setBlocker(value as OrderPoolBlocker)} aria-label="当前待办" /></Field><Field label="优先级"><Select value={priority} options={priorityOptions} onValueChange={(value) => setPriority(value as OrderPoolPriority)} aria-label="订单优先级" /></Field><Field label="下次跟进"><ErpDateTimePicker value={nextFollowUpAt} onChange={setNextFollowUpAt} aria-label="下次跟进时间" /></Field></div><Field label="下一步动作" className="mt-3"><Input value={nextAction} onChange={(event) => setNextAction(event.target.value)} placeholder="例如：确认预算后发送报价" aria-label="下一步动作" /></Field><div className="mt-3"><span className="mb-1.5 block text-xs font-semibold text-[var(--erp-color-text-secondary)]">协作者（可选）</span><CollaboratorPicker value={collaboratorIds} onChange={setCollaboratorIds} options={collaboratorOptions} excludeId={session.user.id} loading={collaboratorOptionsLoading} disabled={pending} /></div><Field label="备注" className="mt-3"><Textarea rows={4} value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="记录客户需求、置换条件或内部交接说明" aria-label="订单备注" /></Field></DashboardSection>{error && <p role="alert" className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] p-3 text-xs text-[var(--erp-color-danger)]">{error}</p>}</form>
  </ErpDetailDrawer>;
}

function CollaboratorPicker({value, onChange, options, excludeId, loading, disabled}: {value: string; onChange: (value: string) => void; options: OrderPoolCollaboratorOption[]; excludeId?: string; loading: boolean; disabled?: boolean}) {
  const selectedIds = value.split(/[，,\s]+/).map((item) => item.trim()).filter(Boolean);
  const selected = new Set(selectedIds);
  const knownIds = new Set(options.map((option) => option.id));
  const unknownSelected = selectedIds.filter((id) => !knownIds.has(id));
  const visibleOptions = [
    ...options.filter((option) => option.id !== excludeId),
    ...unknownSelected.map((id) => ({id, displayName: id, role: "历史账号"})),
  ];
  const toggle = (id: string) => {
    const next = selected.has(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id];
    onChange(next.join(", "));
  };
  return <div className="rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] p-3">
    {loading ? <p className="text-xs text-[var(--erp-color-text-muted)]">正在加载可协作成员…</p> : visibleOptions.length ? <div className="grid gap-2 sm:grid-cols-2">
      {visibleOptions.map((option) => <label key={option.id} className="flex min-w-0 cursor-pointer items-center gap-2 rounded-[var(--erp-radius-sm)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-2.5 py-2 text-xs">
        <input type="checkbox" checked={selected.has(option.id)} onChange={() => toggle(option.id)} disabled={disabled} className="h-4 w-4 shrink-0 accent-[var(--erp-color-primary)]" />
        <span className="min-w-0 truncate font-semibold text-[var(--erp-color-text)]">{option.displayName}</span>
        <span className="ml-auto shrink-0 text-xs text-[var(--erp-color-text-muted)]">{option.role}</span>
      </label>)}
    </div> : <p className="text-xs text-[var(--erp-color-text-muted)]">暂无可协作成员；稍后刷新可重新获取成员列表。</p>}
    <p className="mt-2 text-xs text-[var(--erp-color-text-muted)]">可多选成员；负责人不重复计入协作者。</p>
  </div>;
}

// Reuse the shared field contract so labels, ids and spacing stay consistent.
const Field = ErpField;
const Fact = ErpDetailFact;
function orderPoolOwnerValue(order: Pick<CustomerOrder, "ownerId" | "ownerName">) {return order.ownerId || (order.ownerName ? "__current_owner__" : "__unassigned");}
function orderPoolOwnerOptions(order: Pick<CustomerOrder, "ownerId" | "ownerName">, options: OrderPoolCollaboratorOption[]) {
  return [
    {value: "__unassigned", label: "待认领"},
    ...(!order.ownerId && order.ownerName ? [{value: "__current_owner__", label: `${order.ownerName}（当前）`}] : []),
    ...(order.ownerId && !options.some((option) => option.id === order.ownerId) ? [{value: order.ownerId, label: order.ownerName || order.ownerId}] : []),
    ...options.map((option) => ({value: option.id, label: option.displayName})),
  ];
}
function formatDateTime(value: string | undefined) {return formatStoreDateTime(value);}
function toDateTimeInput(value: string | undefined) {return value ? value.replace(" ", "T").slice(0, 16) : "";}
function priorityLabel(value: OrderPoolPriority) {return priorityOptions.find((item) => item.value === value)?.label || value;}
