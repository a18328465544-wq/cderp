import {CalendarRange} from "lucide-react";
import {useState} from "react";
import {Button, Input} from "@/src/components/ui";
import {cn, hasBaseWidthUtilityClass, hasWidthUtilityClass} from "@/src/lib/cn";
import {formatDateKey, getDateRangePreset, isDateKey, parseDateKey, parseNaturalDateInput, validateDateRange, type DateRangePreset, type DateRangeValue} from "@/src/lib/dateRangePickerUtils";
import {ErpCalendar} from "./ErpCalendar";
import {ErpDateOverlay} from "./ErpDateOverlay";

export interface DateRangePresetOption {
  label: string;
  value: DateRangePreset;
}

export const defaultDateRangePresets: DateRangePresetOption[] = [
  {label: "今天", value: "today"},
  {label: "昨天", value: "yesterday"},
  {label: "近 7 天", value: "last7"},
  {label: "近 30 天", value: "last30"},
  {label: "近 90 天", value: "last90"},
  {label: "本月", value: "thisMonth"},
  {label: "上月", value: "lastMonth"},
  {label: "本季度", value: "thisQuarter"},
  {label: "今年", value: "thisYear"},
];

export interface ErpDateRangePickerProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  /** Use the compact control height when the picker lives in a filter toolbar. */
  density?: "default" | "compact";
  startPlaceholder?: string;
  endPlaceholder?: string;
  startAriaLabel?: string;
  endAriaLabel?: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  /** CSS for the actual trigger. */
  triggerClassName?: string;
  /** @deprecated Use triggerClassName. Kept for compatibility with external callers. */
  fieldClassName?: string;
  className?: string;
  min?: string;
  max?: string;
  maxDays?: number;
  requireComplete?: boolean;
  presets?: DateRangePresetOption[];
  error?: string | null;
  disabled?: boolean;
}

function safeRange(value: DateRangeValue): DateRangeValue {
  return {
    startDate: isDateKey(value.startDate) ? value.startDate : "",
    endDate: isDateKey(value.endDate) ? value.endDate : "",
  };
}

function dateRangeToCalendarValue(value: DateRangeValue) {
  const from = parseDateKey(value.startDate) || undefined;
  const to = parseDateKey(value.endDate) || undefined;
  return from || to ? {from, to} : undefined;
}

function dateRangeFromCalendarValue(value: {from: Date | undefined; to?: Date} | undefined): DateRangeValue {
  return {
    startDate: value?.from ? formatDateKey(value.from) : "",
    endDate: value?.to ? formatDateKey(value.to) : "",
  };
}

function inputError(startDate: string, endDate: string) {
  if (startDate && !isDateKey(startDate.trim())) return "请输入有效的开始日期（YYYY-MM-DD）";
  if (endDate && !isDateKey(endDate.trim())) return "请输入有效的结束日期（YYYY-MM-DD）";
  return null;
}

function completeRangeError(value: DateRangeValue, requireComplete?: boolean) {
  return requireComplete && (!value.startDate || !value.endDate) ? "请选择完整日期范围" : null;
}

