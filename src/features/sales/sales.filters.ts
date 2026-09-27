import {salesChannelValues, salesOutboundStatusValues, salesPaymentStatusValues} from "@/src/types/sales";
import type {SalesChannel, SalesListFilters, SalesListItem, SalesListSelection, SalesListSortKey, SalesOutboundStatus, SalesPaymentStatus} from "@/src/types/sales";
import {readDateRange} from "@/src/lib/dateRangePickerUtils";

export const defaultSalesListFilters: SalesListFilters = {
  keyword: "",
  channel: "",
  paymentStatus: "",
  outboundStatus: "",
  dateStart: "",
  dateEnd: "",
  page: 1,
  pageSize: 20,
  sortKey: "date",
  sortDirection: "desc",
};

const channels = salesChannelValues;
const paymentStatuses = salesPaymentStatusValues;
const outboundStatuses = salesOutboundStatusValues;
const sortKeys: readonly SalesListSortKey[] = ["date", "invoiceNo", "customerName", "totalCount", "totalAmount", "totalProfit", "paymentStatus", "outboundStatus", "handleBy"];

function text(params: URLSearchParams, key: string) {
  return params.get(key) || "";
}

function positiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseSalesListFilters(search: string): SalesListFilters {
  const params = new URLSearchParams(search);
  const dateRange = readDateRange(params, "dateStart", "dateEnd");
  const channel = text(params, "channel");
  const paymentStatus = text(params, "paymentStatus");
  const outboundStatus = text(params, "outboundStatus");
  const sortKey = text(params, "sortKey");
  return {
    ...defaultSalesListFilters,
    keyword: text(params, "keyword"),
    channel: channels.includes(channel as SalesChannel) ? channel as SalesChannel : "",
    paymentStatus: paymentStatuses.includes(paymentStatus as SalesPaymentStatus) ? paymentStatus as SalesPaymentStatus : "",
    outboundStatus: outboundStatuses.includes(outboundStatus as SalesOutboundStatus) ? outboundStatus as SalesOutboundStatus : "",
    dateStart: dateRange.startDate,
    dateEnd: dateRange.endDate,
    page: positiveInt(params.get("page"), 1),
    pageSize: positiveInt(params.get("pageSize"), 20),
    sortKey: sortKeys.includes(sortKey as SalesListSortKey) ? sortKey as SalesListSortKey : "date",
    sortDirection: params.get("sortDirection") === "asc" ? "asc" : "desc",
  };
}

export function salesListFiltersToSearch(filters: SalesListFilters) {
  const params = new URLSearchParams();
  const set = (key: string, value: string | number) => {
    if (value === "" || (key === "page" && value === 1) || (key === "pageSize" && value === 20) || (key === "sortKey" && value === "date") || (key === "sortDirection" && value === "desc")) return;
    params.set(key, String(value));
  };
  set("keyword", filters.keyword);
  set("channel", filters.channel);
  set("paymentStatus", filters.paymentStatus);
  set("outboundStatus", filters.outboundStatus);
  set("dateStart", filters.dateStart);
  set("dateEnd", filters.dateEnd);
  set("page", filters.page);
  set("pageSize", filters.pageSize);
  set("sortKey", filters.sortKey);
  set("sortDirection", filters.sortDirection);
  return params;
}

function compareItems(left: SalesListItem, right: SalesListItem, key: SalesListSortKey) {
  if (key === "totalCount" || key === "totalAmount" || key === "totalProfit") return (left[key] ?? 0) - (right[key] ?? 0);
  return String(left[key] ?? "").localeCompare(String(right[key] ?? ""), "zh-CN", {numeric: true});
}

export function selectSalesList(items: readonly SalesListItem[], filters: SalesListFilters): SalesListSelection {
  const keyword = filters.keyword.trim().toLocaleLowerCase("zh-CN");
  const filteredItems = items.filter((item) => {
    if (keyword && !item.searchText.includes(keyword)) return false;
    if (filters.channel && item.channel !== filters.channel) return false;
    if (filters.paymentStatus && item.paymentStatus !== filters.paymentStatus) return false;
    if (filters.outboundStatus && item.outboundStatus !== filters.outboundStatus) return false;
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
  const profitValues = filteredItems.map((item) => item.totalProfit).filter((value): value is number => value !== undefined);
  return {
    data: filteredItems.slice(start, start + filters.pageSize),
    filteredItems,
    meta: {total, page, pageSize: filters.pageSize, totalPages},
    summary: {
      orderCount: total,
      unitCount: filteredItems.reduce((sum, item) => sum + item.totalCount, 0),
      pendingPaymentCount: filteredItems.filter((item) => item.paymentStatus === "未收款" || item.paymentStatus === "部分收款").length,
      pendingOutboundCount: filteredItems.filter((item) => item.outboundStatus === "待出库").length,
      totalAmount: filteredItems.reduce((sum, item) => sum + item.totalAmount, 0),
      totalProfit: profitValues.length ? profitValues.reduce((sum, value) => sum + value, 0) : undefined,
    },
  };
}

export function countActiveSalesListFilters(filters: SalesListFilters) {
  return [filters.keyword, filters.channel, filters.paymentStatus, filters.outboundStatus, filters.dateStart, filters.dateEnd].filter(Boolean).length;
}
