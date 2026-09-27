import type {ReactNode} from "react";
import {Button} from "@/src/components/ui";
import {cn} from "@/src/lib/cn";

export type ErpSubmitState = "invalid" | "ready" | "submitting";

export function resolveErpSubmitState({canSubmit, submitting}: {canSubmit: boolean; submitting: boolean}): ErpSubmitState {
  if (submitting) return "submitting";
  return canSubmit ? "ready" : "invalid";
}

export function ErpSubmitBar({dirty, canSubmit, blockedReason, submitting, onCancel, submitLabel = "保存销售单", children, compact = false, embedded = false, showCancel = true}: {dirty: boolean; canSubmit: boolean; blockedReason?: string; submitting: boolean; onCancel: () => void; submitLabel?: string; children?: ReactNode; compact?: boolean; embedded?: boolean; showCancel?: boolean}) {
  const state = resolveErpSubmitState({canSubmit, submitting});
  const statusLabel = state === "submitting" ? "正在提交，请稍候" : state === "ready" ? "表单已就绪" : dirty ? blockedReason || "请完善必填信息" : "尚未填写必填信息";
  const bar = <div data-erp-component="submit-bar" className={cn("erp-sticky-action-layer flex flex-wrap items-center justify-between gap-3 rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-4 py-3 shadow-[var(--erp-shadow-popover)] backdrop-blur", compact ? "flex-col items-stretch" : "sticky bottom-3 max-sm:flex-col max-sm:items-stretch", embedded && "static rounded-none border-0 bg-transparent p-0 shadow-none backdrop-blur-none")}>
    <div className={cn("flex min-w-0 flex-wrap items-center gap-2 text-xs text-[var(--erp-color-text-muted)]", compact && "flex-wrap")}><span className={cn("h-2 w-2 shrink-0 rounded-full", state === "ready" ? "bg-[var(--erp-color-success)]" : state === "submitting" ? "animate-pulse bg-[var(--erp-color-primary)]" : "bg-[var(--erp-color-warning)]")} /><span role="status">{statusLabel}</span>{children}</div>
    <div data-erp-single-action={!showCancel || undefined} className={cn("erp-form-actions flex items-center gap-2 max-sm:w-full max-sm:grid", compact && "grid", compact && showCancel ? "grid-cols-2" : "grid-cols-1", !compact && showCancel ? "max-sm:grid-cols-2" : "max-sm:grid-cols-1")}>
      {showCancel ? <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>取消</Button> : null}
      <Button type="submit" variant="primary" disabled={state !== "ready"}>{submitting ? "提交中…" : submitLabel}</Button>
    </div>
  </div>;
  return !embedded && !compact ? <div className="erp-submit-bar-reserve">{bar}</div> : bar;
}
