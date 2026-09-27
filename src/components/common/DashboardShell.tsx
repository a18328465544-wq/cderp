import {Children, useState, type HTMLAttributes, type ReactNode} from "react";
import {cn} from "@/src/lib/cn";
import {ErpPageFrame} from "./ErpPageFrame";

export function ErpDashboardPageFrame({className, children, ...props}: HTMLAttributes<HTMLDivElement> & {children: ReactNode}) {
  return <ErpPageFrame {...props} density="comfortable" className={className}>{children}</ErpPageFrame>;
}

/** @deprecated Use ErpDashboardPageFrame; kept as a compatibility alias. */
export const DashboardShell = ErpDashboardPageFrame;

export function MetricsRegion({className, children, mobileCollapseAfter, mobilePrimaryFullWidth = false, ...props}: HTMLAttributes<HTMLDivElement> & {children: ReactNode; mobileCollapseAfter?: number; mobilePrimaryFullWidth?: boolean}) {
  const [expanded, setExpanded] = useState(false);
  const items = Children.toArray(children);
  const shouldCollapse = Boolean(mobileCollapseAfter && items.length > mobileCollapseAfter);
  const visibleItems = shouldCollapse && !expanded ? items.slice(0, mobileCollapseAfter) : items;
  return <>
    <section {...props} data-erp-component="metrics-region" data-metric-count={visibleItems.length} data-metric-parity={visibleItems.length % 2 === 1 ? "odd" : "even"} data-mobile-collapsed={shouldCollapse && !expanded ? "true" : undefined} data-mobile-primary-full-width={mobilePrimaryFullWidth ? "true" : undefined} className={cn("grid grid-cols-[repeat(auto-fit,minmax(min(100%,var(--erp-metric-min-width)),1fr))] gap-3", className)}>{visibleItems}</section>
    {shouldCollapse && <button type="button" data-erp-region="metrics-toggle" className="erp-focus-ring mx-auto inline-flex min-h-[var(--erp-control-height-filter)] items-center rounded-[var(--erp-radius-pill)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 text-xs font-medium text-[var(--erp-color-primary)] shadow-sm lg:hidden" aria-expanded={expanded} onClick={() => setExpanded((current) => !current)}>{expanded ? "收起指标" : `展开更多指标（${items.length - (mobileCollapseAfter || 0)}）`}</button>}
  </>;
}

export function DashboardSection({title, description, actions, density = "compact", className, children, ...props}: Omit<HTMLAttributes<HTMLElement>, "title"> & {title?: ReactNode; description?: ReactNode; actions?: ReactNode; density?: "compact" | "default"; children: ReactNode}) {
  /* Helper copy is opt-in; an absent annotation must not reserve a blank line. */
  const showDescription = density === "default" && Boolean(description);
  const hasHeader = Boolean(title || showDescription || actions);
  return <section {...props} data-erp-component="dashboard-section" data-density={density} className={cn("erp-card-surface p-[var(--erp-card-padding-compact)]", density === "default" && "p-[var(--erp-card-padding)]", className)}>
    {hasHeader && <div data-erp-region="section-header" className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-[var(--erp-color-border)] pb-3", density === "default" && "pb-4")}>
      <div className="min-w-0">{title && <h2 className="text-erp-lg font-semibold text-[var(--erp-color-text)]">{title}</h2>}{showDescription && <p className="erp-annotation-slot mt-1 text-xs text-[var(--erp-color-text-secondary)]" data-empty={!description || undefined} aria-hidden={!description || undefined}>{description || "\u00a0"}</p>}</div>
      {actions && <div data-erp-region="section-actions" className="flex w-full shrink-0 flex-wrap items-center gap-2 lg:w-auto lg:justify-end">{actions}</div>}
    </div>}
    <div data-erp-region="section-content" className={cn(hasHeader ? "pt-3" : "", density === "default" && hasHeader && "pt-4")}>{children}</div>
  </section>;
}

export function MainRegion({variant = "70-30", className, children, ...props}: HTMLAttributes<HTMLDivElement> & {variant?: "full" | "70-30" | "60-40" | "50-50"; children: ReactNode}) {
  // The persistent sidebar leaves a narrow content canvas at tablet widths.
  // Keep secondary regions below the primary content until the xl canvas is
  // available; this prevents two-column forms and detail panels from being
  // squeezed into unreadable 280–480px columns.
  const grid = variant === "full" ? "grid-cols-1" : variant === "60-40" ? "xl:grid-cols-[minmax(0,3fr)_minmax(280px,2fr)]" : variant === "50-50" ? "xl:grid-cols-2" : "xl:grid-cols-[minmax(0,7fr)_minmax(280px,3fr)]";
  return <div {...props} data-erp-component="main-region" className={cn("grid min-w-0 grid-cols-1 items-start gap-5", grid, className)}>{children}</div>;
}

function MainRegionPrimary({className, children, ...props}: HTMLAttributes<HTMLDivElement> & {children: ReactNode}) {
  return <div {...props} className={cn("min-w-0", className)}>{children}</div>;
}

function MainRegionSecondary({className, children, ...props}: HTMLAttributes<HTMLDivElement> & {children: ReactNode}) {
  return <aside {...props} className={cn("min-w-0", className)}>{children}</aside>;
}

MainRegion.Primary = MainRegionPrimary;
MainRegion.Secondary = MainRegionSecondary;

export function BottomRegion({className, children, ...props}: HTMLAttributes<HTMLElement> & {children: ReactNode}) {
  if (!children) return null;
  return <section {...props} className={cn("min-w-0", className)}>{children}</section>;
}
