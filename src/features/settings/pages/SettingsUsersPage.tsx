import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import type {ColumnDef} from "@tanstack/react-table";
import {Filter, Pencil, RefreshCw, ShieldCheck, UserPlus, Users} from "lucide-react";
import {ErpSearchInput} from "@/src/components/common";
import {useEffect, useMemo, useState} from "react";
import {notify} from "@/src/utils/notification";
import {Button, Card, Select} from "@/src/components/ui";
import {DashboardSection, ErpDataTable, ErpDetailDrawer, ErpDetailFact, ErpDetailFactGrid, ErpFilterBar, ErpMetricCard, ErpPageContent, ErpPageError, ErpPageHeader, ErpPageToolbar, ErpSettingsPageFrame, ErpStatusBadge, MetricsRegion, type QuickStatusItemData} from "@/src/components/common";
import {ApiError, queryKeys, usersApi} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import type {SettingsUserItem} from "@/src/types/finance-remaining";
import {permissionOverrideDescription, toUserMutationValues, UserPermissionDialog, type UserPermissionFormValues} from "../components/UserPermissionDialog";

export function SettingsUsersPage() {
  const {session, status, error: authError, refresh, logout} = useAuth();
  const canRead = Boolean(session && session.user.role === "老板" && createCapabilities(session).menu("permissions"));
  const query = useQuery({queryKey: queryKeys.settings.users(), queryFn: ({signal}) => usersApi.list(signal), enabled: canRead, retry: false});
  useEffect(() => {if (query.error instanceof ApiError && query.error.isUnauthorized) logout();}, [logout, query.error]);
  if (status === "loading") return <Card><p className="p-5 text-sm">正在验证员工权限管理权限…</p></Card>;
  if (status === "error") return <ErpPageError title="无法读取登录状态" description={authError?.message || "请重新登录后继续。"} onRetry={() => void refresh()} />;
  if (!session || !canRead) return <ErpPageError title="当前账号没有员工权限管理权限" description="该页面要求老板角色与 permissions 菜单权限。" />;
  if (query.error && !query.data) return <ErpPageError title="员工列表加载失败" description={query.error.message} onRetry={() => void query.refetch()} />;
  return <SettingsUsersContent users={query.data || []} loading={query.isPending} fetching={query.isFetching} error={query.error as Error | null} onRetry={() => void query.refetch()} onAuthExpired={logout} />;
}

