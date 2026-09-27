import {orderPoolExceptionStages, orderPoolMainStages, orderPoolOrderTypes} from "@/src/types/order-pool";
import type {OrderPoolFilters, OrderPoolQueue, OrderPoolStage, OrderPoolOrderType} from "@/src/types/order-pool";

export const defaultOrderPoolFilters: OrderPoolFilters = {
  keyword: "",
  orderType: "all",
  mainStage: "all",
  owner: "",
  queue: "mine",
  page: 1,
  pageSize: 20,
};

const stages: readonly OrderPoolStage[] = [...orderPoolMainStages, ...orderPoolExceptionStages];
const orderTypes: readonly OrderPoolOrderType[] = orderPoolOrderTypes;
const queues: readonly OrderPoolQueue[] = ["mine", "all", "unassigned", "waiting_customer", "due_today", "overdue", "exceptions"];

function positive(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseOrderPoolFilters(search: string): OrderPoolFilters {
  const params = new URLSearchParams(search);
  const orderType = params.get("orderType") || "all";
  const mainStage = params.get("mainStage") || "all";
  const queue = params.get("queue") || "mine";
  const pageSize = positive(params.get("pageSize"), 20);
  return {
    keyword: (params.get("keyword") || "").trim(),
    orderType: orderTypes.includes(orderType as OrderPoolOrderType) ? orderType as OrderPoolOrderType : "all",
    mainStage: stages.includes(mainStage as OrderPoolStage) ? mainStage as OrderPoolStage : "all",
    owner: (params.get("owner") || "").trim(),
    queue: queues.includes(queue as OrderPoolQueue) ? queue as OrderPoolQueue : "mine",
    page: positive(params.get("page"), 1),
    pageSize: [20, 50, 100].includes(pageSize) ? pageSize : 20,
  };
}

export function orderPoolFiltersToSearch(filters: OrderPoolFilters) {
  const params = new URLSearchParams();
  if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
  if (filters.orderType !== "all") params.set("orderType", filters.orderType);
  if (filters.mainStage !== "all") params.set("mainStage", filters.mainStage);
  if (filters.owner.trim()) params.set("owner", filters.owner.trim());
  if (filters.queue !== "mine") params.set("queue", filters.queue);
  if (filters.page > 1) params.set("page", String(filters.page));
  if (filters.pageSize !== 20) params.set("pageSize", String(filters.pageSize));
  return params;
}

export function countActiveOrderPoolFilters(filters: OrderPoolFilters) {
  return [filters.keyword.trim(), filters.orderType !== "all" ? filters.orderType : "", filters.mainStage !== "all" ? filters.mainStage : "", filters.owner.trim(), filters.queue !== "mine" ? filters.queue : ""].filter(Boolean).length;
}
