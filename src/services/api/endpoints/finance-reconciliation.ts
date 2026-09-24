import {apiRequest} from "../client";
import type {FinanceReconciliationActionSummary, FinanceReconciliationIssue, FinanceReconciliationReport} from "@/src/types/finance-reconciliation";

type FinanceReconciliationResponseDto = {data?: FinanceReconciliationReport};
type FinanceReconciliationActionResponseDto = {data?: FinanceReconciliationActionSummary};

function safeLimit(limit: number) {
  return Math.min(500, Math.max(1, Math.floor(Number.isFinite(limit) ? limit : 200)));
}

export const financeReconciliationApi = {
  async inspect(limit = 200, signal?: AbortSignal) {
    const response = await apiRequest<FinanceReconciliationResponseDto>(`/api/finance/reconciliation?limit=${safeLimit(limit)}`, {signal});
    if (!response.data) throw new Error("账务体检没有返回结果");
    return response.data;
  },
  async recordAction(issue: FinanceReconciliationIssue, action: "reviewed" | "resolved" | "reversal_requested", notes?: string, signal?: AbortSignal) {
    const response = await apiRequest<FinanceReconciliationActionResponseDto>("/api/finance/reconciliation/actions", {
      method: "POST",
      body: JSON.stringify({issueFingerprint: issue.fingerprint, issueCode: issue.code, domain: issue.domain, entityId: issue.entityId, action, notes}),
      signal,
    });
    if (!response.data) throw new Error("账务异常处理记录没有返回结果");
    return response.data;
  },
  async reverse(issue: FinanceReconciliationIssue, signal?: AbortSignal) {
    if (!issue.reversePath) throw new Error("当前异常没有可执行的冲销动作");
    return apiRequest(issue.reversePath, {method: "POST", signal});
  },
};
