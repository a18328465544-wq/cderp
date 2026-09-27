import type {SortingState} from "@tanstack/react-table";
import type {ProductLibraryFilters, ProductLibraryItem} from "@/src/types/product";

export const defaultProductFilters: ProductLibraryFilters = {keyword: "", category: "all", brand: "all", page: 1, pageSize: 20};

export function parseProductFilters(search: string): ProductLibraryFilters {
  const params = new URLSearchParams(search);
  const page = Number(params.get("page"));
  const pageSize = Number(params.get("pageSize"));
  return {
    keyword: params.get("keyword") || "",
    category: params.get("category") || "all",
    brand: params.get("brand") || "all",
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: [20, 50, 100].includes(pageSize) ? pageSize : 20,
  };
}

export function productFiltersToSearch(filters: ProductLibraryFilters) {
  const params = new URLSearchParams();
  if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
  if (filters.category !== "all") params.set("category", filters.category);
  if (filters.brand !== "all") params.set("brand", filters.brand);
  if (filters.page > 1) params.set("page", String(filters.page));
  if (filters.pageSize !== 20) params.set("pageSize", String(filters.pageSize));
  return params;
}

function normalized(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN").replace(/\s+/g, " ");
}

export function filterProducts(products: ProductLibraryItem[], filters: ProductLibraryFilters) {
  const keyword = normalized(filters.keyword);
  return products.filter((product) => {
    if (filters.category !== "all" && product.category !== filters.category) return false;
    if (filters.brand !== "all" && product.brand !== filters.brand) return false;
    if (!keyword) return true;
    return normalized([product.id, product.name, product.brand, product.model, product.version, product.vram, product.remarks || ""].join(" ")).includes(keyword);
  });
}

export function sortProducts(products: ProductLibraryItem[], sorting: SortingState) {
  const rule = sorting[0];
  if (!rule) return products;
  const direction = rule.desc ? -1 : 1;
  return [...products].sort((left, right) => {
    const leftValue = left[rule.id as keyof ProductLibraryItem];
    const rightValue = right[rule.id as keyof ProductLibraryItem];
    if (typeof leftValue === "number" || typeof rightValue === "number") return (Number(leftValue || 0) - Number(rightValue || 0)) * direction;
    return String(leftValue || "").localeCompare(String(rightValue || ""), "zh-CN", {numeric: true}) * direction;
  });
}
