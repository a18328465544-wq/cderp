import type {SortingState} from "@tanstack/react-table";
import {financeAccountTypes, type FinanceAccountFilters, type FinanceAccountItem, type FinanceAccountType} from "@/src/types/finance-account";

export const defaultFinanceAccountFilters: FinanceAccountFilters = {keyword: "", owner: "", platform: "", type: "all", status: "all", page: 1, pageSize: 20};

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseFinanceAccountFilters(search: string): FinanceAccountFilters {
  const params = new URLSearchParams(search);
  const rawType = params.get("type");
  const rawStatus = params.get("status");
  const pageSize = positiveInteger(params.get("pageSize"), defaultFinanceAccountFilters.pageSize);
  return {
    keyword: (params.get("keyword") || "").trim(),
    owner: (params.get("owner") || "").trim(),
    platform: (params.get("platform") || "").trim(),
    type: financeAccountTypes.includes(rawType as FinanceAccountType) ? rawType as FinanceAccountType : "all",
    status: rawStatus === "enabled" || rawStatus === "disabled" || rawStatus === "pending" || rawStatus === "difference" ? rawStatus : "all",
    page: positiveInteger(params.get("page"), 1),
    pageSize: [20, 50, 100].includes(pageSize) ? pageSize : 20,
  };
}

export function financeAccountFiltersToSearch(filters: FinanceAccountFilters) {
  const params = new URLSearchParams();
  if (filters.keyword) params.set("keyword", filters.keyword);
  if (filters.owner) params.set("owner", filters.owner);
  if (filters.platform) params.set("platform", filters.platform);
  if (filters.type !== "all") params.set("type", filters.type);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.page > 1) params.set("page", String(filters.page));
  if (filters.pageSize !== 20) params.set("pageSize", String(filters.pageSize));
  return params;
}

export function filterFinanceAccounts(accounts: FinanceAccountItem[], filters: FinanceAccountFilters) {
  const keyword = filters.keyword.toLocaleLowerCase("zh-CN");
  const owner = filters.owner.toLocaleLowerCase("zh-CN");
  const platform = filters.platform.toLocaleLowerCase("zh-CN");
  return accounts.filter((account) => {
    if (filters.type !== "all" && account.type !== filters.type) return false;
    if (filters.status === "enabled" && !account.enabled) return false;
    if (filters.status === "disabled" && account.enabled) return false;
    if (filters.status === "pending" && !(account.enabled && account.actualBalance === undefined && account.frozenAmount <= 0 && !(account.difference !== undefined && Math.abs(account.difference) > 0.009))) return false;
    if (filters.status === "difference" && !(account.difference !== undefined && Math.abs(account.difference) > 0.009)) return false;
    if (owner && !account.owner.toLocaleLowerCase("zh-CN").includes(owner)) return false;
    if (platform && !account.platform.toLocaleLowerCase("zh-CN").includes(platform)) return false;
    if (!keyword) return true;
    return [account.id, account.name, account.type, account.owner, account.platform, account.remarks].some((value) => value?.toLocaleLowerCase("zh-CN").includes(keyword));
  });
}

export function sortFinanceAccounts(accounts: FinanceAccountItem[], sorting: SortingState) {
  const rule = sorting[0];
  if (!rule) return accounts;
  const value = (account: FinanceAccountItem) => {
    switch (rule.id) {
      case "name": return account.name;
      case "type": return account.type;
      case "balance": return account.balance;
      case "availableBalance": return account.availableBalance;
      case "frozenAmount": return account.frozenAmount;
      case "difference": return account.difference ?? Number.NEGATIVE_INFINITY;
      case "lastChangeTime": return account.lastChangeTime || "";
      default: return account.name;
    }
  };
  return [...accounts].sort((left, right) => {
    const a = value(left); const b = value(right);
    const comparison = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "zh-CN");
    return rule.desc ? -comparison : comparison;
  });
}
