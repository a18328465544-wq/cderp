import {returnOrderStatusValues} from "@/src/types/returns";
import type {SalesReturnListFilters, SalesReturnStatus} from "@/src/types/returns";

export const defaultSalesReturnListFilters: SalesReturnListFilters = {
  keyword: "",
  status: "",
  page: 1,
  pageSize: 20,
};

const statuses = returnOrderStatusValues;
const returnSortKeys = ["returnNo", "relatedDocNo", "partyName", "productName", "amount", "settlementMode", "inventoryAction", "status", "handler"] as const;

function positiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseSalesReturnListFilters(search: string): SalesReturnListFilters {
  const params = new URLSearchParams(search);
  const status = params.get("status") || "";
  const rawSortKey = (params.get("sortKey") || "").trim();
  const sortKey = returnSortKeys.includes(rawSortKey as (typeof returnSortKeys)[number]) ? rawSortKey : "";
  const rawDirection = params.get("sortDirection");
  const sortDirection = rawDirection === "asc" || rawDirection === "desc" ? rawDirection : undefined;
  return {
    keyword: params.get("keyword") || "",
    status: statuses.includes(status as SalesReturnStatus) ? status as SalesReturnStatus : "",
    page: positiveInt(params.get("page"), 1),
    pageSize: positiveInt(params.get("pageSize"), 20),
    ...(sortKey ? {sortKey, sortDirection: sortDirection || "desc"} : {}),
  };
}

export function salesReturnListFiltersToSearch(filters: SalesReturnListFilters) {
  const params = new URLSearchParams();
  if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
  if (filters.status) params.set("status", filters.status);
  if (filters.page !== 1) params.set("page", String(filters.page));
  if (filters.pageSize !== 20) params.set("pageSize", String(filters.pageSize));
  if (filters.sortKey) {params.set("sortKey", filters.sortKey); params.set("sortDirection", filters.sortDirection || "desc");}
  return params;
}

export function countActiveSalesReturnFilters(filters: SalesReturnListFilters) {
  return [filters.keyword, filters.status].filter(Boolean).length;
}
