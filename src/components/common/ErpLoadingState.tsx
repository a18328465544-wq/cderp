import type {ReactNode} from "react";
import {Skeleton} from "@/src/components/ui";

export function ErpLoadingState({title = "正在加载", description, presentation = "default", count = 3}: {title?: ReactNode; description?: ReactNode; presentation?: "default" | "card" | "list"; count?: number} = {}) {
  if (presentation === "card" || presentation === "list") {
    return <div className="space-y-2.5 p-3" aria-label="加载中">
      {title && <p className="text-xs font-medium text-[var(--erp-color-text-secondary)]">{title}</p>}
      {description && <p className="text-xs text-[var(--erp-color-text-muted)]">{description}</p>}
      {Array.from({length: count}).map((_, index) => <div key={index} className="flex items-center gap-3 rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border-soft)] bg-[var(--erp-color-surface)] p-3">
        <Skeleton className="h-10 w-10 shrink-0 rounded-[var(--erp-radius-md)]" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-3.5 w-3/5" />
          <Skeleton className="h-2.5 w-4/5" />
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Skeleton className="h-3.5 w-14" />
          <Skeleton className="h-2.5 w-9" />
        </div>
      </div>)}
    </div>;
  }
  return <div className="space-y-3 p-5" aria-label="加载中">
    {title && <p className="text-sm font-semibold text-[var(--erp-color-text)]">{title}</p>}
    {description && <p className="text-xs text-[var(--erp-color-text-secondary)]">{description}</p>}
    <Skeleton className="h-5 w-40" />
    <Skeleton className="h-10 w-full" />
    <Skeleton className="h-10 w-full" />
    <Skeleton className="h-10 w-3/4" />
  </div>;
}
