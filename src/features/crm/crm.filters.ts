import type {CrmAccountFilters} from "@/src/types/crm";

export const defaultCrmFilters: CrmAccountFilters = {keyword: "", owner: "", page: 1, pageSize: 20};

function positive(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseCrmFilters(search: string): CrmAccountFilters {
  const params = new URLSearchParams(search);
  const pageSize = positive(params.get("pageSize"), 20);
  return {keyword: params.get("q") || "", owner: params.get("owner") || "", page: positive(params.get("page"), 1), pageSize: [20, 50, 100].includes(pageSize) ? pageSize : 20};
}

export function crmFiltersToSearch(filters: CrmAccountFilters) {
  const params = new URLSearchParams();
  if (filters.keyword.trim()) params.set("q", filters.keyword.trim());
  if (filters.owner.trim()) params.set("owner", filters.owner.trim());
  if (filters.page !== 1) params.set("page", String(filters.page));
  if (filters.pageSize !== 20) params.set("pageSize", String(filters.pageSize));
  return params;
}
