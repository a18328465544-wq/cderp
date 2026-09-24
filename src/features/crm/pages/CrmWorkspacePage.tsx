import {keepPreviousData, useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useNavigate} from "@tanstack/react-router";
import {Activity, CalendarClock, ListFilter, LockKeyhole, MessageSquarePlus, RefreshCw, RotateCcw, SlidersHorizontal, Sparkles, Target, UserPlus, Users} from "lucide-react";
import {ErpSearchInput} from "@/src/components/common";
import {useEffect, useMemo, useState, type ReactNode} from "react";
import {notify} from "@/src/utils/notification";
import {Button, Card, Select} from "@/src/components/ui";
import {ErpColumnVisibilityMenu, DashboardSection, ErpCrmPageFrame, ErpDataTable, ErpDetailDrawer, ErpDetailFact, ErpDetailFactGrid, ErpEmptyState, ErpFilterBar, ErpLoadingState, ErpMetricCard, ErpPageContent, ErpPageError, ErpPageHeader, ErpPageToolbar, ErpStatusBadge, ErpTableResultsBar, MetricsRegion, type QuickStatusItemData} from "@/src/components/common";
import {ApiError, crmApi, queryKeys, type AuthSession} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import {useTablePreferences} from "@/src/hooks/useTablePreferences";
import {useUrlSearchState} from "@/src/hooks/useUrlSearchState";
import {formatCurrency} from "@/src/lib/format";
import {formatStoreDateTime} from "@/src/utils/storeTime";
import type {CrmAccount, CrmFollowUpFormValues, CrmTimelineEvent} from "@/src/types/crm";
import {createCrmColumns} from "../crm.columns";
import {crmFiltersToSearch, defaultCrmFilters, parseCrmFilters} from "../crm.filters";
import {CrmFollowUpDialog} from "../components/CrmFollowUpDialog";

function useCrmUrlState() {
  return useUrlSearchState({defaultValue: defaultCrmFilters, parse: parseCrmFilters, serialize: crmFiltersToSearch});
}

export function CrmWorkspacePage() {
  const {session, logout} = useAuth();
  const canAccess = createCapabilities(session).menu("crm");
  if (!session) return <Card><ErpLoadingState title="正在验证客户 CRM 权限" />;</Card>;
  if (!canAccess) return <ErpPageError title="当前账号没有客户 CRM 权限" description="服务器已拒绝 crm 菜单访问（403），请联系管理员授权。" />;
  return <CrmWorkspaceContent session={session} onAuthExpired={logout} />;
}

