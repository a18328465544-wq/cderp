import type {SortingState} from "@tanstack/react-table";
import {aftersalesStatuses, aftersalesTypes, type AftersalesFilters, type AftersalesListItem, type AftersalesStatus, type AftersalesType} from "@/src/types/aftersales";

export const defaultAftersalesFilters: AftersalesFilters = {keyword: "", status: "all", type: "all", page: 1, pageSize: 20};

export function parseAftersalesFilters(search: string): AftersalesFilters {
  const params = new URLSearchParams(search);
  const status = params.get("status"); const type = params.get("type"); const page = Number(params.get("page")); const pageSize = Number(params.get("pageSize"));
  return {keyword: params.get("keyword") || "", status: aftersalesStatuses.includes(status as AftersalesStatus) ? status as AftersalesStatus : "all", type: aftersalesTypes.includes(type as AftersalesType) ? type as AftersalesType : "all", page: Number.isInteger(page) && page > 0 ? page : 1, pageSize: [20, 50, 100].includes(pageSize) ? pageSize : 20};
}

export function aftersalesFiltersToSearch(filters: AftersalesFilters) {
  const params = new URLSearchParams(); if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim()); if (filters.status !== "all") params.set("status", filters.status); if (filters.type !== "all") params.set("type", filters.type); if (filters.page > 1) params.set("page", String(filters.page)); if (filters.pageSize !== 20) params.set("pageSize", String(filters.pageSize)); return params;
}

function normalized(value: string) {return value.trim().toLocaleLowerCase("zh-CN").replace(/\s+/g, " ");}
export function filterAftersales(items: AftersalesListItem[], filters: AftersalesFilters) {
  const keyword = normalized(filters.keyword);
  return items.filter((item) => {if (filters.status !== "all" && item.status !== filters.status) return false; if (filters.type !== "all" && item.type !== filters.type) return false; if (!keyword) return true; return normalized([item.id, item.salesInvoiceNo, item.customerName, item.contact, item.inventoryNo, item.productName, item.model || "", item.serialNumber, item.description, item.finalResult, item.handler || ""].join(" ")).includes(keyword);});
}

export function sortAftersales(items: AftersalesListItem[], sorting: SortingState) {
  const rule = sorting[0]; if (!rule) return [...items].sort((left, right) => right.createdAt.localeCompare(left.createdAt, "zh-CN", {numeric: true}));
  const direction = rule.desc ? -1 : 1;
  return [...items].sort((left, right) => {const a = left[rule.id as keyof AftersalesListItem]; const b = right[rule.id as keyof AftersalesListItem]; if (typeof a === "number" || typeof b === "number") return (Number(a || 0) - Number(b || 0)) * direction; return String(a || "").localeCompare(String(b || ""), "zh-CN", {numeric: true}) * direction;});
}
