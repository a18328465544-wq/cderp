import {NumericFormat, type NumericFormatProps} from "react-number-format";
import {cn, hasBaseWidthUtilityClass} from "@/src/lib/cn";

export interface ErpAmountInputProps extends Omit<NumericFormatProps, "thousandSeparator"> {
  /** Compact is reserved for filter/tool-bar contexts; default stays 40px. */
  density?: "default" | "compact";
  /** Select only on user/keyboard focus, without requesting focus on mount. */
  selectOnFocus?: boolean;
}

export function ErpAmountInput({className, allowNegative = false, density = "default", selectOnFocus = true, onFocus, readOnly, ...props}: ErpAmountInputProps) {
  const controlClass = density === "compact" ? "erp-filter-control" : "erp-form-control";
  const hasCustomWidth = hasBaseWidthUtilityClass(className);
  return <NumericFormat inputMode="decimal" {...props} readOnly={readOnly} onFocus={(event) => {onFocus?.(event); if (selectOnFocus && !readOnly && !event.isDefaultPrevented()) event.currentTarget.select();}} thousandSeparator="," prefix="¥ " allowNegative={allowNegative} decimalScale={2} data-erp-component="amount-input" data-density={density} className={cn("erp-focus-ring erp-data-number rounded-[var(--erp-radius-control)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 text-sm outline-none transition-[border-color,box-shadow] focus:border-[var(--erp-color-primary)]", controlClass, hasCustomWidth ? undefined : "w-full", className)} />;
}
