import type {SortingState} from "@tanstack/react-table";
import type {CustomerDirectoryFilters, CustomerDirectoryItem} from "@/src/types/customer";

export const defaultCustomerFilters: CustomerDirectoryFilters = {keyword: "", type: "all", channel: "all", level: "all", page: 1, pageSize: 20};

export function parseCustomerFilters(search: string): CustomerDirectoryFilters {
  const params = new URLSearchParams(search);
  const page = Number(params.get("page"));
  const pageSize = Number(params.get("pageSize"));
  return {
    keyword: params.get("keyword") || "",
    type: params.get("type") || "all",
    channel: params.get("channel") || "all",
    level: params.get("level") || "all",
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: [20, 50, 100].includes(pageSize) ? pageSize : 20,
  };
}

export function customerFiltersToSearch(filters: CustomerDirectoryFilters) {
  const params = new URLSearchParams();
  if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
  if (filters.type !== "all") params.set("type", filters.type);
  if (filters.channel !== "all") params.set("channel", filters.channel);
  if (filters.level !== "all") params.set("level", filters.level);
  if (filters.page > 1) params.set("page", String(filters.page));
  if (filters.pageSize !== 20) params.set("pageSize", String(filters.pageSize));
  return params;
}

function normalized(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN").replace(/\s+/g, " ");
}

export function filterCustomers(customers: CustomerDirectoryItem[], filters: CustomerDirectoryFilters) {
  const keyword = normalized(filters.keyword);
  return customers.filter((customer) => {
    if (filters.type !== "all" && customer.type !== filters.type) return false;
    if (filters.channel !== "all" && customer.source !== filters.channel) return false;
    if (filters.level !== "all" && customer.level !== filters.level) return false;
    if (!keyword) return true;
    return normalized([customer.id, customer.name, customer.contact, customer.phone || "", customer.wechat || "", customer.source, customer.type, customer.owner || "", customer.remarks || "", ...customer.tags].join(" ")).includes(keyword);
  });
}

export function sortCustomers(customers: CustomerDirectoryItem[], sorting: SortingState) {
  const rule = sorting[0];
  if (!rule) return [...customers].sort((left, right) => String(right.lastDealTime || "").localeCompare(String(left.lastDealTime || ""), "zh-CN", {numeric: true}));
  const direction = rule.desc ? -1 : 1;
  return [...customers].sort((left, right) => {
    const leftValue = left[rule.id as keyof CustomerDirectoryItem];
    const rightValue = right[rule.id as keyof CustomerDirectoryItem];
    if (typeof leftValue === "number" || typeof rightValue === "number") return (Number(leftValue || 0) - Number(rightValue || 0)) * direction;
    return String(leftValue || "").localeCompare(String(rightValue || ""), "zh-CN", {numeric: true}) * direction;
  });
}