function CrmWorkspaceContent({session, onAuthExpired}: {session: AuthSession; onAuthExpired: () => void}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {value: filters, commit} = useCrmUrlState();
  const [detail, setDetail] = useState<CrmAccount | null>(null);
  const [followUp, setFollowUp] = useState<CrmAccount | null>(null);
  const {columnVisibility, setColumnVisibility, density, setDensity} = useTablePreferences<Record<string, boolean>>({feature: "crm", userId: session.user.id, defaultVisibility: {}, defaultDensity: "comfortable"});
  const accountQuery = useQuery({queryKey: queryKeys.crm.accounts(filters), queryFn: ({signal}) => crmApi.accounts(filters, signal), placeholderData: keepPreviousData, retry: false});
  const summaryFilters = {keyword: filters.keyword, owner: filters.owner};
  const summaryQuery = useQuery({queryKey: queryKeys.crm.summary(summaryFilters), queryFn: ({signal}) => crmApi.summary(summaryFilters, signal), placeholderData: keepPreviousData, retry: false});
  const timelineQuery = useQuery({queryKey: queryKeys.crm.timeline(detail?.id || ""), queryFn: ({signal}) => crmApi.timeline(detail!.id, signal), enabled: Boolean(detail?.id), retry: false});
  const followUpMutation = useMutation({mutationFn: (values: CrmFollowUpFormValues) => crmApi.createFollowUp(values), onSuccess: async () => {notify.success("客户跟进已保存"); setFollowUp(null); await queryClient.invalidateQueries({queryKey: queryKeys.crm.all()});}, onError: (error: Error) => {if (error instanceof ApiError && error.isUnauthorized) {onAuthExpired();} else notify.error(error.message);}});
  useEffect(() => {const error = accountQuery.error || summaryQuery.error || timelineQuery.error; if (error instanceof ApiError && error.isUnauthorized) onAuthExpired();}, [accountQuery.error, onAuthExpired, summaryQuery.error, timelineQuery.error]);

  const columns = useMemo(() => createCrmColumns({onDetail: setDetail, onFollowUp: setFollowUp}), []);
  const accounts = accountQuery.data?.items || [];
  const owners = useMemo(() => Array.from(new Set([...(summaryQuery.data?.owners.map((item) => item.owner) || []), ...accounts.map((item) => item.owner).filter((item): item is string => Boolean(item))])).sort((a, b) => a.localeCompare(b, "zh-CN")), [accounts, summaryQuery.data?.owners]);
  const totals = summaryQuery.data?.totals;
  const quickStatus: QuickStatusItemData[] = [
    {icon: <Users className="h-4 w-4" />, label: "客户主体", value: `${accountQuery.data?.total || 0} 位`, description: "可直接打开客户档案", tone: "success"},
    {icon: <Activity className="h-4 w-4" />, label: "客户轨迹", value: "可查看", description: "点击客户加载时间线", tone: "info"},
    {icon: <LockKeyhole className="h-4 w-4" />, label: "等级规则", value: "核心客户", description: "核心客户固定 S 级", tone: "success"},
    {icon: <ListFilter className="h-4 w-4" />, label: "筛选能力", value: "关键词 / 负责人", description: "快速定位目标客户", tone: "info"},
  ];
  const refresh = async () => {await Promise.all([accountQuery.refetch(), summaryQuery.refetch(), detail ? timelineQuery.refetch() : Promise.resolve()]);};
  const activeFilters = Number(Boolean(filters.keyword.trim())) + Number(Boolean(filters.owner));
  return <ErpCrmPageFrame>
    <ErpPageHeader title="客户 CRM" subtitle="统一查看客户主体、跟进计划和真实业务时间线；列表走关系化 SQL 分页。" quickStatus={quickStatus} actions={<><Button type="button" size="sm" variant="secondary" onClick={() => void refresh()} disabled={accountQuery.isFetching || summaryQuery.isFetching}><RefreshCw className={`h-4 w-4 ${accountQuery.isFetching || summaryQuery.isFetching ? "animate-spin" : ""}`} />刷新</Button><Button type="button" size="sm" variant="primary" onClick={() => void navigate({to: "/crm/customers/new"})}><UserPlus className="h-4 w-4" />新增客户线索</Button></>} />
    <MetricsRegion><MetricCard label="客户总数" value={totals ? `${totals.customers} 位` : "—"} detail="按当前负责人和名称条件" icon={<Users className="h-4 w-4" />} /><MetricCard label="到期跟进" value={totals ? `${totals.pendingFollowUps} 项` : "—"} detail="下次跟进时间不晚于今日" icon={<CalendarClock className="h-4 w-4" />} tone={totals?.pendingFollowUps ? "warning" : "normal"} /><MetricCard label="高意向客户" value={totals ? `${totals.highIntent} 位` : "—"} detail="沿用原 CRM 意向字段" icon={<Target className="h-4 w-4" />} /><MetricCard label="已成交客户" value={totals ? `${totals.deals} 位` : "—"} detail={totals ? `跟进中 ${totals.following} · 线索 ${totals.leads}` : "真实汇总加载中"} icon={<Sparkles className="h-4 w-4" />} tone="success" /></MetricsRegion>
    <ErpPageToolbar><ErpFilterBar actions={<Button type="button" size="sm" variant="ghost" onClick={() => commit(defaultCrmFilters)}><RotateCcw className="h-4 w-4" />重置</Button>}><ErpSearchInput className="min-w-64 flex-1" value={filters.keyword} onChange={(event) => commit({...filters, keyword: event.target.value, page: 1})} placeholder="搜索客户、电话、微信、城市或公司" aria-label="搜索客户" /><Select className="w-40" value={filters.owner} onValueChange={(owner) => commit({...filters, owner, page: 1})} options={[{value: "", label: "全部负责人"}, ...owners.map((owner) => ({value: owner, label: owner}))]} placeholder="全部负责人" aria-label="筛选负责人" /></ErpFilterBar></ErpPageToolbar>
    <ErpPageContent className="space-y-[var(--erp-page-gap)]">
    <ErpTableResultsBar summary={<span className="flex flex-wrap items-center gap-2 text-[var(--erp-color-text-muted)]"><SlidersHorizontal className="h-3.5 w-3.5" /><ErpStatusBadge label={activeFilters ? `${activeFilters} 项筛选` : "全部客户"} tone={activeFilters ? "info" : "neutral"} /><span>共 {accountQuery.data?.total || 0} 条</span></span>} actions={<><ErpColumnVisibilityMenu columns={columns} visibility={columnVisibility} onVisibilityChange={setColumnVisibility} /><div className="inline-flex rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-0.5"><Button type="button" size="sm" variant={density === "comfortable" ? "secondary" : "ghost"} onClick={() => setDensity("comfortable")}>舒适</Button><Button type="button" size="sm" variant={density === "compact" ? "secondary" : "ghost"} onClick={() => setDensity("compact")}>紧凑</Button></div></>} />
    <DashboardSection title="客户池" actions={<ErpStatusBadge label={`共 ${accountQuery.data?.total || 0} 条`} tone="info" />}><ErpDataTable ariaLabel="CRM 客户池" columns={columns} data={accounts} getRowId={(row) => row.id} loading={accountQuery.isPending} fetching={accountQuery.isFetching} error={accountQuery.error as Error | null} errorTitle="客户列表加载失败" emptyTitle="暂无匹配客户" emptyDescription={activeFilters ? "请调整关键词或负责人筛选。" : "当前 CRM 尚无客户主体。"} onRetry={() => void accountQuery.refetch()} onRowClick={setDetail} page={filters.page} pageSize={filters.pageSize} total={accountQuery.data?.total} onPageChange={(page) => commit({...filters, page})} onPageSizeChange={(pageSize) => commit({...filters, page: 1, pageSize})} columnVisibility={columnVisibility} onColumnVisibilityChange={setColumnVisibility} enableColumnResizing density={density} stickyHeader /></DashboardSection>
    <CrmDetailDrawer account={detail} events={timelineQuery.data?.items || []} loading={timelineQuery.isPending} error={timelineQuery.error as Error | null} onRetry={() => void timelineQuery.refetch()} onClose={() => setDetail(null)} onFollowUp={() => {if (detail) setFollowUp(detail);}} />
    <CrmFollowUpDialog account={followUp} pending={followUpMutation.isPending} error={followUpMutation.error instanceof Error ? followUpMutation.error.message : undefined} onOpenChange={(open) => {if (!open) {setFollowUp(null); followUpMutation.reset();}}} onSubmit={async (values) => {await followUpMutation.mutateAsync(values);}} />
    </ErpPageContent>
  </ErpCrmPageFrame>;
}

