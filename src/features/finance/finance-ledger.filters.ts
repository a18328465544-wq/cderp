import {financeLedgerDirections, type FinanceLedgerDirection, type FinanceLedgerFilters} from "@/src/types/finance-ledger";
import {readDateRange} from "@/src/lib/dateRangePickerUtils";

export const defaultFinanceLedgerFilters: FinanceLedgerFilters = {
  keyword: "",
  accountId: "all",
  handler: "",
  businessType: "all",
  direction: "all",
  relatedDocNo: "",
  customerName: "",
  supplierName: "",
  dateStart: "",
  dateEnd: "",
  page: 1,
  pageSize: 20,
};

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseFinanceLedgerFilters(search: string): FinanceLedgerFilters {
  const params = new URLSearchParams(search);
  const direction = params.get("direction");
  const pageSize = positiveInteger(params.get("pageSize"), 20);
  const dateRange = readDateRange(params, "dateStart", "dateEnd");
  return {
    keyword: (params.get("keyword") || "").trim(),
    accountId: (params.get("accountId") || "all").trim() || "all",
    handler: (params.get("handler") || "").trim(),
    businessType: (params.get("businessType") || "all").trim() || "all",
    direction: financeLedgerDirections.includes(direction as FinanceLedgerDirection) ? direction as FinanceLedgerDirection : "all",
    relatedDocNo: (params.get("relatedDocNo") || "").trim(),
    customerName: (params.get("customerName") || "").trim(),
    supplierName: (params.get("supplierName") || "").trim(),
    dateStart: dateRange.startDate,
    dateEnd: dateRange.endDate,
    page: positiveInteger(params.get("page"), 1),
    pageSize: [20, 50, 100].includes(pageSize) ? pageSize : 20,
  };
}

export function financeLedgerFiltersToSearch(filters: FinanceLedgerFilters) {
  const params = new URLSearchParams();
  if (filters.keyword) params.set("keyword", filters.keyword);
  if (filters.accountId !== "all") params.set("accountId", filters.accountId);
  if (filters.handler) params.set("handler", filters.handler);
  if (filters.businessType !== "all") params.set("businessType", filters.businessType);
  if (filters.direction !== "all") params.set("direction", filters.direction);
  if (filters.relatedDocNo) params.set("relatedDocNo", filters.relatedDocNo);
  if (filters.customerName) params.set("customerName", filters.customerName);
  if (filters.supplierName) params.set("supplierName", filters.supplierName);
  if (filters.dateStart) params.set("dateStart", filters.dateStart);
  if (filters.dateEnd) params.set("dateEnd", filters.dateEnd);
  if (filters.page > 1) params.set("page", String(filters.page));
  if (filters.pageSize !== 20) params.set("pageSize", String(filters.pageSize));
  return params;
}
