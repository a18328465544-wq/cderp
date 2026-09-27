import {forwardRef, type InputHTMLAttributes} from "react";
import {cn, hasBaseWidthUtilityClass} from "@/src/lib/cn";

export type InputDensity = "default" | "compact";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Compact is reserved for filter/tool-bar contexts; default stays 40px. */
  density?: InputDensity;
  /** Search styling is explicit when the input is not using type="search". */
  variant?: "default" | "search";
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({className, density = "default", variant = "default", ...props}, ref) {
  const hasCustomWidth = hasBaseWidthUtilityClass(className);
  const dataProps = props as InputHTMLAttributes<HTMLInputElement> & {"data-density"?: string; "data-variant"?: string};
  const compact = density === "compact" || dataProps["data-density"] === "compact";
  const search = variant === "search" || props.type === "search" || dataProps["data-variant"] === "search";
  return <input ref={ref} {...props} data-erp-component="input" data-density={compact ? "compact" : dataProps["data-density"]} data-variant={variant === "search" ? "search" : dataProps["data-variant"]} className={cn("erp-focus-ring border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 text-sm text-[var(--erp-color-text)] outline-none placeholder:text-[var(--erp-color-text-muted)] transition-[border-color,box-shadow] focus:border-[var(--erp-color-primary)] disabled:bg-[var(--erp-color-surface-muted)]", compact ? "erp-filter-control" : search ? "erp-search-control" : "erp-form-control", hasCustomWidth ? undefined : "w-full", className)} />;
});
