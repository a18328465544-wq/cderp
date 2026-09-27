import {cn} from "@/src/lib/cn";

export function Skeleton({className}: {className?: string}) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)]", className)} />;
}
