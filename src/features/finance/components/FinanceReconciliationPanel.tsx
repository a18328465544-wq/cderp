import {AlertTriangle, CircleAlert, ExternalLink, RotateCcw, CheckCircle2} from "lucide-react";
import {useMutation, useQueryClient} from "@tanstack/react-query";
import {DashboardSection, ErpEmptyState, ErpStatusBadge} from "@/src/components/common";
import type {FinanceReconciliationReport} from "@/src/types/finance-reconciliation";
import {financeReconciliationApi} from "@/src/services/api/endpoints/finance-reconciliation";
import {queryKeys} from "@/src/services/api";
import {Button} from "@/src/components/ui";
import {notify} from "@/src/utils/notification";

export function FinanceReconciliationPanel({report}: {report: FinanceReconciliationReport}) {
  const queryClient = useQueryClient();
  const actionMutation = useMutation({
    mutationFn: ({issue, action}: {issue: FinanceReconciliationReport["issues"][number]; action: "reviewed" | "resolved"}) => financeReconciliationApi.recordAction(issue, action),
    onSuccess: () => {
      notify.success("账务体检处理记录已保存");
      void queryClient.invalidateQueries({queryKey: queryKeys.finance.reconciliation(200)});
    },
    onError: (error: Error) => notify.error(error.message),
  });
  const reverseMutation = useMutation({
    mutationFn: async (issue: FinanceReconciliationReport["issues"][number]) => {
      await financeReconciliationApi.recordAction(issue, "reversal_requested", "已发起反向处理");
      await financeReconciliationApi.reverse(issue);
      return issue;
    },
    onSuccess: () => {
      notify.success("反向处理已执行");
      void queryClient.invalidateQueries({queryKey: queryKeys.finance.reconciliation(200)});
    },
    onError: (error: Error) => notify.error(error.message),
  });
  const tone = report.summary.errorCount > 0 ? "danger" : report.summary.warningCount > 0 ? "warning" : "success";
  const label = report.summary.errorCount > 0
    ? `${report.summary.errorCount} 项异常`
    : report.summary.warningCount > 0
      ? `${report.summary.warningCount} 项提示`
      : "账务链正常";
  return (
    <DashboardSection
      title="账务体检"
      description={`已检查 ${report.summary.accountCount} 个账户、${report.summary.paymentCount} 笔收付款与 ${report.summary.returnCount} 张退货单。`}
      actions={<ErpStatusBadge label={label} tone={tone} />}
    >
      {report.issues.length ? (
        <div className="space-y-2">
          {report.issues.slice(0, 6).map((issue, index) => (
            <div key={`${issue.fingerprint}-${index}`} className="flex items-start gap-3 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3 text-sm">
              {issue.severity === "error" ? <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--erp-color-danger)]" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--erp-color-warning)]" />}
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-[var(--erp-color-text-secondary)]">{issue.message}</p>
                {issue.lastAction ? <p className="text-xs text-[var(--erp-color-text-muted)]">最近处理：{issue.lastAction.action === "reviewed" ? "已复核" : issue.lastAction.action === "resolved" ? "已解决" : "已发起反向处理"} · {issue.lastAction.actor}</p> : null}
                <div className="flex flex-wrap items-center gap-2">
                  {issue.sourcePath ? <a className="inline-flex items-center gap-1 text-xs text-[var(--erp-color-primary)]" href={issue.sourcePath}><ExternalLink className="h-3.5 w-3.5" />查看来源</a> : null}
                  <Button type="button" size="xs" variant="ghost" disabled={actionMutation.isPending || reverseMutation.isPending} onClick={() => actionMutation.mutate({issue, action: "reviewed"})}><CheckCircle2 className="h-3.5 w-3.5" />标记已复核</Button>
                  {issue.recommendedAction === "reverse" && issue.reversePath ? <Button type="button" size="xs" variant="danger" disabled={actionMutation.isPending || reverseMutation.isPending} onClick={() => reverseMutation.mutate(issue)}><RotateCcw className="h-3.5 w-3.5" />执行冲销</Button> : null}
                </div>
              </div>
            </div>
          ))}
          {report.truncated ? <p className="text-xs text-[var(--erp-color-text-muted)]">仅显示前 6 项，完整结果请查看账务体检接口返回。</p> : null}
        </div>
      ) : (
        <ErpEmptyState title="暂未发现账务漂移" description="账户余额、收付款关联、单据结算和退货资金链通过检查。" />
      )}
    </DashboardSection>
  );
}
