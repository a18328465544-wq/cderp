import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import type {ColumnDef} from "@tanstack/react-table";
import {Archive, Download, RefreshCw, ShieldCheck} from "lucide-react";
import {useMemo} from "react";
import {notify} from "@/src/utils/notification";
import {formatStoreDateTime, storeDate} from "@/src/utils/storeTime";
import {Button, Card, CardContent} from "@/src/components/ui";
import {ErpDataTable, ErpEmptyState, ErpPageContent, ErpPageError, ErpPageHeader, ErpSettingsPageFrame} from "@/src/components/common";
import {backupApi, queryKeys} from "@/src/services/api";
import {useAuth} from "@/src/app/auth";
import type {AuthSession} from "@/src/services/api";
import type {BackupRecord} from "@/src/services/api/endpoints/backup";

export function BackupPage() {
  const queryClient = useQueryClient();
  const {session, status, error: authError, refresh} = useAuth();
  const canAccess = Boolean(session && session.user.role === "老板");
  const backupsQuery = useQuery({queryKey: queryKeys.backup.list(), queryFn: ({signal}) => backupApi.list(signal), enabled: canAccess, retry: false});
  const createMutation = useMutation({mutationFn: () => backupApi.create(), onSuccess: async (backup) => { notify.success(`备份已创建：${backup.id}`); await queryClient.invalidateQueries({queryKey: queryKeys.backup.list()}); }});

  if (status === "loading") return <ErpSettingsPageFrame><BackupState title="正在验证备份权限" /></ErpSettingsPageFrame>;
  if (status === "error") return <ErpSettingsPageFrame><ErpPageError title="无法读取登录状态" description={authError?.message || "请重新登录后继续。"} onRetry={() => void refresh()} /></ErpSettingsPageFrame>;
  if (!session) return <ErpSettingsPageFrame><BackupState title="登录状态为空" /></ErpSettingsPageFrame>;
  if (!canAccess) return <ErpSettingsPageFrame><BackupState title="仅老板可以管理数据备份" description="服务器已拒绝该操作（403），前端不会展示备份内容。" /></ErpSettingsPageFrame>;
  if (backupsQuery.error) return <ErpSettingsPageFrame><ErpPageError title="无法读取备份清单" description={backupsQuery.error.message} onRetry={() => void backupsQuery.refetch()} /></ErpSettingsPageFrame>;
  return <ErpSettingsPageFrame><BackupContent session={session} backups={backupsQuery.data ?? []} loading={backupsQuery.isPending} creating={createMutation.isPending} onRefresh={() => void backupsQuery.refetch()} onCreate={() => createMutation.mutate()} onDownload={async () => { try { const blob = await backupApi.download(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `gpu-erp-backup-${storeDate()}.json`; anchor.click(); URL.revokeObjectURL(url); notify.success("备份文件已下载"); } catch (error) { notify.error(error instanceof Error ? error.message : "下载备份失败"); } }} /></ErpSettingsPageFrame>;
}

function BackupContent({session, backups, loading, creating, onRefresh, onCreate, onDownload}: {session: AuthSession; backups: BackupRecord[]; loading: boolean; creating: boolean; onRefresh: () => void; onCreate: () => void; onDownload: () => void}) {
  const columns = useMemo<ColumnDef<BackupRecord, unknown>[]>(() => [
    {id: "id", accessorKey: "id", header: "备份编号"},
    {id: "createdAt", accessorKey: "createdAt", header: "创建时间", cell: ({getValue}) => formatStoreDateTime(String(getValue() || ""))},
    {id: "file", accessorKey: "file", header: "存储位置", cell: ({getValue}) => String(getValue() || "数据库快照")},
  ], []);
  return <><ErpPageHeader density="default" title="数据备份" subtitle={`仅老板可用 · 当前账号：${session.user.displayName}`} actions={<><Button variant="secondary" size="sm" onClick={onRefresh}><RefreshCw className="h-4 w-4" />刷新</Button><Button variant="secondary" size="sm" onClick={onDownload}><Download className="h-4 w-4" />下载业务数据</Button><Button variant="primary" size="sm" disabled={creating} onClick={onCreate}><Archive className="h-4 w-4" />{creating ? "备份中…" : "立即备份"}</Button></>} /><ErpPageContent className="space-y-[var(--erp-page-gap)]"><Card><CardContent className="flex items-start gap-3 p-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--erp-radius-md)] bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]"><ShieldCheck className="h-5 w-5" /></span><div><p className="font-semibold">备份不会修改业务数据</p><p className="mt-1 text-sm text-[var(--erp-color-text-secondary)]">手动备份会在服务端生成数据库快照；下载文件已按后端规则移除账号口令哈希。</p></div></CardContent></Card>{!loading && !backups.length ? <Card><ErpEmptyState title="暂无备份记录" description="点击“立即备份”创建第一份快照。" /></Card> : <ErpDataTable ariaLabel="数据备份记录" columns={columns} data={backups} getRowId={(row) => row.id} loading={loading} emptyTitle="暂无备份记录" emptyDescription="点击“立即备份”创建第一份快照。" />}</ErpPageContent></>;
}

function BackupState({title, description}: {title: string; description?: string}) { return <Card className="mx-auto mt-16 max-w-xl"><CardContent className="flex flex-col items-center gap-3 p-8 text-center"><Archive className="h-8 w-8 text-[var(--erp-color-primary)]" /><h1 className="text-lg font-semibold">{title}</h1>{description && <p className="text-sm text-[var(--erp-color-text-secondary)]">{description}</p>}</CardContent></Card>; }
