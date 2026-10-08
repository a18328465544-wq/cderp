import type {ReactNode} from "react";
import {Inbox} from "lucide-react";
import {cn} from "@/src/lib/cn";

export type ErpEmptyStateDensity = "default" | "compact";

export function ErpEmptyState({
  title = "暂无数据",
  description,
  action,
  icon,
  tone = "neutral",
  density = "default",
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  tone?: "neutral" | "success" | "info" | "warning";
  density?: ErpEmptyStateDensity;
  className?: string;
}) {
  const compact = density === "compact";
  const toneStyle = {
    neutral: "bg-[var(--erp-color-surface-muted)] text-[var(--erp-color-text-muted)]",
    success: "bg-[var(--erp-color-success-soft)] text-[var(--erp-color-success)]",
    info: "bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]",
    warning: "bg-[var(--erp-color-warning-soft)] text-[var(--erp-color-warning)]",
  }[tone];
  return (
    <div
      data-erp-component="empty-state"
      data-density={density}
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "min-h-[var(--erp-empty-min-height-compact)] gap-1.5 p-4" : "min-h-[var(--erp-empty-min-height)] gap-2.5 p-6",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-full",
          toneStyle,
          compact ? "h-9 w-9" : "h-11 w-11",
        )}
        aria-hidden="true"
      >
        {icon || <Inbox className={compact ? "h-5 w-5" : "h-6 w-6"} />}
      </div>
      <p className="font-semibold text-[var(--erp-color-text)]">{title}</p>
      {description && <p className="max-w-md text-xs text-[var(--erp-color-text-secondary)]">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
