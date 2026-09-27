import type {
  PurchaseListFilters,
  PurchaseListItem,
  PurchaseListSelection,
  PurchaseListSortKey,
  PurchasePaymentStatus,
} from "@/src/types/purchase";
import {sourceTypeValues} from "@/src/types/core";
import type {SourceType} from "@/src/types/core";
import {purchasePaymentStatusValues} from "@/src/types/purchase";
import {readDateRange} from "@/src/lib/dateRangePickerUtils";

export const defaultPurchaseListFilters: PurchaseListFilters = {
  keyword: "",
  sourceType: "",
  paymentStatus: "",
  dateStart: "",
  dateEnd: "",
  page: 1,
  pageSize: 20,
  sortKey: "date",
  sortDirection: "desc",
};

const sourceTypes = sourceTypeValues;
const paymentStatuses = purchasePaymentStatusValues;
const sortKeys: readonly PurchaseListSortKey[] = ["date", "invoiceNo", "supplierName", "totalCount", "totalCost", "paymentStatus", "handleBy"];

function text(params: URLSearchParams, key: string) {
  return params.get(key) || "";
}

function positiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function parsePurchaseListFilters(search: string): PurchaseListFilters {
  const params = new URLSearchParams(search);
  const dateRange = readDateRange(params, "dateStart", "dateEnd");
  const sourceType = text(params, "sourceType");
  const paymentStatus = text(params, "paymentStatus");
  const sortKey = text(params, "sortKey");
  return {
    ...defaultPurchaseListFilters,
    keyword: text(params, "keyword"),
    sourceType: sourceTypes.includes(sourceType as SourceType) ? sourceType as SourceType : "",
    paymentStatus: paymentStatuses.includes(paymentStatus as PurchasePaymentStatus) ? paymentStatus as PurchasePaymentStatus : "",
    dateStart: dateRange.startDate,
    dateEnd: dateRange.endDate,
    page: positiveInt(params.get("page"), 1),
    pageSize: positiveInt(params.get("pageSize"), 20),
    sortKey: sortKeys.includes(sortKey as PurchaseListSortKey) ? sortKey as PurchaseListSortKey : "date",
    sortDirection: params.get("sortDirection") === "asc" ? "asc" : "desc",
  };
}

export function purchaseListFiltersToSearch(filters: PurchaseListFilters) {
  const params = new URLSearchParams();
  const set = (key: string, value: string | number) => {
    if (value === "" || (key === "page" && value === 1) || (key === "pageSize" && value === 20) || (key === "sortKey" && value === "date") || (key === "sortDirection" && value === "desc")) return;
    params.set(key, String(value));
  };
  set("keyword", filters.keyword);
  set("sourceType", filters.sourceType);
  set("paymentStatus", filters.paymentStatus);
  set("dateStart", filters.dateStart);
  set("dateEnd", filters.dateEnd);
  set("page", filters.page);
  set("pageSize", filters.pageSize);
  set("sortKey", filters.sortKey);
  set("sortDirection", filters.sortDirection);
  return params;
}

function compareItems(left: PurchaseListItem, right: PurchaseListItem, key: PurchaseListSortKey) {
  if (key === "totalCount" || key === "totalCost") return (left[key] ?? 0) - (right[key] ?? 0);
  return String(left[key] ?? "").localeCompare(String(right[key] ?? ""), "zh-CN", {numeric: true});
}

export function selectPurchaseList(items: readonly PurchaseListItem[], filters: PurchaseListFilters): PurchaseListSelection {
  const keyword = filters.keyword.trim().toLocaleLowerCase("zh-CN");
  const filteredItems = items.filter((item) => {
    if (keyword && !item.searchText.includes(keyword)) return false;
    if (filters.sourceType && item.sourceType !== filters.sourceType) return false;
    if (filters.paymentStatus && item.paymentStatus !== filters.paymentStatus) return false;
    if (filters.dateStart && item.date < filters.dateStart) return false;
    if (filters.dateEnd && item.date > filters.dateEnd) return false;
    return true;
  }).sort((left, right) => {
    const result = compareItems(left, right, filters.sortKey);
    return filters.sortDirection === "asc" ? result : -result;
  });
  const total = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  const page = Math.min(filters.page, totalPages);
  const start = (page - 1) * filters.pageSize;
  const costValues = filteredItems.map((item) => item.totalCost).filter((value): value is number => value !== undefined);
  const profitValues = filteredItems.map((item) => item.estTotalProfit).filter((value): value is number => value !== undefined);
  return {
    data: filteredItems.slice(start, start + filters.pageSize),
    filteredItems,
    meta: {total, page, pageSize: filters.pageSize, totalPages},
    summary: {
      orderCount: total,
      unitCount: filteredItems.reduce((sum, item) => sum + item.totalCount, 0),
      pendingPaymentCount: filteredItems.filter((item) => item.paymentStatus === "未付款" || item.paymentStatus === "部分付款").length,
      totalCost: costValues.length ? costValues.reduce((sum, value) => sum + value, 0) : undefined,
      estimatedProfit: profitValues.length ? profitValues.reduce((sum, value) => sum + value, 0) : undefined,
    },
  };
}

export function countActivePurchaseListFilters(filters: PurchaseListFilters) {
  return [filters.keyword, filters.sourceType, filters.paymentStatus, filters.dateStart, filters.dateEnd].filter(Boolean).length;
}
