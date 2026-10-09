import {CalendarDays} from "lucide-react";
import {useEffect, useId, useState} from "react";
import {Button, Input} from "@/src/components/ui";
import {ErpCalendar} from "./ErpCalendar";
import {ErpDateOverlay} from "./ErpDateOverlay";
import {cn, hasBaseWidthUtilityClass} from "@/src/lib/cn";
import {formatDateKey, isDateKey, parseDateKey} from "@/src/lib/dateRangePickerUtils";
import {storeDate} from "@/src/utils/storeTime";
import {isComposingKey} from "@/src/lib/controlInteraction";

function parseDateInput(value?: string) {
  return value ? parseDateKey(value) || undefined : undefined;
}

function formatDateInput(date: Date) {
  return formatDateKey(date);
}

export function dateSelectionError(value: string, min?: string, max?: string): string | undefined {
  if (!isDateKey(value)) return "请输入有效日期：YYYY-MM-DD";
  if (min && isDateKey(min) && value < min) return `日期不能早于 ${min}`;
  if (max && isDateKey(max) && value > max) return `日期不能晚于 ${max}`;
  return undefined;
}

export interface ErpDatePickerProps {
  id?: string;
  value?: string;
  onChange: (value: string) => void;
  /** Use the compact control height when the picker lives in a filter toolbar. */
  density?: "default" | "compact";
  min?: string;
  max?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  /** Clearing is opt-in because requiredness is owned by the form schema. */
  clearable?: boolean;
  invalid?: boolean;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-required"?: boolean;
  className?: string;
}

/** A controlled, accessible date field backed by the shared Base UI popover. */
export function ErpDatePicker({id, value, onChange, density = "default", min, max, placeholder = "选择日期", disabled, required, clearable = false, invalid, "aria-label": ariaLabel, "aria-describedby": ariaDescribedBy, "aria-invalid": ariaInvalid, "aria-required": ariaRequired, className}: ErpDatePickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const [draftError, setDraftError] = useState<string>();
  const inputId = `date-input-${useId().replace(/:/g, "")}`;
  const changeOpen = (next: boolean) => {setDraft(value || ""); setDraftError(undefined); setOpen(next && !disabled);};
  const commit = (next: string) => {
    if (disabled) return;
    const error = dateSelectionError(next, min, max);
    if (error) {setDraftError(error); return;}
    onChange(next);
    setOpen(false);
  };
  useEffect(() => {if (disabled) setOpen(false);}, [disabled]);
  const selected = parseDateInput(value);
  const minDate = parseDateInput(min);
  const maxDate = parseDateInput(max);
  const hasCustomWidth = hasBaseWidthUtilityClass(className);
  const isInvalid = invalid || ariaInvalid === true || ariaInvalid === "true";
  const controlHeight = density === "compact" ? "h-[var(--erp-control-height-compact)]" : "h-[var(--erp-control-height)]";
  const trigger = (
    <button
      type="button"
      id={id}
      data-erp-component="date-picker"
      data-density={density}
      data-empty={!selected || undefined}
      className={cn("erp-focus-ring flex min-w-0 max-w-full items-center justify-between gap-2 rounded-[var(--erp-radius-control)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 text-left text-sm text-[var(--erp-color-text)] transition-[border-color,box-shadow] hover:border-[var(--erp-color-border-strong)] data-popup-open:border-[var(--erp-color-primary)] disabled:cursor-not-allowed disabled:bg-[var(--erp-color-surface-muted)] disabled:text-[var(--erp-color-text-muted)]", controlHeight, isInvalid && "border-[var(--erp-color-danger)]", hasCustomWidth ? undefined : "w-full", className)}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-required={required || ariaRequired}
      aria-invalid={isInvalid || undefined}
      aria-describedby={ariaDescribedBy}
    >
      <span className={cn("truncate", selected && "erp-data-number", !selected && "text-[var(--erp-color-text-muted)]")}>{selected ? formatDateInput(selected) : placeholder}</span>
      <CalendarDays className="h-4 w-4 shrink-0 text-[var(--erp-color-text-muted)]" aria-hidden="true" />
    </button>
  );

  return <ErpDateOverlay open={open && !disabled} onOpenChange={changeOpen} trigger={trigger} title="选择日期" headerMobileOnly closeLabel="关闭日期">
    <div className="space-y-2">
      <div className="flex items-center gap-2"><Input id={inputId} aria-label={`输入${ariaLabel || "日期"}`} aria-invalid={Boolean(draftError)} aria-describedby={`${inputId}-error`} value={draft} placeholder="YYYY-MM-DD" inputMode="numeric" onChange={(event) => {setDraft(event.target.value); setDraftError(undefined);}} onKeyDown={(event) => {if (isComposingKey(event.nativeEvent)) return; if (event.key === "Enter") {event.preventDefault(); event.stopPropagation(); commit(draft.trim());} if (event.key === "Escape") changeOpen(false);}} /><Button type="button" size="sm" onClick={() => commit(draft.trim())}>确定</Button></div>
      <p id={`${inputId}-error`} role="status" className="erp-annotation-slot text-xs text-[var(--erp-color-danger)]">{draftError || "\u00a0"}</p>
      <ErpCalendar selected={selected} onSelect={(date) => {if (date) commit(formatDateInput(date));}} minDate={minDate} maxDate={maxDate} />
      <div className="flex items-center justify-between gap-2"><Button type="button" variant="ghost" size="sm" disabled={Boolean(dateSelectionError(storeDate(), min, max))} onClick={() => commit(storeDate())}>今天</Button>{clearable && !required && !ariaRequired && <Button type="button" variant="ghost" size="sm" onClick={() => {if (!disabled) {onChange(""); setOpen(false);}}}>清除日期</Button>}</div>
    </div>
  </ErpDateOverlay>;
}
