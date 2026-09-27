import {
  orderPoolBlockers,
  orderPoolExceptionStages,
  orderPoolInactiveStageValues,
  orderPoolMainStages,
  orderPoolOrderTypes,
  type CustomerOrder,
  type OrderPoolBlocker,
  type OrderPoolOrderType,
  type OrderPoolQueue,
  type OrderPoolStage,
} from "@/src/types/order-pool";
import {formatStoreDateTime, isStoreDateTimeBeforeNow, storeDate} from "@/src/utils/storeTime";

export const orderPoolMainStageOptions = orderPoolMainStages.map((value) => ({value, label: value}));
export const orderPoolStageOptions = [...orderPoolMainStages, ...orderPoolExceptionStages].map((value) => ({value, label: value}));
export const orderPoolOrderTypeOptions = orderPoolOrderTypes.map((value) => ({value, label: value}));
export const orderPoolBlockerOptions = orderPoolBlockers.map((value) => ({value, label: value}));
export const orderPoolQueueOptions: Array<{value: OrderPoolQueue; label: string}> = [
  {value: "mine", label: "待我处理"},
  {value: "all", label: "全部订单"},
  {value: "unassigned", label: "待认领"},
  {value: "waiting_customer", label: "待客户"},
  {value: "due_today", label: "今日到期"},
  {value: "overdue", label: "已逾期"},
  {value: "exceptions", label: "异常"},
];

export const mainStageLabels: Record<OrderPoolStage, string> = {
  待接单: "待接单",
  跟进中: "跟进中",
  待客户: "待客户",
  待执行: "待执行",
  已完成: "已完成",
  暂停: "暂停",
  丢单: "丢单",
  取消: "取消",
  售后中: "售后中",
};

export function orderPoolStageTone(stage: OrderPoolStage) {
  if (stage === "已完成") return "success" as const;
  if (["丢单", "取消"].includes(stage)) return "danger" as const;
  if (["暂停", "售后中"].includes(stage)) return "warning" as const;
  if (stage === "待接单") return "info" as const;
  return "neutral" as const;
}

export function orderPoolTypeTone(type: OrderPoolOrderType) {
  if (type === "回收") return "warning" as const;
  if (type === "置换") return "info" as const;
  return "success" as const;
}

export function isOrderPoolException(stage: OrderPoolStage) {
  return orderPoolExceptionStages.includes(stage as (typeof orderPoolExceptionStages)[number]);
}

export function isOrderPoolOverdue(order: Pick<CustomerOrder, "mainStage" | "nextFollowUpAt">, now = new Date()) {
  if (!order.nextFollowUpAt || orderPoolInactiveStageValues.includes(order.mainStage as (typeof orderPoolInactiveStageValues)[number])) return false;
  return isStoreDateTimeBeforeNow(order.nextFollowUpAt, now);
}

export function isOrderPoolDueToday(order: Pick<CustomerOrder, "mainStage" | "nextFollowUpAt">, today = new Date()) {
  if (!order.nextFollowUpAt || orderPoolInactiveStageValues.includes(order.mainStage as (typeof orderPoolInactiveStageValues)[number])) return false;
  const value = formatStoreDateTime(order.nextFollowUpAt).slice(0, 10);
  return value === storeDate(today);
}

export function orderPoolSearchText(order: Pick<CustomerOrder, "orderNo" | "title" | "customerName" | "contact" | "nextAction" | "remarks">) {
  return [order.orderNo, order.title, order.customerName, order.contact, order.nextAction, order.remarks]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("zh-CN");
}

export function orderPoolOrderTypeDefaultBlocker(type: OrderPoolOrderType) {
  if (type === "销售") return "待报价" as const;
  if (type === "回收") return "待估价" as const;
  return "待客户确认" as const;
}

export function validateOrderPoolStageBlocker(stage: OrderPoolStage, blocker?: OrderPoolBlocker) {
  if (orderPoolInactiveStageValues.includes(stage as (typeof orderPoolInactiveStageValues)[number])) return undefined;
  return blocker;
}