function SettingsUsersContent({users, loading, fetching, error, onRetry, onAuthExpired}: {users: SettingsUserItem[]; loading: boolean; fetching: boolean; error: Error | null; onRetry: () => void; onAuthExpired: () => void}) {
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [detail, setDetail] = useState<SettingsUserItem | null>(null);
  const [editor, setEditor] = useState<{mode: "create" | "edit"; user: SettingsUserItem | null} | null>(null);
  const [mutationError, setMutationError] = useState("");
  const mutation = useMutation({
    mutationFn: ({mode, user, values}: {mode: "create" | "edit"; user: SettingsUserItem | null; values: UserPermissionFormValues}) => {
      const input = toUserMutationValues(values, mode);
      return mode === "create" ? usersApi.create(input) : user ? usersApi.update(user.id, input) : Promise.reject(new Error("缺少成员标识"));
    },
    onSuccess: async (_value, variables) => {
      setMutationError("");
      notify.success(variables.mode === "create" ? "成员已创建" : "成员权限已保存");
      setEditor(null);
      setDetail(null);
      await queryClient.invalidateQueries({queryKey: queryKeys.settings.users()});
      await queryClient.invalidateQueries({queryKey: queryKeys.auth.session()});
    },
    onError: (cause: Error) => {
      if (cause instanceof ApiError && cause.isUnauthorized) onAuthExpired();
      setMutationError(cause.message || "保存成员失败");
      if (cause instanceof ApiError && cause.isForbidden) notify.error("当前登录账号没有修改员工权限的权限");
    },
  });
  const filtered = useMemo(() => {
    const value = keyword.trim().toLocaleLowerCase();
    return users.filter((item) => (!role || item.role === role) && (!status || status === "enabled" && item.enabled || status === "disabled" && !item.enabled) && (!value || [item.displayName, item.username, item.role, item.remarks || ""].join(" ").toLocaleLowerCase().includes(value)));
  }, [keyword, role, status, users]);
  const roles = [...new Set(users.map((item) => item.role).filter(Boolean))].map((value) => ({value, label: value}));
  const quickStatus: QuickStatusItemData[] = [
    {icon: <Users className="h-4 w-4" />, label: "成员总数", value: `${users.length} 人`, description: "来自 /api/users", tone: "info"},
    {icon: <ShieldCheck className="h-4 w-4" />, label: "启用账号", value: `${users.filter((item) => item.enabled).length} 人`, description: "可继续登录", tone: "success"},
    {icon: <ShieldCheck className="h-4 w-4" />, label: "账号覆盖", value: `${users.filter((item) => item.permissionOverrides && Object.keys(item.permissionOverrides).length > 0).length} 人`, description: "存在账号级权限规则", tone: "warning"},
    {icon: <Users className="h-4 w-4" />, label: "当前筛选", value: `${filtered.length} 人`, description: "前端仅做展示筛选", tone: "neutral"},
  ];
  const columns = useMemo<ColumnDef<SettingsUserItem, unknown>[]>(() => [
    {accessorKey: "displayName", header: "成员", size: 180, cell: ({row}) => <div><p className="font-semibold">{row.original.displayName}</p><p className="text-xs text-[var(--erp-color-text-muted)]">{row.original.username}</p></div>},
    {accessorKey: "role", header: "角色", size: 120, cell: ({row}) => <ErpStatusBadge label={row.original.role} tone="info" />},
    {accessorKey: "enabled", header: "状态", size: 100, cell: ({row}) => <ErpStatusBadge label={row.original.enabled ? "启用" : "停用"} tone={row.original.enabled ? "success" : "neutral"} />},
    {id: "permissions", header: "权限来源", size: 190, cell: ({row}) => <span className="text-xs text-[var(--erp-color-text-secondary)]">{permissionOverrideDescription(row.original)}</span>},
    {accessorKey: "lastLoginTime", header: "最近登录", size: 150, cell: ({row}) => row.original.lastLoginTime || "未记录"},
    {accessorKey: "remarks", header: "备注", size: 180, cell: ({row}) => row.original.remarks || "—"},
    {id: "action", header: "操作", size: 150, cell: ({row}) => <div className="flex items-center gap-1"><Button type="button" size="sm" variant="ghost" onClick={(event) => {event.stopPropagation(); setDetail(row.original);}}>详情</Button><Button type="button" size="sm" variant="ghost" onClick={(event) => {event.stopPropagation(); setMutationError(""); setEditor({mode: "edit", user: row.original});}}><Pencil className="h-3.5 w-3.5" />编辑</Button></div>},
  ], []);
  const reset = () => {setKeyword(""); setRole(""); setStatus("");};
  return <ErpSettingsPageFrame>
    <ErpPageHeader title="员工权限" subtitle="管理成员账号、角色默认权限与账号级覆盖；保存后由后端权限中间件统一生效。" quickStatus={quickStatus} actions={<div className="flex items-center gap-2"><Button type="button" size="sm" variant="secondary" onClick={onRetry} disabled={fetching}><RefreshCw className={fetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />刷新</Button><Button type="button" size="sm" variant="primary" onClick={() => {setMutationError(""); setEditor({mode: "create", user: null});}}><UserPlus className="h-4 w-4" />新增成员</Button></div>} />
    <MetricsRegion><Metric label="成员总数" value={`${users.length} 人`} detail="服务端安全字段" /><Metric label="启用账号" value={`${users.filter((item) => item.enabled).length} 人`} detail="允许登录" tone="success" /><Metric label="停用账号" value={`${users.filter((item) => !item.enabled).length} 人`} detail="不能登录" tone="warning" /><Metric label="账号级覆盖" value={`${users.filter((item) => item.permissionOverrides && Object.keys(item.permissionOverrides).length > 0).length} 人`} detail="可单独调整权限" tone="info" /></MetricsRegion>
    <ErpPageToolbar><ErpFilterBar actions={<Button type="button" size="sm" variant="ghost" onClick={reset} disabled={!keyword && !role && !status}><Filter className="h-4 w-4" />重置筛选</Button>}><ErpSearchInput className="min-w-64 flex-1" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="姓名、账号、角色或备注" aria-label="搜索员工" /><Select className="w-32" value={role} options={[{value: "", label: "全部角色"}, ...roles]} onValueChange={setRole} aria-label="筛选角色" /><Select className="w-32" value={status} options={[{value: "", label: "全部状态"}, {value: "enabled", label: "启用"}, {value: "disabled", label: "停用"}]} onValueChange={setStatus} aria-label="筛选账号状态" /></ErpFilterBar></ErpPageToolbar>
    <ErpPageContent className="space-y-[var(--erp-page-gap)]">
    <DashboardSection title="成员列表" description="老板账号可创建成员、调整角色和账号级权限覆盖；最终访问仍由服务端校验。"><ErpDataTable ariaLabel="员工成员列表" columns={columns} data={filtered} getRowId={(row) => row.id} loading={loading} fetching={fetching} error={error} errorTitle="员工列表刷新失败" emptyTitle="暂无员工" emptyDescription="当前筛选条件没有匹配成员。" onRetry={onRetry} onRowClick={setDetail} stickyHeader density="compact" /></DashboardSection>
    <ErpDetailDrawer modal={false} resizable drawerKey="settings-user-detail" defaultWidth={620} minWidth={500} maxWidth={780} open={Boolean(detail)} onOpenChange={(open) => {if (!open) setDetail(null);}} title={detail?.displayName || "成员详情"} description={detail ? `${detail.role} · ${detail.username}` : undefined} footer={detail ? <div className="flex justify-end"><Button type="button" variant="primary" onClick={() => {setMutationError(""); setEditor({mode: "edit", user: detail});}}>编辑成员权限</Button></div> : undefined}>{detail && <div className="space-y-5"><ErpDetailFactGrid><Fact label="账号" value={detail.username} /><Fact label="角色" value={detail.role} /><Fact label="状态" value={detail.enabled ? "启用" : "停用"} /><Fact label="最近登录" value={detail.lastLoginTime || "未记录"} /></ErpDetailFactGrid><DashboardSection title="权限状态" description="账号覆盖会与角色默认权限合并，敏感字段由服务端最终判断。"><div className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3 text-sm text-[var(--erp-color-text-secondary)]">{permissionOverrideDescription(detail)}</div></DashboardSection>{detail.remarks && <p className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3 text-sm text-[var(--erp-color-text-secondary)]">{detail.remarks}</p>}</div>}</ErpDetailDrawer>
    <UserPermissionDialog open={Boolean(editor)} mode={editor?.mode || "create"} user={editor?.user || null} pending={mutation.isPending} error={mutationError} onOpenChange={(open) => {if (!open) {setEditor(null); setMutationError("");}}} onSubmit={(values) => {if (editor) mutation.mutate({mode: editor.mode, user: editor.user, values});}} />
    </ErpPageContent>
  </ErpSettingsPageFrame>;
}

function Metric({label, value, detail, tone = "neutral"}: {label: string; value: string; detail: string; tone?: "neutral" | "success" | "warning" | "info"}) {return <ErpMetricCard label={label} value={value} detail={detail} tone={tone} valueTone={tone} />;}
const Fact = ErpDetailFact;
