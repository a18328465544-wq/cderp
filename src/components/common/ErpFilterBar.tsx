import {Children, useId, useState, type ReactNode} from "react";
import {useErpPhone} from "@/src/hooks/useErpViewport";
import {ErpDialogShell} from "./ErpDialogShell";
import {SlidersHorizontal} from "lucide-react";
import {Button, Card} from "@/src/components/ui";
import {cn} from "@/src/lib/cn";

export function ErpFilterBar({children, actions, mobilePrimary, mobileActiveCount = 0, compact = false, surface = "card", className}: {children: ReactNode; actions?: ReactNode; mobilePrimary?: ReactNode; mobileActiveCount?: number; compact?: boolean; surface?: "card" | "plain"; className?: string}) {
  const advancedId = useId();
  const [expanded, setExpanded] = useState(false);
  const phone = useErpPhone();
  const childRegions = Children.toArray(children);
  const autoPrimary = phone && mobilePrimary === undefined && childRegions.length > 1;
  const primary = mobilePrimary ?? (autoPrimary ? childRegions[0] : undefined);
  const advanced = autoPrimary ? childRegions.slice(1) : children;
  const disclosure = mobilePrimary !== undefined || autoPrimary;
  const phoneSheet = phone && disclosure;
  const activeCount = Math.max(0, Math.floor(mobileActiveCount));
  // CSS hides, rather than unmounts, secondary controls on phones. Their
  // values and picker state survive disclosure and workspace tab switches.
  const content = <><div data-erp-region="filter-content" className={cn("flex w-full min-w-0 flex-1 flex-wrap items-center gap-2", compact && "2xl:flex-nowrap")}>
    {primary}
    {disclosure && <Button type="button" size="sm" variant={activeCount ? "secondary" : "ghost"} data-erp-region="filter-toggle" aria-expanded={expanded} aria-controls={advancedId} onClick={() => setExpanded((current) => !current)}><SlidersHorizontal className="h-4 w-4" aria-hidden="true" />{expanded ? "收起筛选" : "筛选"}{activeCount > 0 && <span className="tabular-nums">{activeCount}</span>}</Button>}
    {!phoneSheet && (disclosure ? <div id={advancedId} data-erp-region="filter-advanced" className="contents">{children}</div> : children)}
  </div>{actions && !phoneSheet && <div data-erp-region="filter-actions" className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 lg:w-auto">{actions}</div>}</>;
  const classes = cn("flex flex-col lg:flex-row lg:items-center lg:justify-between", surface === "plain" ? "gap-2 border-b border-[var(--erp-color-border)] p-0 pb-3 shadow-none" : compact ? "gap-2 p-2.5" : "gap-3 p-3", className);
  const mobileProps = {"data-mobile-disclosure": disclosure ? "true" : undefined, "data-mobile-expanded": disclosure ? String(expanded) : undefined};
  const sheet = phoneSheet ? <ErpDialogShell open={expanded} onOpenChange={setExpanded} title="筛选条件" mobilePresentation="sheet" footer={<>{actions}<Button type="button" onClick={() => setExpanded(false)}>查看结果</Button></>}><div id={advancedId} className="grid min-w-0 grid-cols-1 gap-3" data-erp-region="phone-filter-fields">{advanced}</div></ErpDialogShell> : null;
  if (surface === "plain") return <><section {...mobileProps} data-erp-component="filter-bar" data-density={compact ? "compact" : "default"} data-surface="plain" className={classes}>{content}</section>{sheet}</>;
  return <><Card {...mobileProps} data-erp-component="filter-bar" data-density={compact ? "compact" : "default"} data-surface="card" className={cn(classes, "border border-[var(--erp-color-border)]")}>{content}</Card>{sheet}</>;
}
