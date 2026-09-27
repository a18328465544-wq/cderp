import type {AssemblyOperationFilters} from "@/src/types/assembly";

export const defaultAssemblyFilters: AssemblyOperationFilters = {keyword: "", type: "all", handler: "", page: 1, pageSize: 20};

function positive(value: string | null, fallback: number) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

export function parseAssemblyFilters(search: string): AssemblyOperationFilters {
  const params = new URLSearchParams(search);
  const type = params.get("type");
  const pageSize = positive(params.get("pageSize"), 20);
  return {keyword: params.get("q") || "", type: type === "拆卸" || type === "组装" ? type : "all", handler: params.get("handler") || "", page: positive(params.get("page"), 1), pageSize: [20, 50, 100].includes(pageSize) ? pageSize : 20};
}

export function assemblyFiltersToSearch(filters: AssemblyOperationFilters) {
  const params = new URLSearchParams();
  if (filters.keyword.trim()) params.set("q", filters.keyword.trim());
  if (filters.type !== "all") params.set("type", filters.type);
  if (filters.handler.trim()) params.set("handler", filters.handler.trim());
  if (filters.page !== 1) params.set("page", String(filters.page));
  if (filters.pageSize !== 20) params.set("pageSize", String(filters.pageSize));
  return params;
}

