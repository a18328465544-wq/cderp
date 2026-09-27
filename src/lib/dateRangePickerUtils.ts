import {storeDate} from "../utils/storeTime";

export type DateRangeValue = {
  startDate: string;
  endDate: string;
};

export type DateRangePreset =
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "last90"
  | "thisMonth"
  | "lastMonth"
  | "thisQuarter"
  | "thisYear"
  | "custom";

export type CalendarCell = {
  date: string;
  day: number;
  outsideMonth: boolean;
};

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_KEY_PATTERN = /^(\d{4})-(\d{2})$/;

const pad = (value: number) => String(value).padStart(2, "0");

export function isDateKey(value: string): boolean {
  const match = DATE_KEY_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function parseDateKey(value: string): Date | null {
  if (!isDateKey(value)) return null;
  const parts = value.split("-").map(Number);
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12);
}

export function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function compareDateKeys(left: string, right: string): number {
  return left.localeCompare(right);
}

export function addDateDays(value: string, days: number): string {
  const date = parseDateKey(value) || parseDateKey(storeDate())!;
  date.setDate(date.getDate() + days);
  return formatDateKey(date);
}

export function monthKey(value: string): string {
  if (MONTH_KEY_PATTERN.test(value)) {
    const month = Number(value.split("-")[1]);
    if (month >= 1 && month <= 12) return value;
  }
  return isDateKey(value) ? value.slice(0, 7) : storeDate().slice(0, 7);
}

export function parseMonthKey(value: string): { year: number; month: number } {
  const [yearText, monthText] = monthKey(value).split("-");
  return { year: Number(yearText), month: Number(monthText) };
}

export function formatMonthKey(year: number, month: number): string {
  const date = new Date(year, month - 1, 1, 12);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function shiftMonth(value: string, offset: number): string {
  const { year, month } = parseMonthKey(value);
  const date = new Date(year, month - 1 + offset, 1, 12);
  return formatMonthKey(date.getFullYear(), date.getMonth() + 1);
}

export function startOfMonth(value: string): string {
  const { year, month } = parseMonthKey(value);
  return `${year}-${pad(month)}-01`;
}

export function endOfMonth(value: string): string {
  const { year, month } = parseMonthKey(value);
  return formatDateKey(new Date(year, month, 0, 12));
}

export function startOfQuarter(value: string): string {
  const { year, month } = parseMonthKey(value);
  const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1;
  return `${year}-${pad(quarterStartMonth)}-01`;
}

export function endOfQuarter(value: string): string {
  return endOfMonth(shiftMonth(startOfQuarter(value), 2));
}

export function startOfYear(value: string): string {
  const { year } = parseMonthKey(value);
  return `${year}-01-01`;
}

export function endOfYear(value: string): string {
  const { year } = parseMonthKey(value);
  return `${year}-12-31`;
}

export function startOfWeek(value: string): string {
  const date = parseDateKey(value);
  if (!date) return "";
  const day = date.getDay();
  const mondayOffset = (day + 6) % 7;
  return addDateDays(value, -mondayOffset);
}

export function endOfWeek(value: string): string {
  const start = startOfWeek(value);
  return start ? addDateDays(start, 6) : "";
}

export function daysInMonth(value: string): number {
  const { year, month } = parseMonthKey(value);
  return new Date(year, month, 0, 12).getDate();
}

export function getCalendarCells(value: string): CalendarCell[] {
  const month = monthKey(value);
  const { year, month: monthNumber } = parseMonthKey(month);
  const firstDay = new Date(year, monthNumber - 1, 1, 12).getDay();
  const offset = firstDay === 0 ? 0 : firstDay;
  const firstCell = new Date(year, monthNumber - 1, 1 - offset, 12);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstCell);
    date.setDate(firstCell.getDate() + index);
    return {
      date: formatDateKey(date),
      day: date.getDate(),
      outsideMonth: date.getMonth() !== monthNumber - 1 || date.getFullYear() !== year,
    };
  });
}

