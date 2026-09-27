import type {HTMLAttributes, ReactNode} from "react";
import {cn} from "@/src/lib/cn";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";
const toneClasses: Record<BadgeTone, {badge: string; dot: string}> = {
  neutral: {
    badge: "bg-[var(--erp-color-surface-muted)] text-[var(--erp-color-text-secondary)]",
    dot: "bg-[var(--erp-color-text-muted)]",
  },
  info: {
    badge: "bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]",
    dot: "bg-[var(--erp-color-primary)]",
  },
  success: {
    badge: "bg-[var(--erp-color-success-soft)] text-[var(--erp-color-success)]",
    dot: "bg-[var(--erp-color-success)]",
  },
  warning: {
    badge: "bg-[var(--erp-color-warning-soft)] text-[var(--erp-color-warning)]",
    dot: "bg-[var(--erp-color-warning)]",
  },
  danger: {
    badge: "bg-[var(--erp-color-danger-soft)] text-[var(--erp-color-danger)]",
    dot: "bg-[var(--erp-color-danger)]",
  },
};

export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {tone?: BadgeTone; dot?: boolean; children: ReactNode}) {
  const current = toneClasses[tone];
  return (
    <span
      {...props}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums",
        current.badge,
        className,
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", current.dot)} aria-hidden="true" />}
      {children}
    </span>
  );
}
