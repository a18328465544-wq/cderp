import {CalendarDays} from "lucide-react";
import {useState} from "react";
import {ErpCalendar} from "./ErpCalendar";
import {ErpDateOverlay} from "./ErpDateOverlay";
import {cn, hasBaseWidthUtilityClass} from "@/src/lib/cn";
import {formatDateKey, parseDateKey} from "@/src/lib/dateRangePickerUtils";

function parseDateInput(value?: string) {
  return value ? parseDateKey(value) || undefined : undefined;
}

function formatDateInput(date: Date) {
  return formatDateKey(date);
}

export interface ErpDatePickerProps {
  value?: string;
  onChange: (value: string) => void;
  /** Use the compact control height when the picker lives in a filter toolbar. */
  density?: "default" | "compact";
  min?: string;
  max?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  className?: string;
}

/** A controlled, accessible date field backed by the shared Base UI popover. */
export function ErpDatePicker({value, onChange, density = "default", min, max, placeholder = "选择日期", disabled, required, invalid, "aria-label": ariaLabel, "aria-describedby": ariaDescribedBy, "aria-invalid": ariaInvalid, className}: ErpDatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = parseDateInput(value);
  const minDate = parseDateInput(min);
  const maxDate = parseDateInput(max);
  const hasCustomWidth = hasBaseWidthUtilityClass(className);
  const isInvalid = invalid || ariaInvalid === true || ariaInvalid === "true";
  const controlHeight = density === "compact" ? "h-[var(--erp-control-height-compact)]" : "h-[var(--erp-control-height)]";
  const trigger = (
    <button
      type="button"
      data-erp-component="date-picker"
      data-density={density}
      className={cn("erp-focus-ring flex min-w-0 max-w-full items-center justify-between gap-2 rounded-[var(--erp-radius-control)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 text-left text-sm text-[var(--erp-color-text)] transition-[border-color,box-shadow] hover:border-[var(--erp-color-border-strong)] data-popup-open:border-[var(--erp-color-primary)] disabled:cursor-not-allowed disabled:bg-[var(--erp-color-surface-muted)] disabled:text-[var(--erp-color-text-muted)]", controlHeight, isInvalid && "border-[var(--erp-color-danger)]", hasCustomWidth ? undefined : "w-full", className)}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-required={required}
      aria-invalid={isInvalid || undefined}
      aria-describedby={ariaDescribedBy}
    >
      <span className={cn("truncate", selected && "erp-data-number", !selected && "text-[var(--erp-color-text-muted)]")}>{selected ? formatDateInput(selected) : placeholder}</span>
      <CalendarDays className="h-4 w-4 shrink-0 text-[var(--erp-color-text-muted)]" aria-hidden="true" />
    </button>
  );

  return <ErpDateOverlay open={open} onOpenChange={setOpen} trigger={trigger} title="选择日期" headerMobileOnly closeLabel="关闭日期">
    <ErpCalendar selected={selected} onSelect={(date) => { if (date) { onChange(formatDateInput(date)); setOpen(false); } }} minDate={minDate} maxDate={maxDate} />
  </ErpDateOverlay>;
}
