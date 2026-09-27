import {inventoryCategories, type InventoryFilters, type InventorySortDirection, type InventorySortKey, type InventoryRisk} from "@/src/types/inventory";
import {readDateRange} from "@/src/lib/dateRangePickerUtils";

export const defaultInventoryFilters: InventoryFilters = {
  keyword: "",
  category: "",
  brand: "",
  model: "",
  warehouseLocation: "",
  condition: "",
  inspectionStatus: "",
  status: "",
  entryStart: "",
  entryEnd: "",
  risk: "",
  minStorageDays: "",
  maxStorageDays: "",
  minProfitMargin: "",
  activeOnly: true,
  includeSold: false,
  page: 1,
  pageSize: 20,
  sortKey: "entryTime",
  sortDirection: "desc",
};

const sortKeys: readonly InventorySortKey[] = ["id", "product", "cost", "profit", "days", "status", "warehouseLocation", "entryTime"];
const riskValues: readonly InventoryRisk[] = ["mined", "upturned", "high"];

function text(params: URLSearchParams, key: string) {
  return params.get(key) || "";
}

function positiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseInventoryFilters(search: string): InventoryFilters {
  const params = new URLSearchParams(search);
  const dateRange = readDateRange(params, "entryStart", "entryEnd");
  const sortKeyValue = text(params, "sortKey");
  const riskValue = text(params, "risk");
  return {
    ...defaultInventoryFilters,
    keyword: text(params, "keyword"),
    category: inventoryCategories.includes(text(params, "category") as (typeof inventoryCategories)[number]) ? text(params, "category") as InventoryFilters["category"] : "",
    brand: text(params, "brand"),
    model: text(params, "model"),
    warehouseLocation: text(params, "warehouseLocation"),
    condition: text(params, "condition"),
    inspectionStatus: text(params, "inspectionStatus"),
    status: text(params, "status"),
    entryStart: dateRange.startDate,
    entryEnd: dateRange.endDate,
    risk: riskValues.includes(riskValue as InventoryRisk) ? riskValue as InventoryRisk : "",
    minStorageDays: text(params, "minStorageDays"),
    maxStorageDays: text(params, "maxStorageDays"),
    minProfitMargin: text(params, "minProfitMargin"),
    activeOnly: params.get("activeOnly") !== "false",
    includeSold: params.get("includeSold") === "true",
    page: positiveInt(params.get("page"), 1),
    pageSize: positiveInt(params.get("pageSize"), 20),
    sortKey: sortKeys.includes(sortKeyValue as InventorySortKey) ? sortKeyValue as InventorySortKey : "entryTime",
    sortDirection: params.get("sortDirection") === "asc" ? "asc" as InventorySortDirection : "desc" as InventorySortDirection,
  };
}

export function inventoryFiltersToSearch(filters: InventoryFilters) {
  const params = new URLSearchParams();
  const set = (key: string, value: string | number | boolean) => {
    if (value === "" || value === false || (key === "page" && value === 1) || (key === "pageSize" && value === 20) || (key === "sortKey" && value === "entryTime") || (key === "sortDirection" && value === "desc") || (key === "activeOnly" && value === true)) return;
    params.set(key, String(value));
  };
  set("keyword", filters.keyword);
  set("category", filters.category);
  set("brand", filters.brand);
  set("model", filters.model);
  set("warehouseLocation", filters.warehouseLocation);
  set("condition", filters.condition);
  set("inspectionStatus", filters.inspectionStatus);
  set("status", filters.status);
  set("entryStart", filters.entryStart);
  set("entryEnd", filters.entryEnd);
  set("risk", filters.risk);
  set("minStorageDays", filters.minStorageDays);
  set("maxStorageDays", filters.maxStorageDays);
  set("minProfitMargin", filters.minProfitMargin);
  set("activeOnly", filters.activeOnly);
  set("includeSold", filters.includeSold);
  set("page", filters.page);
  set("pageSize", filters.pageSize);
  set("sortKey", filters.sortKey);
  set("sortDirection", filters.sortDirection);
  return params;
}

export function inventorySummaryFilters(filters: InventoryFilters): InventoryFilters {
  return {...filters, page: 1, pageSize: 20, sortKey: "entryTime", sortDirection: "desc"};
}