export function daysBetweenInclusive(startDate: string, endDate: string): number {
  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  if (!start || !end || compareDateKeys(endDate, startDate) < 0) return 0;
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

export function normalizeRange(value: DateRangeValue): DateRangeValue {
  const startDate = isDateKey(value.startDate) ? value.startDate : "";
  const endDate = isDateKey(value.endDate) ? value.endDate : "";
  if (startDate && endDate && compareDateKeys(startDate, endDate) > 0) {
    return { startDate: endDate, endDate: startDate };
  }
  return { startDate, endDate };
}

export interface DateRangeConstraints {
  minDate?: string;
  maxDate?: string;
}

export function validateDateRange(value: DateRangeValue, maxDays?: number, constraints: DateRangeConstraints = {}): string | null {
  if (value.startDate && !isDateKey(value.startDate)) return "开始日期格式无效";
  if (value.endDate && !isDateKey(value.endDate)) return "结束日期格式无效";
  if (constraints.minDate && isDateKey(constraints.minDate)) {
    if (value.startDate && isDateKey(value.startDate) && compareDateKeys(value.startDate, constraints.minDate) < 0) return `开始日期不能早于 ${constraints.minDate}`;
    if (value.endDate && isDateKey(value.endDate) && compareDateKeys(value.endDate, constraints.minDate) < 0) return `结束日期不能早于 ${constraints.minDate}`;
  }
  if (constraints.maxDate && isDateKey(constraints.maxDate)) {
    if (value.startDate && isDateKey(value.startDate) && compareDateKeys(value.startDate, constraints.maxDate) > 0) return `开始日期不能晚于 ${constraints.maxDate}`;
    if (value.endDate && isDateKey(value.endDate) && compareDateKeys(value.endDate, constraints.maxDate) > 0) return `结束日期不能晚于 ${constraints.maxDate}`;
  }
  if (value.startDate && value.endDate && compareDateKeys(value.startDate, value.endDate) > 0) {
    return "开始日期不能晚于结束日期";
  }
  if (maxDays && value.startDate && value.endDate && daysBetweenInclusive(value.startDate, value.endDate) > maxDays) {
    return `单次最多查看 ${maxDays} 天`;
  }
  return null;
}

export function readDateRange(params: URLSearchParams, startKey: string, endKey: string): DateRangeValue {
  return normalizeRange({
    startDate: params.get(startKey)?.trim() || "",
    endDate: params.get(endKey)?.trim() || "",
  });
}

export function getDateRangePreset(preset: DateRangePreset, today = storeDate()): DateRangeValue {
  const safeToday = isDateKey(today) ? today : storeDate();
  switch (preset) {
    case "today":
      return { startDate: safeToday, endDate: safeToday };
    case "yesterday": {
      const yesterday = addDateDays(safeToday, -1);
      return { startDate: yesterday, endDate: yesterday };
    }
    case "last7":
      return { startDate: addDateDays(safeToday, -6), endDate: safeToday };
    case "last30":
      return { startDate: addDateDays(safeToday, -29), endDate: safeToday };
    case "last90":
      return { startDate: addDateDays(safeToday, -89), endDate: safeToday };
    case "thisMonth":
      return { startDate: startOfMonth(safeToday), endDate: safeToday };
    case "lastMonth": {
      const previousMonth = shiftMonth(safeToday.slice(0, 7), -1);
      return { startDate: startOfMonth(previousMonth), endDate: endOfMonth(previousMonth) };
    }
    case "thisQuarter":
      return { startDate: startOfQuarter(safeToday), endDate: safeToday };
    case "thisYear":
      return { startDate: startOfYear(safeToday), endDate: safeToday };
    case "custom":
    default:
      return { startDate: "", endDate: "" };
  }
}

export function getPresetForRange(value: DateRangeValue, today = storeDate()): DateRangePreset | null {
  const normalized = normalizeRange(value);
  const presets: DateRangePreset[] = ["today", "yesterday", "last7", "last30", "last90", "thisMonth", "lastMonth", "thisQuarter", "thisYear"];
  return presets.find(preset => {
    const candidate = getDateRangePreset(preset, today);
    return candidate.startDate === normalized.startDate && candidate.endDate === normalized.endDate;
  }) || null;
}

const chineseMonthNumbers: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
  十一: 11,
  十二: 12,
};

