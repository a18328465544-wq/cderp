import {cn} from "@/src/lib/cn";

export function Skeleton({className}: {className?: string}) {
  return <div aria-hidden="true" className={cn("erp-skeleton-shimmer rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)]", className)} />;
}
