import {ArrowDownRight, ArrowUpRight} from "lucide-react";
import type {ReactNode} from "react";
import {Card, CardContent} from "@/src/components/ui";

export type ErpMetricTone = "neutral" | "info" | "success" | "warning" | "danger";
export type ErpMetricVariant = "default" | "compact";
export type ErpMetricValueSize = "large" | "medium" | "small";

const toneClasses: Record<ErpMetricTone, string> = {
  neutral: "bg-[var(--erp-color-surface-muted)] text-[var(--erp-color-text-secondary)]",
  info: "bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]",
  success: "bg-[var(--erp-color-success-soft)] text-[var(--erp-color-success)]",
  warning: "bg-[var(--erp-color-warning-soft)] text-[var(--erp-color-warning)]",
  danger: "bg-[var(--erp-color-danger-soft)] text-[var(--erp-color-danger)]",
};
const valueToneClasses: Record<ErpMetricTone | "muted", string> = {
  neutral: "text-[var(--erp-color-text)]",
  info: "text-[var(--erp-color-net)]",
  success: "text-[var(--erp-color-income)]",
  warning: "text-[var(--erp-color-risk)]",
  danger: "text-[var(--erp-color-expense)]",
  muted: "text-[var(--erp-color-text-muted)]",
};

const valueSizeClasses: Record<ErpMetricVariant, Record<ErpMetricValueSize, string>> = {
  default: {
    large: "text-[length:var(--erp-font-metric-primary-large)]",
    medium: "text-[length:var(--erp-font-metric-primary-medium)]",
    small: "text-[length:var(--erp-font-metric-primary-small)]",
  },
  compact: {
    large: "text-[length:var(--erp-font-metric-compact-large)]",
    medium: "text-[length:var(--erp-font-metric-compact-medium)]",
    small: "text-[length:var(--erp-font-metric-compact-small)]",
  },
};

/** Keep the card geometry stable and scale only the value typography by length. */
export function getErpMetricValueSize(value: string): ErpMetricValueSize {
  const normalized = value.trim().replace(/\s+/g, "");
  if (normalized.length <= 4) return "large";
  if (normalized.length <= 8) return "medium";
  return "small";
}

/** Shared metric surface used by dashboards, analytics and finance pages. */
export function ErpMetricCard({label, value, detail, icon, tone = "neutral", valueTone = "neutral", minHeight, variant = "default", valueSize, compare, compareLabel = "较昨日", compareLabelClassName}: {
  label: string;
  value: string;
  detail?: ReactNode;
  icon?: ReactNode;
  tone?: ErpMetricTone;
  valueTone?: ErpMetricTone | "muted";
  minHeight?: number;
  variant?: ErpMetricVariant;
  /** Optional override for exceptional values; normal cards use the length tier automatically. */
  valueSize?: ErpMetricValueSize;
  /** Optional period comparison. Positive values are rendered as income-like green, negative as expense red. */
  compare?: number | null;
  compareLabel?: ReactNode;
  compareLabelClassName?: string;
}) {
  const compact = variant === "compact";
  const resolvedValueSize = valueSize ?? getErpMetricValueSize(value);
  const hasComparison = compare !== undefined;
  const hasFooter = detail !== undefined || hasComparison;
  return <Card data-erp-component="metric-card" data-density={compact ? "compact" : "default"} data-value-size={resolvedValueSize}>
    <CardContent className={`flex items-start justify-between gap-3 ${compact ? "p-4" : "p-5"}`} style={{minHeight: minHeight ?? (compact ? 76 : 112)}}>
      <div className="min-w-0">
        <p data-erp-region="metric-label" className="text-xs font-medium text-[var(--erp-color-text-secondary)]">{label}</p>
        <p data-erp-region="metric-value" data-value-size={resolvedValueSize} title={value} className={`${compact ? "mt-1" : "mt-2"} ${valueSizeClasses[variant][resolvedValueSize]} ${valueToneClasses[valueTone]} erp-data-number min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-semibold leading-tight tracking-tight`}>{value}</p>
        {hasFooter ? <div data-erp-region="metric-footer" className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          {detail !== undefined ? <span data-erp-region="metric-detail" className="min-w-0 break-words text-[var(--erp-color-text-muted)]">{detail}</span> : null}
          {hasComparison ? (compare == null ? <span data-erp-region="metric-comparison" className="text-[var(--erp-color-text-muted)]">暂无对比</span> : <span data-erp-region="metric-comparison" className={`inline-flex items-center gap-0.5 font-medium ${compare >= 0 ? "text-[var(--erp-color-income)]" : "text-[var(--erp-color-expense)]"}`}><span className="sr-only">{compare >= 0 ? "上升" : "下降"}</span>{compare >= 0 ? <ArrowUpRight className="h-3 w-3" aria-hidden="true" /> : <ArrowDownRight className="h-3 w-3" aria-hidden="true" />}{Math.abs(compare).toFixed(1)}%<span className={compareLabelClassName || "font-normal text-[var(--erp-color-text-muted)]"}>{compareLabel}</span></span>) : null}
        </div> : null}
      </div>
      {icon ? <span className={`flex ${compact ? "h-8 w-8" : "h-10 w-10"} shrink-0 items-center justify-center rounded-full ${toneClasses[tone]}`} aria-hidden="true">{icon}</span> : null}
    </CardContent>
  </Card>;
}
