import type {ReactNode} from "react";
import {Inbox} from "lucide-react";
import {cn} from "@/src/lib/cn";

export type ErpEmptyStateDensity = "default" | "compact";

export function ErpEmptyState({
  title = "暂无数据",
  description,
  action,
  density = "default",
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  density?: ErpEmptyStateDensity;
  className?: string;
}) {
  const compact = density === "compact";
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
          "flex items-center justify-center rounded-full bg-[var(--erp-color-surface-muted)] text-[var(--erp-color-text-muted)]",
          compact ? "h-9 w-9" : "h-11 w-11",
        )}
        aria-hidden="true"
      >
        <Inbox className={compact ? "h-5 w-5" : "h-6 w-6"} />
      </div>
      <p className="font-semibold text-[var(--erp-color-text)]">{title}</p>
      {description && <p className="max-w-md text-xs text-[var(--erp-color-text-secondary)]">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
