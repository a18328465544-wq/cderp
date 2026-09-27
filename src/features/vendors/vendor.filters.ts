import type {SortingState} from "@tanstack/react-table";
import type {VendorDirectoryFilters, VendorDirectoryItem} from "@/src/types/vendor";

export const defaultVendorFilters: VendorDirectoryFilters = {keyword: "", type: "all", level: "all", balance: "all", page: 1, pageSize: 20};

export function parseVendorFilters(search: string): VendorDirectoryFilters {
  const params = new URLSearchParams(search);
  const page = Number(params.get("page"));
  const pageSize = Number(params.get("pageSize"));
  const balance = params.get("balance");
  return {
    keyword: params.get("keyword") || "",
    type: params.get("type") || "all",
    level: params.get("level") || "all",
    balance: balance === "payable" || balance === "receivable" || balance === "credit" ? balance : "all",
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: [20, 50, 100].includes(pageSize) ? pageSize : 20,
  };
}

export function vendorFiltersToSearch(filters: VendorDirectoryFilters) {
  const params = new URLSearchParams();
  if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
  if (filters.type !== "all") params.set("type", filters.type);
  if (filters.level !== "all") params.set("level", filters.level);
  if (filters.balance !== "all") params.set("balance", filters.balance);
  if (filters.page > 1) params.set("page", String(filters.page));
  if (filters.pageSize !== 20) params.set("pageSize", String(filters.pageSize));
  return params;
}

function normalized(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN").replace(/\s+/g, " ");
}

export function filterVendors(vendors: VendorDirectoryItem[], filters: VendorDirectoryFilters) {
  const keyword = normalized(filters.keyword);
  return vendors.filter((vendor) => {
    if (filters.type !== "all" && vendor.type !== filters.type) return false;
    if (filters.level !== "all" && vendor.level !== filters.level) return false;
    if (filters.balance === "payable" && vendor.payableBalance <= 0) return false;
    if (filters.balance === "receivable" && vendor.receivableBalance <= 0) return false;
    if (filters.balance === "credit" && vendor.returnCreditBalance <= 0) return false;
    if (!keyword) return true;
    return normalized([vendor.id, vendor.name, vendor.contact, vendor.contactPerson, vendor.phone, vendor.type, vendor.level, vendor.remarks || "", vendor.riskReason || ""].join(" ")).includes(keyword);
  });
}

export function sortVendors(vendors: VendorDirectoryItem[], sorting: SortingState) {
  const rule = sorting[0];
  if (!rule) return [...vendors].sort((left, right) => String(right.lastDealTime || "").localeCompare(String(left.lastDealTime || ""), "zh-CN", {numeric: true}));
  const direction = rule.desc ? -1 : 1;
  return [...vendors].sort((left, right) => {
    const leftValue = left[rule.id as keyof VendorDirectoryItem];
    const rightValue = right[rule.id as keyof VendorDirectoryItem];
    if (typeof leftValue === "number" || typeof rightValue === "number") return (Number(leftValue || 0) - Number(rightValue || 0)) * direction;
    return String(leftValue || "").localeCompare(String(rightValue || ""), "zh-CN", {numeric: true}) * direction;
  });
}
