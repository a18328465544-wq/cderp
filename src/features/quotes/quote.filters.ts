import type {SortingState} from "@tanstack/react-table";
import type {MarketQuoteFilters, MarketQuoteItem} from "@/src/types/quote";

export const defaultQuoteFilters: MarketQuoteFilters = {keyword: "", brand: "all", trend: "all", page: 1, pageSize: 20};

export function parseQuoteFilters(search: string): MarketQuoteFilters {
  const params = new URLSearchParams(search);
  const page = Number(params.get("page"));
  const pageSize = Number(params.get("pageSize"));
  const trend = params.get("trend");
  return {
    keyword: params.get("keyword") || "",
    brand: params.get("brand") || "all",
    trend: trend === "up" || trend === "down" || trend === "stable" ? trend : "all",
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: [20, 50, 100].includes(pageSize) ? pageSize : 20,
  };
}

export function quoteFiltersToSearch(filters: MarketQuoteFilters) {
  const params = new URLSearchParams();
  if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
  if (filters.brand !== "all") params.set("brand", filters.brand);
  if (filters.trend !== "all") params.set("trend", filters.trend);
  if (filters.page > 1) params.set("page", String(filters.page));
  if (filters.pageSize !== 20) params.set("pageSize", String(filters.pageSize));
  return params;
}

const normalized = (value: string) => value.trim().toLocaleLowerCase("zh-CN").replace(/\s+/g, " ");

export function filterQuotes(quotes: MarketQuoteItem[], filters: MarketQuoteFilters) {
  const keyword = normalized(filters.keyword);
  return quotes.filter((quote) => {
    if (filters.brand !== "all" && quote.brand !== filters.brand) return false;
    if (filters.trend !== "all" && quote.trend !== filters.trend) return false;
    if (!keyword) return true;
    const searchable = normalized([quote.id, quote.productName, quote.model, quote.brand, quote.version || "", quote.note || ""].join(" "));
    return keyword.split(" ").every((part) => searchable.includes(part));
  });
}

export function sortQuotes(quotes: MarketQuoteItem[], sorting: SortingState) {
  const rule = sorting[0];
  if (!rule) return [...quotes].sort((a, b) => String(b.updateTime || "").localeCompare(String(a.updateTime || "")));
  const direction = rule.desc ? -1 : 1;
  return [...quotes].sort((left, right) => {
    const leftValue = left[rule.id as keyof MarketQuoteItem];
    const rightValue = right[rule.id as keyof MarketQuoteItem];
    if (typeof leftValue === "number" || typeof rightValue === "number") return (Number(leftValue || 0) - Number(rightValue || 0)) * direction;
    return String(leftValue || "").localeCompare(String(rightValue || ""), "zh-CN", {numeric: true}) * direction;
  });
}
