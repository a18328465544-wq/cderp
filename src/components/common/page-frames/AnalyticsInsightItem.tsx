import type {ReactNode} from "react";
import {cn} from "@/src/lib/cn";

export type AnalyticsInsightTone = "neutral" | "info" | "success" | "warning" | "danger";

export interface AnalyticsInsightItemProps {
  label: ReactNode;
  title: ReactNode;
  value: ReactNode;
  metadata?: ReactNode;
  tone?: AnalyticsInsightTone;
  action?: ReactNode;
  className?: string;
}

const valueToneClasses: Record<AnalyticsInsightTone, string> = {
  neutral: "text-[var(--erp-color-text)]",
  info: "text-[var(--erp-color-primary)]",
  success: "text-[var(--erp-color-success)]",
  warning: "text-[var(--erp-color-warning)]",
  danger: "text-[var(--erp-color-danger)]",
};

/**
 * Flat, reusable item for an analytics insight panel. It deliberately has no
 * card surface so the panel owns the single visual container.
 */
export function AnalyticsInsightItem({label, title, value, metadata, tone = "neutral", action, className}: AnalyticsInsightItemProps) {
  return <article data-erp-component="analytics-insight-item" className={cn("flex min-w-0 items-start gap-3 border-b border-[var(--erp-color-border-soft)] py-3 first:pt-0 last:border-b-0 last:pb-0", className)}>
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <p data-erp-region="insight-label" className="truncate text-xs font-semibold text-[var(--erp-color-text-secondary)]">{label}</p>
        <strong data-erp-region="insight-value" className={cn("shrink-0 erp-data-number text-sm", valueToneClasses[tone])}>{value}</strong>
      </div>
      <p data-erp-region="insight-title" className="mt-1 truncate text-sm font-semibold text-[var(--erp-color-text)]">{title}</p>
      {metadata ? <p data-erp-region="insight-metadata" className="mt-0.5 truncate text-xs text-[var(--erp-color-text-muted)]">{metadata}</p> : null}
    </div>
    {action ? <div data-erp-region="insight-action" className="shrink-0">{action}</div> : null}
  </article>;
}