function CrmDetailDrawer({account, events, loading, error, onRetry, onClose, onFollowUp}: {account: CrmAccount | null; events: CrmTimelineEvent[]; loading: boolean; error: Error | null; onRetry: () => void; onClose: () => void; onFollowUp: () => void}) {
  return <ErpDetailDrawer modal={false} resizable drawerKey="crm-detail" defaultWidth={720} minWidth={560} maxWidth={920} open={Boolean(account)} onOpenChange={(open) => {if (!open) onClose();}} title={account?.displayName || "客户详情"} description="关系化客户主体 · 时间线独立加载" footer={account?.legacyCustomerId ? <Button className="w-full" variant="primary" onClick={onFollowUp}><MessageSquarePlus className="h-4 w-4" />新增跟进</Button> : <p className="text-center text-xs text-[var(--erp-color-warning)]">该主体缺少旧客户映射，暂不能写入兼容跟进接口。</p>}><div className="space-y-5">{account && <><ErpDetailFactGrid><Fact label="客户等级" value={account.level || "未评级"} /><Fact label="业务状态" value={`${account.businessStatus}${account.stage ? ` · ${account.stage}` : ""}`} /><Fact label="负责人" value={account.owner || "未分配"} /><Fact label="来源" value={account.source || "—"} /><Fact label="电话" value={account.phone || "—"} /><Fact label="微信 / QQ" value={account.wechat || account.qq || "—"} /><Fact label="城市 / 公司" value={[account.city, account.companyName].filter(Boolean).join(" · ") || "—"} /><Fact label="预计成交" value={account.estimatedAmount === undefined ? "—" : `${formatCurrency(account.estimatedAmount)} · ${account.dealProbability ?? 0}%`} /></ErpDetailFactGrid>{account.nextAction && <DashboardSection title="下一步动作"><p className="text-sm text-[var(--erp-color-text-secondary)]">{account.nextAction}</p><p className="mt-2 text-xs text-[var(--erp-color-text-muted)]">计划时间：{formatDateTime(account.nextFollowAt)}</p></DashboardSection>}<DashboardSection title="客户时间线" description="只展示标准时间线接口返回的事件摘要，不透传原始 payload。">{loading ? <ErpLoadingState title="正在加载客户轨迹" /> : error ? <ErpEmptyState title="时间线加载失败" description={error.message} action={<Button size="sm" onClick={onRetry}>重试</Button>} /> : events.length ? <div className="space-y-3">{events.map((event) => <div key={event.id} className="flex gap-3"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--erp-color-primary)]" /><div className="min-w-0 flex-1 border-b border-[var(--erp-color-border)] pb-3 last:border-0"><p className="text-sm font-semibold">{event.summary}</p><p className="mt-1 erp-data-number text-xs text-[var(--erp-color-text-muted)]">{formatDateTime(event.occurredAt)} · {event.sourceType || event.eventType}{event.actorId ? ` · ${event.actorId}` : ""}</p></div></div>)}</div> : <ErpEmptyState title="暂无客户轨迹" description="新增客户、跟进、需求、报价或关联业务后会写入真实时间线。" />}</DashboardSection>{account.tags.length > 0 && <div className="flex flex-wrap gap-2">{account.tags.map((tag) => <ErpStatusBadge key={tag} label={tag} tone="neutral" />)}</div>}{account.remarks && <p className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3 text-sm text-[var(--erp-color-text-secondary)]">{account.remarks}</p>}</>}</div></ErpDetailDrawer>;
}

function formatDateTime(value: string | undefined) {
  return formatStoreDateTime(value);
}

function MetricCard({label, value, detail, icon, tone = "normal"}: {label: string; value: string; detail: string; icon: ReactNode; tone?: "normal" | "success" | "warning"}) {return <ErpMetricCard label={label} value={value} detail={detail} icon={icon} tone={tone === "normal" ? "neutral" : tone} />;}
const Fact = ErpDetailFact;
