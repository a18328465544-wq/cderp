import type {FinanceDailyClosing} from "@/src/types/finance-closing";
import {readDateRange} from "@/src/lib/dateRangePickerUtils";

export interface FinanceClosingFilters {
  dateStart: string;
  dateEnd: string;
  keyword: string;
  page: number;
  pageSize: number;
}

export interface FinanceClosingReport {
  rows: FinanceDailyClosing[];
  pageRows: FinanceDailyClosing[];
  meta: {total: number; page: number; pageSize: number; totalPages: number};
  summary: {
    income: number;
    expense: number;
    netCash: number;
    unreviewed: number;
    reconciliationDifferences: number;
    receivable: number;
    payable: number;
  };
}

export const defaultFinanceClosingFilters: FinanceClosingFilters = {
  dateStart: "",
  dateEnd: "",
  keyword: "",
  page: 1,
  pageSize: 20,
};

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseFinanceClosingFilters(search: string): FinanceClosingFilters {
  const params = new URLSearchParams(search);
  const dateRange = readDateRange(params, "dateStart", "dateEnd");
  const pageSize = positiveInteger(params.get("pageSize"), defaultFinanceClosingFilters.pageSize);
  return {
    ...defaultFinanceClosingFilters,
    dateStart: dateRange.startDate,
    dateEnd: dateRange.endDate,
    keyword: (params.get("keyword") || "").trim(),
    page: positiveInteger(params.get("page"), defaultFinanceClosingFilters.page),
    pageSize: [20, 50, 100].includes(pageSize) ? pageSize : defaultFinanceClosingFilters.pageSize,
  };
}

export function financeClosingFiltersToSearch(filters: FinanceClosingFilters) {
  const params = new URLSearchParams();
  if (filters.dateStart) params.set("dateStart", filters.dateStart);
  if (filters.dateEnd) params.set("dateEnd", filters.dateEnd);
  if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
  if (filters.page > 1) params.set("page", String(filters.page));
  if (filters.pageSize !== defaultFinanceClosingFilters.pageSize) params.set("pageSize", String(filters.pageSize));
  return params;
}

export function countActiveFinanceClosingFilters(filters: FinanceClosingFilters) {
  return [filters.dateStart, filters.dateEnd, filters.keyword.trim()].filter(Boolean).length;
}

function normalized(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN");
}

function matches(item: FinanceDailyClosing, filters: FinanceClosingFilters, keyword: string) {
  if (filters.dateStart && item.date < filters.dateStart) return false;
  if (filters.dateEnd && item.date > filters.dateEnd) return false;
  if (!keyword) return true;
  const haystack = normalized([item.id, item.date, item.closedAt, item.closedBy, item.remarks || ""].join(" "));
  return haystack.includes(keyword);
}

export function selectFinanceClosingReport(items: readonly FinanceDailyClosing[], filters: FinanceClosingFilters): FinanceClosingReport {
  const keyword = normalized(filters.keyword);
  const rows = items.filter((item) => matches(item, filters, keyword)).sort((left, right) => right.date.localeCompare(left.date) || right.closedAt.localeCompare(left.closedAt) || right.id.localeCompare(left.id));
  const totalPages = Math.max(1, Math.ceil(rows.length / filters.pageSize));
  const page = Math.min(filters.page, totalPages);
  const start = (page - 1) * filters.pageSize;
  const summary = rows.reduce((total, item) => ({
    income: total.income + item.snapshot.income,
    expense: total.expense + item.snapshot.expense,
    netCash: total.netCash + item.snapshot.netCash,
    unreviewed: total.unreviewed + item.snapshot.unreviewed,
    reconciliationDifferences: total.reconciliationDifferences + item.snapshot.accountReconciliationDifferences,
    receivable: total.receivable + item.snapshot.receivable,
    payable: total.payable + item.snapshot.payable,
  }), {income: 0, expense: 0, netCash: 0, unreviewed: 0, reconciliationDifferences: 0, receivable: 0, payable: 0});
  return {rows, pageRows: rows.slice(start, start + filters.pageSize), meta: {total: rows.length, page, pageSize: filters.pageSize, totalPages}, summary};
}

export function financeClosingStatus(item: FinanceDailyClosing) {
  if (item.snapshot.unreviewed > 0) return "danger" as const;
  if (item.snapshot.accountReconciliationDifferences > 0 || item.snapshot.receivable > 0 || item.snapshot.payable > 0) return "warning" as const;
  return "success" as const;
}

export function financeClosingStatusLabel(item: FinanceDailyClosing) {
  if (item.snapshot.unreviewed > 0) return "待复核";
  if (item.snapshot.accountReconciliationDifferences > 0) return "需对账";
  if (item.snapshot.receivable > 0 || item.snapshot.payable > 0) return "有待办";
  return "已完成";
}
