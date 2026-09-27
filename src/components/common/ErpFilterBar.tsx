import type {ReactNode} from "react";
import {Card} from "@/src/components/ui";
import {cn} from "@/src/lib/cn";

export function ErpFilterBar({children, actions, compact = false, surface = "card", className}: {children: ReactNode; actions?: ReactNode; compact?: boolean; surface?: "card" | "plain"; className?: string}) {
  const content = <><div data-erp-region="filter-content" className={cn("flex w-full min-w-0 flex-1 flex-wrap items-center gap-2", compact && "2xl:flex-nowrap")}>{children}</div>{actions && <div data-erp-region="filter-actions" className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 lg:w-auto">{actions}</div>}</>;
  const classes = cn("flex flex-col lg:flex-row lg:items-center lg:justify-between", surface === "plain" ? "gap-2 border-b border-[var(--erp-color-border)] p-0 pb-3 shadow-none" : compact ? "gap-2 p-2.5" : "gap-3 p-3", className);
  if (surface === "plain") return <section data-erp-component="filter-bar" data-density={compact ? "compact" : "default"} data-surface="plain" className={classes}>{content}</section>;
  return <Card data-erp-component="filter-bar" data-density={compact ? "compact" : "default"} data-surface="card" className={cn(classes, "border border-[var(--erp-color-border)]")}>{content}</Card>;
}
