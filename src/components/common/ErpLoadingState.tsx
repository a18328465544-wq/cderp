import type {ReactNode} from "react";
import {Skeleton} from "@/src/components/ui";

export function ErpLoadingState({title = "正在加载", description}: {title?: ReactNode; description?: ReactNode} = {}) {
  return <div className="space-y-3 p-5" aria-label="加载中">
    {title && <p className="text-sm font-semibold text-[var(--erp-color-text)]">{title}</p>}
    {description && <p className="text-xs text-[var(--erp-color-text-secondary)]">{description}</p>}
    <Skeleton className="h-5 w-40" />
    <Skeleton className="h-10 w-full" />
    <Skeleton className="h-10 w-full" />
    <Skeleton className="h-10 w-3/4" />
  </div>;
}
