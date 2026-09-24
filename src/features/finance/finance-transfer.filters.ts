import type {FinanceTransferFilters} from "@/src/types/finance-transfer";
import {readDateRange} from "@/src/lib/dateRangePickerUtils";

export const defaultFinanceTransferFilters: FinanceTransferFilters = {keyword: "", accountId: "all", handler: "", startDate: "", endDate: "", page: 1, pageSize: 20};
const financeTransferSortKeys = ["time", "fromAccountName", "toAccountName", "amount", "fee", "receivedAmount", "handler", "remarks"] as const;

function positive(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseFinanceTransferFilters(search: string): FinanceTransferFilters {
  const params = new URLSearchParams(search);
  const pageSize = positive(params.get("pageSize"), 20);
  const dateRange = readDateRange(params, "startDate", "endDate");
  const rawSortKey = (params.get("sortKey") || "").trim();
  const sortKey = financeTransferSortKeys.includes(rawSortKey as (typeof financeTransferSortKeys)[number]) ? rawSortKey : "";
  const rawDirection = params.get("sortDirection");
  const sortDirection = rawDirection === "asc" || rawDirection === "desc" ? rawDirection : undefined;
  return {
    keyword: (params.get("keyword") || "").trim(),
    accountId: (params.get("accountId") || "all").trim() || "all",
    handler: (params.get("handler") || "").trim(),
    ...dateRange,
    page: positive(params.get("page"), 1),
    pageSize: [20, 50, 100].includes(pageSize) ? pageSize : 20,
    ...(sortKey ? {sortKey, sortDirection: sortDirection || "desc"} : {}),
  };
}

export function financeTransferFiltersToSearch(filters: FinanceTransferFilters) {
  const params = new URLSearchParams();
  if (filters.keyword) params.set("keyword", filters.keyword);
  if (filters.accountId !== "all") params.set("accountId", filters.accountId);
  if (filters.handler) params.set("handler", filters.handler);
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
  if (filters.page > 1) params.set("page", String(filters.page));
  if (filters.pageSize !== 20) params.set("pageSize", String(filters.pageSize));
  if (filters.sortKey) {params.set("sortKey", filters.sortKey); params.set("sortDirection", filters.sortDirection || "desc");}
  return params;
}