/** A single-entry range picker with presets, direct input, atomic apply, and a mobile sheet layout. */
export function ErpDateRangePicker({
  value,
  onChange,
  density = "default",
  startPlaceholder = "开始日期",
  endPlaceholder = "结束日期",
  startAriaLabel = "开始日期",
  endAriaLabel = "结束日期",
  ariaLabel = "日期范围",
  ariaDescribedBy,
  triggerClassName,
  fieldClassName,
  className,
  min,
  max,
  maxDays,
  requireComplete = false,
  presets = defaultDateRangePresets,
  error,
  disabled,
}: ErpDateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [draftRange, setDraftRange] = useState<DateRangeValue>(() => safeRange(value));
  const [startInput, setStartInput] = useState(() => safeRange(value).startDate);
  const [endInput, setEndInput] = useState(() => safeRange(value).endDate);
  const [naturalInput, setNaturalInput] = useState("");
  const [naturalError, setNaturalError] = useState<string | null>(null);
  const minDate = parseDateKey(min || "");
  const maxDate = parseDateKey(max || "");

  const syncDraftFromValue = () => {
    const next = safeRange(value);
    setDraftRange(next);
    setStartInput(next.startDate);
    setEndInput(next.endDate);
    setNaturalInput("");
    setNaturalError(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    syncDraftFromValue();
    setOpen(nextOpen);
  };

  const handleCancel = () => {
    syncDraftFromValue();
    setOpen(false);
  };

  const rangeConstraints = {minDate: min, maxDate: max};
  const draftError = naturalError || inputError(startInput, endInput) || validateDateRange(draftRange, maxDays, rangeConstraints) || completeRangeError(draftRange, requireComplete);
  const committedValue = safeRange(value);
  const committedError = validateDateRange(committedValue, maxDays, rangeConstraints) || completeRangeError(committedValue, requireComplete);
  const visibleError = open ? draftError : error || committedError;

  const handleApply = () => {
    if (draftError) return;
    onChange(draftRange);
    setOpen(false);
  };

  const setDraftField = (field: "startDate" | "endDate", nextValue: string) => {
    setDraftRange((current) => ({...current, [field]: nextValue}));
  };

  const updateInput = (field: "startDate" | "endDate", rawValue: string) => {
    setNaturalError(null);
    if (field === "startDate") setStartInput(rawValue);
    else setEndInput(rawValue);
    const trimmed = rawValue.trim();
    setDraftField(field, isDateKey(trimmed) ? trimmed : "");
  };

  const normalizeInput = (field: "startDate" | "endDate", rawValue: string) => {
    const trimmed = rawValue.trim();
    const parsed = parseDateKey(trimmed);
    const normalized = parsed ? formatDateKey(parsed) : trimmed;
    if (field === "startDate") setStartInput(normalized);
    else setEndInput(normalized);
    setDraftField(field, parsed ? normalized : "");
  };

  const handleCalendarSelect = (nextValue: {from: Date | undefined; to?: Date} | undefined) => {
    const next = dateRangeFromCalendarValue(nextValue);
    setNaturalError(null);
    setDraftRange(next);
    setStartInput(next.startDate);
    setEndInput(next.endDate);
  };

  const handlePreset = (preset: DateRangePreset) => {
    const next = getDateRangePreset(preset);
    setNaturalError(null);
    setDraftRange(next);
    setStartInput(next.startDate);
    setEndInput(next.endDate);
  };

  const handleClear = () => {
    const next = {startDate: "", endDate: ""};
    setNaturalInput("");
    setNaturalError(null);
    setDraftRange(next);
    setStartInput("");
    setEndInput("");
  };

  const handleNaturalInput = () => {
    const parsed = parseNaturalDateInput(naturalInput);
    if (!parsed) {
      setNaturalError("未识别日期，请输入“今天”“本周”“8月1号”或 YYYY-MM-DD 至 YYYY-MM-DD");
      return;
    }
    const constraintError = validateDateRange(parsed, maxDays, rangeConstraints) || completeRangeError(parsed, requireComplete);
    if (constraintError) {
      setNaturalError(constraintError);
      return;
    }
    setDraftRange(parsed);
    setStartInput(parsed.startDate);
    setEndInput(parsed.endDate);
    setNaturalError(null);
  };

  const displayStart = isDateKey(value.startDate) ? value.startDate : "";
  const displayEnd = isDateKey(value.endDate) ? value.endDate : "";
  const displayValue = displayStart && displayEnd
    ? `${displayStart} 至 ${displayEnd}`
    : displayStart
      ? `${displayStart} 至 ${endPlaceholder}`
      : displayEnd
        ? `${startPlaceholder} 至 ${displayEnd}`
        : "选择日期范围";
  const resolvedTriggerClassName = triggerClassName || fieldClassName;
  const hasCustomWidth = hasBaseWidthUtilityClass(resolvedTriggerClassName);
  const hasExplicitWidth = hasWidthUtilityClass(resolvedTriggerClassName);
  const controlHeight = density === "compact" ? "h-[var(--erp-control-height-compact)]" : "h-[var(--erp-control-height)]";
  const trigger = (
    <button
      type="button"
      data-erp-component="date-range-picker"
      data-density={density}
      className={cn(
        "erp-focus-ring flex min-w-0 items-center justify-between gap-2 rounded-[var(--erp-radius-control)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 text-left text-sm text-[var(--erp-color-text)] transition-[border-color,box-shadow] hover:border-[var(--erp-color-border-strong)] data-popup-open:border-[var(--erp-color-primary)] disabled:cursor-not-allowed disabled:bg-[var(--erp-color-surface-muted)] disabled:text-[var(--erp-color-text-muted)]",
        controlHeight,
        !hasExplicitWidth && "lg:min-w-56",
        visibleError && "border-[var(--erp-color-danger)]",
        hasCustomWidth ? undefined : "w-full",
        resolvedTriggerClassName,
      )}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-invalid={Boolean(visibleError) || undefined}
      aria-describedby={ariaDescribedBy}
    >
      <span className={cn("erp-data-number truncate", !displayStart && !displayEnd && "font-sans text-[var(--erp-color-text-muted)]")}>
        {displayValue}
      </span>
      <CalendarRange className="h-4 w-4 shrink-0 text-[var(--erp-color-text-muted)]" aria-hidden="true" />
    </button>
  );

  return (
    <div data-erp-filter-field="date-range" className={cn("min-w-0 w-full lg:w-auto", className)} role="group" aria-label={ariaLabel}>
      <ErpDateOverlay open={open} onOpenChange={handleOpenChange} trigger={trigger} title="选择日期范围" description="支持快捷选择，也可以直接输入日期" closeLabel="关闭日期范围" sideOffset={6} panelClassName="max-h-[min(90dvh,720px)] overflow-y-auto rounded-[var(--erp-radius-xl)]">
      {({compactViewport}) => <>
              <div className="flex flex-col lg:flex-row">
                <div className="grid grid-cols-3 gap-1 border-b border-[var(--erp-color-border)] p-2 lg:flex lg:w-32 lg:shrink-0 lg:flex-col lg:overflow-visible lg:border-b-0 lg:border-r lg:p-3">
                  {presets.map((preset) => (
                    <Button
                      key={preset.value}
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="justify-start whitespace-nowrap text-xs"
                      onClick={() => handlePreset(preset.value)}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="border-b border-[var(--erp-color-border)] px-3 pb-3 pt-3 lg:px-4">
                    <label className="block text-erp-sm font-medium text-[var(--erp-color-text-secondary)]">
                      快速输入
                      <div className="mt-1 flex min-w-0 gap-2">
                        <Input
                          density="compact"
                          className="min-w-0 flex-1 text-xs placeholder:font-sans"
                          value={naturalInput}
                          onChange={(event) => { setNaturalInput(event.target.value); setNaturalError(null); }}
                          onKeyDown={(event) => { if (event.key === "Escape") handleCancel(); if (event.key === "Enter") { event.preventDefault(); handleNaturalInput(); } }}
                          placeholder="今天、本周、8月1号或 2026-08-01 至 2026-08-31"
                          aria-label="自然语言日期"
                          aria-invalid={Boolean(naturalError) || undefined}
                        />
                        <Button type="button" size="sm" variant="secondary" className="shrink-0" onClick={handleNaturalInput}>解析</Button>
                      </div>
                      {naturalError && <p className="mt-1 text-xs font-normal text-[var(--erp-color-danger)]" role="alert">{naturalError}</p>}
                    </label>
                  </div>
                  <div className="grid gap-2 p-3 lg:grid-cols-2 lg:px-4">
                    <label className="min-w-0 text-erp-sm font-medium text-[var(--erp-color-text-secondary)]">
                      {startPlaceholder}
                      <Input
                        density="compact"
                        className="erp-data-number mt-1 w-full text-xs placeholder:font-sans"
                        value={startInput}
                        onChange={(event) => updateInput("startDate", event.target.value)}
                        onBlur={(event) => normalizeInput("startDate", event.target.value)}
                        onKeyDown={(event) => { if (event.key === "Escape") handleCancel(); if (event.key === "Enter") { event.preventDefault(); handleApply(); } }}
                        placeholder="YYYY-MM-DD"
                        inputMode="numeric"
                        aria-label={startAriaLabel}
                      />
                    </label>
                    <label className="min-w-0 text-erp-sm font-medium text-[var(--erp-color-text-secondary)]">
                      {endPlaceholder}
                      <Input
                        density="compact"
                        className="erp-data-number mt-1 w-full text-xs placeholder:font-sans"
                        value={endInput}
                        onChange={(event) => updateInput("endDate", event.target.value)}
                        onBlur={(event) => normalizeInput("endDate", event.target.value)}
                        onKeyDown={(event) => { if (event.key === "Escape") handleCancel(); if (event.key === "Enter") { event.preventDefault(); handleApply(); } }}
                        placeholder="YYYY-MM-DD"
                        inputMode="numeric"
                        aria-label={endAriaLabel}
                      />
                    </label>
                  </div>
                  <div className="overflow-x-auto">
                    <ErpCalendar
                      mode="range"
                      selected={dateRangeToCalendarValue(draftRange)}
                      onSelect={handleCalendarSelect}
                      minDate={minDate || undefined}
                      maxDate={maxDate || undefined}
                      maxDays={maxDays}
                      numberOfMonths={compactViewport ? 1 : 2}
                      defaultMonth={parseDateKey(draftRange.startDate) || parseDateKey(draftRange.endDate) || undefined}
                      startMonth={minDate || undefined}
                      endMonth={maxDate || undefined}
                    />
                  </div>
                  <div className="border-t border-[var(--erp-color-border)] px-3 py-2.5 lg:px-4">
                    {draftError && <p className="mb-2 text-xs text-[var(--erp-color-danger)]" role="alert">{draftError}</p>}
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                      <p className="min-w-0 truncate text-xs text-[var(--erp-color-text-muted)]" aria-live="polite">
                        {draftRange.startDate || draftRange.endDate ? `${draftRange.startDate || "未选择"} 至 ${draftRange.endDate || "未选择"}` : "尚未选择日期"}
                      </p>
                      <div className="flex justify-end gap-2">
                        <Button type="button" size="sm" variant="ghost" onClick={handleClear}>清除</Button>
                        <Button type="button" size="sm" variant="secondary" onClick={handleCancel}>取消</Button>
                        <Button type="button" size="sm" variant="primary" disabled={Boolean(draftError) || disabled} onClick={handleApply}>应用</Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
      </>}
      </ErpDateOverlay>
      {visibleError && <p className="mt-1 text-xs text-[var(--erp-color-danger)]" role="alert">{visibleError}</p>}
    </div>
  );
}
