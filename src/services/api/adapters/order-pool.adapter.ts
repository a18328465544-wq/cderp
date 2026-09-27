import type {CustomerOrder, OrderPoolCollection, OrderPoolCollaboratorOption, OrderPoolSummary} from "@/src/types/order-pool";
import type {OrderPoolCollaboratorsResponseDto, OrderPoolCollectionResponseDto, OrderPoolMutationResponseDto} from "../dto/order-pool.dto";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function number(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function order(value: unknown): CustomerOrder | null {
  const record = object(value);
  if (typeof record.id !== "string" || typeof record.orderNo !== "string" || typeof record.customerName !== "string") return null;
  return record as unknown as CustomerOrder;
}

function summary(value: unknown): OrderPoolSummary {
  const record = object(value);
  return {
    total: number(record.total, 0),
    pendingClaim: number(record.pendingClaim, 0),
    following: number(record.following, 0),
    waitingCustomer: number(record.waitingCustomer, 0),
    pendingExecution: number(record.pendingExecution, 0),
    completed: number(record.completed, 0),
    exceptions: number(record.exceptions, 0),
    mine: number(record.mine, 0),
    unassigned: number(record.unassigned, 0),
    dueToday: number(record.dueToday, 0),
    overdue: number(record.overdue, 0),
  };
}

export function adaptOrderPoolCollection(response: OrderPoolCollectionResponseDto): OrderPoolCollection {
  const payload = object(response.data);
  const items = Array.isArray(payload.items) ? payload.items.flatMap((item) => { const parsed = order(item); return parsed ? [parsed] : []; }) : [];
  return {
    items,
    page: number(payload.page, 1),
    pageSize: number(payload.pageSize, 20),
    total: number(payload.total, items.length),
    summary: summary(payload.summary),
  };
}

export function adaptOrderPoolMutation(response: OrderPoolMutationResponseDto): CustomerOrder {
  const parsed = order(response.data);
  if (!parsed) throw new Error("订单池接口返回的数据无效");
  return parsed;
}

export function adaptOrderPoolCollaborators(response: OrderPoolCollaboratorsResponseDto): OrderPoolCollaboratorOption[] {
  return (Array.isArray(response.data) ? response.data : []).flatMap((value) => {
    const record = object(value);
    if (typeof record.id !== "string" || typeof record.displayName !== "string") return [];
    return [{
      id: record.id,
      displayName: record.displayName,
      role: typeof record.role === "string" ? record.role : "成员",
    }];
  });
}
