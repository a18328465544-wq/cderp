import type {ReactNode} from "react";
import {cn} from "@/src/lib/cn";

export interface ErpDetailFactProps {
  label: ReactNode;
  value: ReactNode;
  className?: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
}

const toneClasses = {
  default: "text-[var(--erp-color-text)]",
  success: "text-[var(--erp-color-income)]",
  warning: "text-[var(--erp-color-risk)]",
  danger: "text-[var(--erp-color-expense)]",
  info: "text-[var(--erp-color-net)]",
} as const;

/** Compact label/value block for drawers and detail surfaces. */
export function ErpDetailFact({label, value, className, tone = "default"}: ErpDetailFactProps) {
  return <div data-erp-component="detail-fact" className={cn("min-w-0 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3", className)}><p data-erp-region="detail-fact-label" className="text-xs text-[var(--erp-color-text-muted)]">{label}</p><p data-erp-region="detail-fact-value" className={cn("mt-1 break-words text-sm font-semibold", toneClasses[tone])}>{value}</p></div>;
}

export function ErpDetailFactGrid({children, className}: {children: ReactNode; className?: string}) {
  return <div data-erp-component="detail-fact-grid" className={cn("grid min-w-0 grid-cols-2 gap-3", className)}>{children}</div>;
}
