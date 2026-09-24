import type {FinanceIncomeFilters} from "@/src/types/finance-income";
import {readDateRange} from "@/src/lib/dateRangePickerUtils";

export const defaultFinanceIncomeFilters: FinanceIncomeFilters = {keyword: "", businessType: "all", accountId: "all", handler: "", startDate: "", endDate: "", page: 1, pageSize: 20};
const financeIncomeSortKeys = ["time", "businessType", "source", "amount", "accountName", "paymentMethod", "referenceNo", "handler", "remarks"] as const;
function positive(value: string | null, fallback: number) {const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;}

export function parseFinanceIncomeFilters(search: string): FinanceIncomeFilters {
  const params = new URLSearchParams(search);
  const pageSize = positive(params.get("pageSize"), 20);
  const dateRange = readDateRange(params, "startDate", "endDate");
  const rawBusinessType = (params.get("businessType") || "all").trim() || "all";
  // Purchase refunds used to be exposed by this screen. Normalize old URLs so
  // a bookmarked legacy filter cannot render an empty, misleading category.
  const businessType = rawBusinessType === "采购退款" ? "all" : rawBusinessType;
  const rawSortKey = (params.get("sortKey") || "").trim();
  const sortKey = financeIncomeSortKeys.includes(rawSortKey as (typeof financeIncomeSortKeys)[number]) ? rawSortKey : "";
  const rawDirection = params.get("sortDirection");
  const sortDirection = rawDirection === "asc" || rawDirection === "desc" ? rawDirection : undefined;
  return {keyword: (params.get("keyword") || "").trim(), businessType, accountId: (params.get("accountId") || "all").trim() || "all", handler: (params.get("handler") || "").trim(), ...dateRange, page: positive(params.get("page"), 1), pageSize: [20, 50, 100].includes(pageSize) ? pageSize : 20, ...(sortKey ? {sortKey, sortDirection: sortDirection || "desc"} : {})};
}

export function financeIncomeFiltersToSearch(filters: FinanceIncomeFilters) {
  const params = new URLSearchParams();
  if (filters.keyword) params.set("keyword", filters.keyword);
  if (filters.businessType !== "all") params.set("businessType", filters.businessType);
  if (filters.accountId !== "all") params.set("accountId", filters.accountId);
  if (filters.handler) params.set("handler", filters.handler);
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
  if (filters.page > 1) params.set("page", String(filters.page));
  if (filters.pageSize !== 20) params.set("pageSize", String(filters.pageSize));
  if (filters.sortKey) {params.set("sortKey", filters.sortKey); params.set("sortDirection", filters.sortDirection || "desc");}
  return params;
}
