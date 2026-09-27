import {CalendarClock} from "lucide-react";
import {useState} from "react";
import {Button, Input} from "@/src/components/ui";
import {cn, hasBaseWidthUtilityClass} from "@/src/lib/cn";
import {formatDateKey, isDateKey, parseDateKey} from "@/src/lib/dateRangePickerUtils";
import {ErpCalendar} from "./ErpCalendar";
import {ErpDateOverlay} from "./ErpDateOverlay";

const TIME_PATTERN = /^(\d{2}):(\d{2})$/;
const DATE_TIME_PATTERN = /^(\d{4}-\d{2}-\d{2})[T\s](\d{2}):(\d{2})/;

type DateTimeParts = {dateKey: string; time: string};

function isTimeKey(value: string): boolean {
  const match = TIME_PATTERN.exec(value);
  if (!match) return false;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function parseDateTime(value?: string): DateTimeParts {
  if (!value) return {dateKey: "", time: ""};
  const match = DATE_TIME_PATTERN.exec(value.trim());
  const dateKey = match?.[1] || "";
  const time = match?.[2] && match?.[3] ? `${match[2]}:${match[3]}` : "";
  if (!isDateKey(dateKey) || !isTimeKey(time)) return {dateKey: "", time: ""};
  return {dateKey, time};
}

function composeDateTime(dateKey: string, time: string): string {
  return `${dateKey}T${time}`;
}

function normalizeDateTimeBound(value: string | undefined, edge: "min" | "max") {
  const trimmed = value?.trim() || "";
  if (!trimmed) return "";
  const parsed = parseDateTime(trimmed);
  if (parsed.dateKey && parsed.time) return composeDateTime(parsed.dateKey, parsed.time);
  const dateKey = trimmed.slice(0, 10);
  if (!isDateKey(dateKey)) return "";
  return composeDateTime(dateKey, edge === "min" ? "00:00" : "23:59");
}

export function isDateTimeWithinBounds(value: string, min?: string, max?: string) {
  const candidate = parseDateTime(value);
  if (!candidate.dateKey || !candidate.time) return false;
  const candidateKey = composeDateTime(candidate.dateKey, candidate.time);
  const minKey = normalizeDateTimeBound(min, "min");
  const maxKey = normalizeDateTimeBound(max, "max");
  return (!minKey || candidateKey >= minKey) && (!maxKey || candidateKey <= maxKey);
}

function dateTimeBoundsError(value: string, min?: string, max?: string) {
  const candidate = parseDateTime(value);
  if (!candidate.dateKey || !candidate.time) return null;
  const candidateKey = composeDateTime(candidate.dateKey, candidate.time);
  const minKey = normalizeDateTimeBound(min, "min");
  const maxKey = normalizeDateTimeBound(max, "max");
  if (minKey && candidateKey < minKey) return `时间不能早于 ${minKey.replace("T", " ")}`;
  if (maxKey && candidateKey > maxKey) return `时间不能晚于 ${maxKey.replace("T", " ")}`;
  return null;
}

function clampTimeForDate(dateKey: string, time: string, min?: string, max?: string) {
  let nextTime = time;
  const minKey = normalizeDateTimeBound(min, "min");
  const maxKey = normalizeDateTimeBound(max, "max");
  if (minKey.startsWith(`${dateKey}T`) && nextTime < minKey.slice(11, 16)) nextTime = minKey.slice(11, 16);
  if (maxKey.startsWith(`${dateKey}T`) && nextTime > maxKey.slice(11, 16)) nextTime = maxKey.slice(11, 16);
  return nextTime;
}

function displayDateTime(value?: string): string {
  const parts = parseDateTime(value);
  return parts.dateKey && parts.time ? `${parts.dateKey} ${parts.time}` : "";
}

export interface ErpDateTimePickerProps {
  /** The API-facing local date-time format remains YYYY-MM-DDTHH:mm. */
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
  title?: string;
  description?: string;
  className?: string;
}

/** A shared date + time field. It deliberately keeps the existing local string contract. */
export function ErpDateTimePicker({
  value,
  onChange,
  density = "default",
  min,
  max,
  placeholder = "选择日期和时间",
  disabled,
  required,
  invalid,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  title = "选择日期和时间",
  description = "日期和时间按门店时区保存",
  className,
}: ErpDateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateTimeParts>(() => parseDateTime(value));
  const [timeError, setTimeError] = useState<string | null>(null);
  const hasCustomWidth = hasBaseWidthUtilityClass(className);
  const isInvalid = invalid || ariaInvalid === true || ariaInvalid === "true";
  const controlHeight = density === "compact" ? "h-[var(--erp-control-height-compact)]" : "h-[var(--erp-control-height)]";
  const selected = draft.dateKey ? parseDateKey(draft.dateKey) || undefined : undefined;
  const minDate = min ? parseDateKey(min.slice(0, 10)) || undefined : undefined;
  const maxDate = max ? parseDateKey(max.slice(0, 10)) || undefined : undefined;
  const displayValue = displayDateTime(value);

  const syncFromValue = () => setDraft(parseDateTime(value));

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      syncFromValue();
      setTimeError(null);
    }
    setOpen(nextOpen);
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    const dateKey = formatDateKey(date);
    const time = clampTimeForDate(dateKey, isTimeKey(draft.time) ? draft.time : "09:00", min, max);
    setDraft({dateKey, time});
    setTimeError(null);
    const nextValue = composeDateTime(dateKey, time);
    if (isDateTimeWithinBounds(nextValue, min, max)) onChange(nextValue);
  };

  const handleTimeChange = (time: string) => {
    setDraft((current) => ({...current, time}));
    if (!draft.dateKey || !isTimeKey(time)) {
      setTimeError(null);
      return;
    }
    const nextValue = composeDateTime(draft.dateKey, time);
    const nextError = dateTimeBoundsError(nextValue, min, max);
    setTimeError(nextError);
    if (!nextError) onChange(nextValue);
  };

  const handleClear = () => {
    setDraft({dateKey: "", time: ""});
    setTimeError(null);
    onChange("");
  };
  const trigger = (
    <button
      type="button"
      data-erp-component="date-time-picker"
      data-density={density}
      data-erp-date-time-picker="true"
      className={cn(
        "erp-focus-ring flex min-w-0 max-w-full items-center justify-between gap-2 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 text-left text-sm text-[var(--erp-color-text)] transition-colors hover:border-[var(--erp-color-border-strong)] data-popup-open:border-[var(--erp-color-primary)] disabled:cursor-not-allowed disabled:bg-[var(--erp-color-surface-muted)] disabled:text-[var(--erp-color-text-muted)]",
        controlHeight,
        (isInvalid || timeError) && "border-[var(--erp-color-danger)]",
        hasCustomWidth ? undefined : "w-full",
        className,
      )}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-required={required}
      aria-invalid={isInvalid || Boolean(timeError) || undefined}
      aria-describedby={ariaDescribedBy}
    >
      <span className={cn("erp-data-number truncate", !displayValue && "text-[var(--erp-color-text-muted)]")}>
        {displayValue || placeholder}
      </span>
      <CalendarClock className="h-4 w-4 shrink-0 text-[var(--erp-color-text-muted)]" aria-hidden="true" />
    </button>
  );

  return <ErpDateOverlay open={open} onOpenChange={handleOpenChange} trigger={trigger} title={title} description={description} closeLabel="关闭日期时间" panelClassName="rounded-[var(--erp-radius-lg)]">
    <div className="grid gap-3 p-3 lg:grid-cols-[auto_9rem] lg:items-start">
      <ErpCalendar selected={selected} onSelect={handleDateSelect} minDate={minDate} maxDate={maxDate} />
      <div className="space-y-3">
        <label className="block text-erp-sm font-medium text-[var(--erp-color-text-secondary)]">
          时间
          <Input
            density="compact"
            className="erp-data-number mt-1 w-full text-xs"
            type="time"
            value={draft.time}
            onChange={(event) => handleTimeChange(event.target.value)}
            aria-label="跟进时间"
            aria-invalid={Boolean(timeError) || undefined}
          />
        </label>
        {timeError ? <p className="text-xs leading-5 text-[var(--erp-color-danger)]" role="alert">{timeError}</p> : <p className="text-xs leading-5 text-[var(--erp-color-text-muted)]">选择日期后可调整具体时间。</p>}
        <Button type="button" size="sm" variant="ghost" onClick={handleClear} disabled={!value && !draft.dateKey && !draft.time}>清除</Button>
      </div>
    </div>
  </ErpDateOverlay>;
}
