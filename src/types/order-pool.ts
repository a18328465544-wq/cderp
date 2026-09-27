/**
 * Customer order collaboration is the shared work item that connects a
 * customer's intent with the documents created later in the workflow.
 * Source documents remain the system of record for amounts and inventory;
 * this aggregate only owns collaboration context and document references.
 */
export const orderPoolOrderTypes = ["销售", "回收", "置换"] as const;
export type OrderPoolOrderType = typeof orderPoolOrderTypes[number];

export const orderPoolPartyTypeValues = ["customer", "vendor", "mixed"] as const;
export type OrderPoolPartyType = typeof orderPoolPartyTypeValues[number];
export const orderPoolPriorityValues = ["low", "normal", "high", "urgent"] as const;
export type OrderPoolPriority = typeof orderPoolPriorityValues[number];

export const orderPoolMainStages = ["待接单", "跟进中", "待客户", "待执行", "已完成"] as const;
export type OrderPoolMainStage = typeof orderPoolMainStages[number];

export const orderPoolExceptionStages = ["暂停", "丢单", "取消", "售后中"] as const;
export type OrderPoolExceptionStage = typeof orderPoolExceptionStages[number];
export const orderPoolInactiveStageValues = ["已完成", "丢单", "取消"] as const;
export type OrderPoolStage = OrderPoolMainStage | OrderPoolExceptionStage;

export const orderPoolBlockers = [
  "待报价",
  "待备货",
  "待收款",
  "待出库",
  "待估价",
  "待收货",
  "待检测",
  "待付款",
  "待入库",
  "待客户确认",
] as const;
export type OrderPoolBlocker = typeof orderPoolBlockers[number];

export const orderPoolDocumentTypes = [
  "quote",
  "sales",
  "purchase",
  "return",
  "inspection",
  "payment_in",
  "payment_out",
  "inventory",
  "aftersales",
] as const;
export type OrderPoolDocumentType = typeof orderPoolDocumentTypes[number];

export type OrderPoolEventType = "created" | "note" | "stage_changed" | "assigned" | "link_added";
/** Shared work queues are views over the same order aggregate, not new states. */
export const orderPoolQueueValues = ["mine", "all", "unassigned", "waiting_customer", "due_today", "overdue", "exceptions"] as const;
export type OrderPoolQueue = typeof orderPoolQueueValues[number];

export interface OrderPoolCollaborator {
  userId?: string;
  displayName: string;
  joinedAt: string;
}

/** Safe account choices exposed to order-pool collaborators; never includes credentials. */
export interface OrderPoolCollaboratorOption {
  id: string;
  displayName: string;
  role: string;
}

export interface OrderPoolDocumentLink {
  type: OrderPoolDocumentType;
  id: string;
  label?: string;
  linkedAt: string;
  linkedBy: string;
}

export interface OrderPoolEvent {
  id: string;
  type: OrderPoolEventType;
  content: string;
  actorId?: string;
  actor: string;
  occurredAt: string;
  metadata?: Record<string, string>;
}

export interface CustomerOrder {
  id: string;
  orderNo: string;
  title: string;
  orderType: OrderPoolOrderType;
  partyType: OrderPoolPartyType;
  customerId?: string;
  customerName: string;
  contact?: string;
  mainStage: OrderPoolStage;
  blocker?: OrderPoolBlocker;
  priority: OrderPoolPriority;
  ownerId?: string;
  ownerName?: string;
  collaborators: OrderPoolCollaborator[];
  nextAction?: string;
  nextFollowUpAt?: string;
  linkedDocuments: OrderPoolDocumentLink[];
  events: OrderPoolEvent[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  remarks?: string;
}

export interface OrderPoolCreateInput {
  title?: string;
  orderType: OrderPoolOrderType;
  partyType?: OrderPoolPartyType;
  customerId?: string;
  customerName: string;
  contact?: string;
  mainStage?: OrderPoolStage;
  blocker?: OrderPoolBlocker;
  priority?: OrderPoolPriority;
  ownerId?: string;
  ownerName?: string;
  collaboratorIds?: string[];
  nextAction?: string;
  nextFollowUpAt?: string;
  remarks?: string;
}

export interface OrderPoolUpdateInput {
  title?: string;
  customerName?: string;
  customerId?: string;
  contact?: string;
  mainStage?: OrderPoolStage;
  blocker?: OrderPoolBlocker | null;
  priority?: OrderPoolPriority;
  ownerId?: string | null;
  ownerName?: string | null;
  collaboratorIds?: string[];
  nextAction?: string | null;
  nextFollowUpAt?: string | null;
  remarks?: string | null;
}

export interface OrderPoolEventInput {
  content: string;
  type?: Extract<OrderPoolEventType, "note">;
}

export interface OrderPoolDocumentLinkInput {
  type: OrderPoolDocumentType;
  id: string;
  label?: string;
}

export interface OrderPoolFilters {
  keyword: string;
  orderType: "all" | OrderPoolOrderType;
  mainStage: "all" | OrderPoolStage;
  owner: string;
  queue: OrderPoolQueue;
  page: number;
  pageSize: number;
}

export interface OrderPoolSummary {
  total: number;
  pendingClaim: number;
  following: number;
  waitingCustomer: number;
  pendingExecution: number;
  completed: number;
  exceptions: number;
  mine: number;
  unassigned: number;
  dueToday: number;
  overdue: number;
}

export interface OrderPoolCollection {
  items: CustomerOrder[];
  page: number;
  pageSize: number;
  total: number;
  summary: OrderPoolSummary;
}
