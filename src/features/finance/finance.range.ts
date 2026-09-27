import type {FinanceDateRange} from "@/src/types/finance";
import {storeDate, storeDateAfterDays} from "@/src/utils/storeTime";
import {readDateRange, validateDateRange} from "@/src/lib/dateRangePickerUtils";

export function defaultFinanceRange(): FinanceDateRange {
  return {startDate: storeDateAfterDays(-6), endDate: storeDate()};
}

export function financeRangeForDays(days: 7 | 30 | 90): FinanceDateRange {
  return {startDate: storeDateAfterDays(-(days - 1)), endDate: storeDate()};
}

export function parseFinanceRange(search: string): FinanceDateRange {
  const fallback = defaultFinanceRange();
  const params = new URLSearchParams(search);
  const parsed = readDateRange(params, "start", "end");
  const range = {
    startDate: parsed.startDate || fallback.startDate,
    endDate: parsed.endDate || fallback.endDate,
  };
  return validateFinanceRange(range) ? fallback : range;
}

export function financeRangeToSearch(range: FinanceDateRange) {
  const params = new URLSearchParams();
  const fallback = defaultFinanceRange();
  if (range.startDate !== fallback.startDate) params.set("start", range.startDate);
  if (range.endDate !== fallback.endDate) params.set("end", range.endDate);
  return params;
}

export function validateFinanceRange(range: FinanceDateRange) {
  return validateDateRange(range, 366) || (!range.startDate || !range.endDate ? "请选择有效日期" : null);
}