function parseNaturalDateToken(value: string, today: string): string | null {
  const normalized = value.trim().replace(/\s+/g, "").replaceAll("／", "/");
  if (!normalized) return null;
  if (isDateKey(normalized)) return normalized;
  const isoMatch = /^(\d{4})[\/.](\d{1,2})[\/.](\d{1,2})$/.exec(normalized);
  if (isoMatch) {
    const candidate = `${isoMatch[1]}-${pad(Number(isoMatch[2]))}-${pad(Number(isoMatch[3]))}`;
    return isDateKey(candidate) ? candidate : null;
  }
  const chineseDateMatch = /^(?:(\d{4})年)?([一二三四五六七八九十]{1,3}|\d{1,2})月([一二三四五六七八九十]{1,3}|\d{1,2})(?:日|号)?$/.exec(normalized);
  if (chineseDateMatch) {
    const monthToken = chineseDateMatch[2] || "";
    const dayToken = chineseDateMatch[3] || "";
    const month = chineseMonthNumbers[monthToken] || Number(monthToken);
    const day = chineseMonthNumbers[dayToken] || Number(dayToken);
    const year = Number(chineseDateMatch[1] || today.slice(0, 4));
    const candidate = `${year}-${pad(month)}-${pad(day)}`;
    return isDateKey(candidate) ? candidate : null;
  }
  return null;
}

function parseNaturalMonthToken(value: string, today: string): DateRangeValue | null {
  const normalized = value.trim().replace(/\s+/g, "");
  const match = /^(?:(\d{4})年)?([一二三四五六七八九十]{1,3}|\d{1,2})(?:月|月份)$/.exec(normalized);
  if (!match) return null;
  const monthToken = match[2] || "";
  const month = chineseMonthNumbers[monthToken] || Number(monthToken);
  if (month < 1 || month > 12) return null;
  const year = Number(match[1] || today.slice(0, 4));
  const key = formatMonthKey(year, month);
  return { startDate: startOfMonth(key), endDate: endOfMonth(key) };
}

/** 将常用中文快捷词、ISO 日期、中文月日输入转换为统一日期范围。 */
export function parseNaturalDateInput(input: string, today = storeDate(), mode: "single" | "range" = "range"): DateRangeValue | null {
  const safeToday = isDateKey(today) ? today : storeDate();
  const normalized = input.trim().replace(/\s+/g, "").toLowerCase();
  if (!normalized) return null;
  const aliases: Record<string, DateRangePreset> = {
    今日: "today",
    今天: "today",
    昨日: "yesterday",
    昨天: "yesterday",
    近7天: "last7",
    近七天: "last7",
    近30天: "last30",
    近三十天: "last30",
    近90天: "last90",
    近九十天: "last90",
    本月: "thisMonth",
    这个月: "thisMonth",
    上月: "lastMonth",
    上个月: "lastMonth",
    下月: "custom",
    下个月: "custom",
    本季度: "thisQuarter",
    今年: "thisYear",
  };
  if (normalized === "本周" || normalized === "这周" || normalized === "本星期") {
    const range = { startDate: startOfWeek(safeToday), endDate: endOfWeek(safeToday) };
    return mode === "single" ? { startDate: range.startDate, endDate: range.startDate } : range;
  }
  if (normalized === "上周" || normalized === "上星期") {
    const previous = addDateDays(safeToday, -7);
    const range = { startDate: startOfWeek(previous), endDate: endOfWeek(previous) };
    return mode === "single" ? { startDate: range.startDate, endDate: range.startDate } : range;
  }
  if (normalized === "下周" || normalized === "下星期") {
    const next = addDateDays(safeToday, 7);
    const range = { startDate: startOfWeek(next), endDate: endOfWeek(next) };
    return mode === "single" ? { startDate: range.startDate, endDate: range.startDate } : range;
  }
  if (normalized === "下月" || normalized === "下个月") {
    const key = shiftMonth(safeToday.slice(0, 7), 1);
    const range = { startDate: startOfMonth(key), endDate: endOfMonth(key) };
    return mode === "single" ? { startDate: range.startDate, endDate: range.startDate } : range;
  }
  const preset = aliases[normalized];
  if (preset && preset !== "custom") {
    const range = getDateRangePreset(preset, safeToday);
    return mode === "single" ? { startDate: range.startDate, endDate: range.startDate } : range;
  }
  const monthRange = parseNaturalMonthToken(normalized, safeToday);
  if (monthRange) return mode === "single" ? { startDate: monthRange.startDate, endDate: monthRange.startDate } : monthRange;
  const rangeParts = normalized.split(/(?:~|至|到|—|–)/).map(part => part.trim()).filter(Boolean);
  if (rangeParts.length === 2) {
    const start = parseNaturalDateToken(rangeParts[0] || "", safeToday);
    const end = parseNaturalDateToken(rangeParts[1] || "", safeToday);
    if (start && end) return normalizeRange({ startDate: start, endDate: end });
  }
  const token = parseNaturalDateToken(normalized, safeToday);
  return token ? { startDate: token, endDate: token } : null;
}
