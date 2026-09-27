import type {TextareaHTMLAttributes} from "react";
import {cn, hasBaseWidthUtilityClass} from "@/src/lib/cn";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Compact is reserved for filter/tool-bar contexts; default stays 40px. */
  density?: "default" | "compact";
}

export function Textarea({className, density = "default", ...props}: TextareaProps) {
  const controlClass = density === "compact" ? "erp-filter-control" : "erp-form-control";
  const hasCustomWidth = hasBaseWidthUtilityClass(className);
  return <textarea {...props} data-erp-component="textarea" data-density={density} className={cn("erp-focus-ring min-h-24 resize-y rounded-[var(--erp-radius-control)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 py-2 text-sm text-[var(--erp-color-text)] outline-none placeholder:text-[var(--erp-color-text-muted)] transition-[border-color,box-shadow] focus:border-[var(--erp-color-primary)]", controlClass, hasCustomWidth ? undefined : "w-full", className)} />;
}
