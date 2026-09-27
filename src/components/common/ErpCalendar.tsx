import {ChevronLeft, ChevronRight} from "lucide-react";
import {DayPicker, type DateRange, type Matcher} from "react-day-picker";
import {cn} from "@/src/lib/cn";

interface ErpCalendarSharedProps {
  minDate?: Date;
  maxDate?: Date;
  className?: string;
  numberOfMonths?: number;
  defaultMonth?: Date;
  startMonth?: Date;
  endMonth?: Date;
}

export interface ErpCalendarSingleProps extends ErpCalendarSharedProps {
  mode?: "single";
  selected?: Date;
  onSelect: (date: Date | undefined) => void;
}

export interface ErpCalendarRangeProps extends ErpCalendarSharedProps {
  mode: "range";
  selected?: DateRange;
  onSelect: (range: DateRange | undefined) => void;
  minDays?: number;
  maxDays?: number;
}

export type ErpCalendarProps = ErpCalendarSingleProps | ErpCalendarRangeProps;

const calendarClassNames = {
  // Two-month ranges are enabled on small tablets, so the month columns must
  // switch to a row at the same breakpoint instead of stacking into a very
  // tall sheet with the second month hidden below the fold.
  months: "flex flex-col gap-4 sm:flex-row sm:gap-6",
  month: "space-y-3",
  month_caption: "flex h-8 items-center justify-center",
  caption_label: "text-sm font-semibold",
  nav: "flex items-center justify-between",
  button_previous: "erp-focus-ring absolute left-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-[var(--erp-radius-sm)] text-[var(--erp-color-text-secondary)] hover:bg-[var(--erp-color-surface-muted)]",
  button_next: "erp-focus-ring absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-[var(--erp-radius-sm)] text-[var(--erp-color-text-secondary)] hover:bg-[var(--erp-color-surface-muted)]",
  month_grid: "w-full border-collapse",
  weekdays: "flex",
  weekday: "w-8 text-center text-[var(--erp-font-caption)] font-medium text-[var(--erp-color-text-muted)]",
  week: "mt-1 flex w-full",
  day: "relative h-8 w-8 p-0 text-center text-sm",
  day_button: "erp-focus-ring inline-flex h-8 w-8 items-center justify-center rounded-full text-sm hover:bg-[var(--erp-color-surface-muted)]",
  selected: "bg-[var(--erp-color-primary)] text-white hover:bg-[var(--erp-color-primary-hover)]",
  range_start: "rounded-l-full bg-[var(--erp-color-primary)] text-white hover:bg-[var(--erp-color-primary-hover)]",
  range_end: "rounded-r-full bg-[var(--erp-color-primary)] text-white hover:bg-[var(--erp-color-primary-hover)]",
  range_middle: "!bg-[var(--erp-color-info-soft)] !text-[var(--erp-color-primary)] rounded-none",
  today: "font-semibold text-[var(--erp-color-primary)]",
  outside: "text-[var(--erp-color-text-muted)] opacity-50",
  disabled: "pointer-events-none opacity-30",
  hidden: "invisible",
};

const weekdayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/** Shared calendar primitives for single-date fields and true range selection. */
export function ErpCalendar(props: ErpCalendarProps) {
  const {minDate, maxDate, className, numberOfMonths, defaultMonth, startMonth, endMonth} = props;
  const disabled: Matcher[] = [];
  if (minDate) disabled.push({before: minDate});
  if (maxDate) disabled.push({after: maxDate});

  const commonProps = {
    disabled: disabled.length ? disabled : undefined,
    defaultMonth: defaultMonth || (props.mode === "range" ? props.selected?.from || props.selected?.to : props.selected),
    numberOfMonths,
    startMonth,
    endMonth,
    showOutsideDays: true,
    weekStartsOn: 1 as const,
    className: cn("p-3 text-[var(--erp-color-text)]", className),
    classNames: calendarClassNames,
    formatters: {
      formatCaption: (month: Date) => `${month.getFullYear()}年${month.getMonth() + 1}月`,
      formatWeekdayName: (date: Date) => weekdayNames[date.getDay()] || "",
    },
    components: {
      Chevron: ({orientation}: {orientation?: "up" | "down" | "left" | "right"}) => orientation === "left" ? <ChevronLeft className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />,
    },
  };

  if (props.mode === "range") {
    return <DayPicker
      {...commonProps}
      mode="range"
      selected={props.selected}
      onSelect={props.onSelect}
      min={props.minDays}
      max={props.maxDays}
      excludeDisabled
      resetOnSelect
    />;
  }

  return <DayPicker
    {...commonProps}
    mode="single"
    selected={props.selected}
    onSelect={props.onSelect}
  />;
}
