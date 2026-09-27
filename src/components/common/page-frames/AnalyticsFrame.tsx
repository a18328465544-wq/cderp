import {Children, Fragment, isValidElement, useState, type HTMLAttributes, type ReactNode} from "react";
import {ChevronDown, ChevronUp} from "lucide-react";
import {cn} from "@/src/lib/cn";
import {ErpFilterBar} from "../ErpFilterBar";
import {ErpAnalyticsPageFrame} from "../ErpPageFrames";

type RegionProps = HTMLAttributes<HTMLElement> & {children: ReactNode};

function countRenderableChildren(node: ReactNode): number {
  return Children.toArray(node).reduce<number>((count, child) => {
    if (isValidElement<{children?: ReactNode}>(child) && child.type === Fragment) {
      return count + countRenderableChildren(child.props.children);
    }
    return count + 1;
  }, 0);
}

export type AnalyticsMainVariant = "3-1" | "3-2" | "full";
export type AnalyticsVisualizationSize = "compact" | "standard" | "expanded";

/**
 * Analytics page contract. The frame owns hierarchy and responsive layout;
 * business features provide content through the regions below.
 */
export function AnalyticsFrame({className, children, ...props}: HTMLAttributes<HTMLDivElement> & {children: ReactNode}) {
  return <ErpAnalyticsPageFrame {...props} className={className}>{children}</ErpAnalyticsPageFrame>;
}

export function AnalyticsKpiRegion({primary, secondary, className, ...props}: Omit<RegionProps, "children"> & {primary: ReactNode; secondary?: ReactNode}) {
  const [supportingExpanded, setSupportingExpanded] = useState(false);
  const primaryCount = countRenderableChildren(primary);
  const secondaryCount = secondary ? countRenderableChildren(secondary) : 0;
  return <section {...props} data-erp-region="analytics-kpis" className={cn("analytics-kpi-region min-w-0 space-y-3", className)}>
    <div data-erp-region-level="primary" data-analytics-tier="core" data-analytics-density="primary" data-analytics-count={primaryCount} data-analytics-parity={primaryCount % 2 === 1 ? "odd" : "even"} className="analytics-kpi-grid analytics-kpi-grid--primary grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-3">{primary}</div>
    {secondary ? <>
      <div data-erp-region-level="secondary" data-analytics-tier="supporting" data-analytics-density="secondary" data-analytics-count={secondaryCount} data-analytics-parity={secondaryCount % 2 === 1 ? "odd" : "even"} data-mobile-collapsed={!supportingExpanded ? "true" : undefined} className="analytics-kpi-grid analytics-kpi-grid--supporting grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,190px),1fr))] gap-2">{secondary}</div>
      <button type="button" data-erp-region="analytics-kpi-toggle" className="erp-focus-ring mx-auto inline-flex min-h-[var(--erp-control-height-filter)] items-center gap-1 rounded-[var(--erp-radius-pill)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 text-xs font-medium text-[var(--erp-color-primary)] shadow-sm lg:hidden" aria-expanded={supportingExpanded} onClick={() => setSupportingExpanded((current) => !current)}>{supportingExpanded ? <><ChevronUp className="h-3.5 w-3.5" />收起更多指标</> : <><ChevronDown className="h-3.5 w-3.5" />展开更多指标</>}</button>
    </> : null}
  </section>;
}

export function AnalyticsToolbar({children, actions, className, ...props}: Omit<RegionProps, "children"> & {children: ReactNode; actions?: ReactNode}) {
  return <section {...props} data-erp-region="analytics-toolbar" data-analytics-toolbar="single-row" className={cn("min-w-0 w-full", className)}>
    <ErpFilterBar compact surface="card" actions={actions}>{children}</ErpFilterBar>
  </section>;
}

export function AnalyticsMainRegion({variant = "3-1", className, children, ...props}: RegionProps & {variant?: AnalyticsMainVariant}) {
  // Analytics side insights need enough room to remain legible beside charts.
  // At tablet widths the app shell/sidebar leaves too little space for the
  // desktop split, so stack until the xl canvas is available.
  const grid = variant === "full" ? "grid-cols-1" : variant === "3-2" ? "xl:grid-cols-[minmax(0,3fr)_minmax(280px,2fr)]" : "xl:grid-cols-[minmax(0,3fr)_minmax(280px,1fr)]";
  return <section {...props} data-erp-region="analytics-main" data-analytics-variant={variant} className={cn("grid min-w-0 grid-cols-1 items-stretch gap-4", grid, className)}>{children}</section>;
}

const visualizationSizeClasses: Record<AnalyticsVisualizationSize, string> = {
  compact: "min-h-48",
  standard: "min-h-72",
  expanded: "min-h-96",
};

function AnalyticsVisualization({size = "standard", className, children, ...props}: RegionProps & {size?: AnalyticsVisualizationSize}) {
  return <div {...props} data-erp-region="analytics-visualization" data-analytics-visualization-size={size} className={cn("flex h-full min-w-0 flex-col [&>*]:h-full", visualizationSizeClasses[size], className)}>{children}</div>;
}

function AnalyticsInsights({className, children, ...props}: RegionProps) {
  return <aside {...props} data-erp-region="analytics-insights" className={cn("flex h-full min-w-0 flex-col [&>*]:h-full", className)}>{children}</aside>;
}

AnalyticsMainRegion.Visualization = AnalyticsVisualization;
AnalyticsMainRegion.Insights = AnalyticsInsights;

export function AnalyticsDetailRegion({className, children, ...props}: RegionProps) {
  return <section {...props} data-erp-region="analytics-detail" data-analytics-region-order="detail" className={cn("min-w-0", className)}>{children}</section>;
}
