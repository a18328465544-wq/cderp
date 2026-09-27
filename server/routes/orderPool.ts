import type {Express, Request, RequestHandler} from "express";
import type {AuthenticatedRequest} from "../httpAuth.ts";
import type {AppState, createStoreActions} from "../store.ts";
import {matchesKeyword} from "../../src/utils/search.ts";
import {isStoreDateTimeBeforeNow, storeDate} from "../../src/utils/storeTime.ts";
import type {SystemUserAccount} from "../../src/types.ts";
import {orderPoolExceptionStages, orderPoolInactiveStageValues, orderPoolQueueValues} from "../../src/types/order-pool.ts";
import type {CustomerOrder, OrderPoolQueue} from "../../src/types/order-pool.ts";
import {orderPoolCreateDto, orderPoolDocumentLinkDto, orderPoolEventDto, orderPoolListQueryDto, orderPoolUpdateDto, parseHttpDto} from "../httpDto.ts";

type OrderPoolActions = Pick<ReturnType<typeof createStoreActions>, "createCustomerOrder" | "updateCustomerOrder" | "appendCustomerOrderNote" | "linkCustomerOrderDocument">;

type OrderPoolRouteDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  getState: (req: Request) => AppState;
  actions: (req: AuthenticatedRequest<SystemUserAccount>) => OrderPoolActions;
  persist: (req: AuthenticatedRequest<SystemUserAccount>, result: unknown) => Promise<unknown>;
};

function pageValue(value: unknown, fallback: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(max, Math.floor(parsed))) : fallback;
}

function cleanQuery(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

const orderPoolQueues = new Set<OrderPoolQueue>(orderPoolQueueValues);
const inactiveStages = new Set<string>(orderPoolInactiveStageValues);
const exceptionStages = new Set<string>(orderPoolExceptionStages);

function isActiveOrder(order: CustomerOrder) {
  return !inactiveStages.has(order.mainStage);
}

function belongsToUser(order: CustomerOrder, user?: SystemUserAccount) {
  if (!user) return false;
  return order.ownerId === user.id
    || order.ownerName === user.displayName
    || order.collaborators.some((item) => item.userId === user.id || item.displayName === user.displayName);
}

function isDueToday(order: CustomerOrder) {
  return isActiveOrder(order) && Boolean(order.nextFollowUpAt) && order.nextFollowUpAt!.replace("T", " ").slice(0, 10) === storeDate();
}

function isOverdue(order: CustomerOrder) {
  return isActiveOrder(order) && isStoreDateTimeBeforeNow(order.nextFollowUpAt);
}

function matchesQueue(order: CustomerOrder, queue: OrderPoolQueue, user?: SystemUserAccount) {
  if (queue === "all") return true;
  if (queue === "mine") return isActiveOrder(order) && belongsToUser(order, user);
  if (queue === "unassigned") return isActiveOrder(order) && !order.ownerId && !order.ownerName;
  if (queue === "waiting_customer") return isActiveOrder(order) && order.mainStage === "待客户";
  if (queue === "due_today") return isDueToday(order);
  if (queue === "overdue") return isOverdue(order);
  return exceptionStages.has(order.mainStage);
}

function listCollaborators(state: AppState) {
  return state.systemUsers
    .filter((user) => user.enabled)
    .map((user) => ({
      id: user.id,
      displayName: user.displayName || user.username,
      role: user.role,
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "zh-CN") || left.id.localeCompare(right.id));
}

type ParsedOrderPoolQuery = {
  keyword: string;
  orderType: string;
  mainStage: string;
  owner: string;
  queue: OrderPoolQueue;
  page: number;
  pageSize: number;
};

export function listOrders(state: AppState, req: AuthenticatedRequest<SystemUserAccount>, parsedQuery?: Partial<ParsedOrderPoolQuery>) {
  const source = parsedQuery || {
    keyword: req.query.keyword,
    orderType: req.query.orderType,
    mainStage: req.query.mainStage,
    owner: req.query.owner,
    queue: req.query.queue,
    page: req.query.page,
    pageSize: req.query.pageSize,
  };
  const requestedQueue = cleanQuery(source.queue);
  const query: ParsedOrderPoolQuery = {
    keyword: cleanQuery(source.keyword),
    orderType: cleanQuery(source.orderType),
    mainStage: cleanQuery(source.mainStage),
    owner: cleanQuery(source.owner),
    queue: orderPoolQueues.has(requestedQueue as OrderPoolQueue) ? requestedQueue as OrderPoolQueue : "mine",
    page: pageValue(source.page, 1, 10_000),
    pageSize: pageValue(source.pageSize, 20, 200),
  };
  const keyword = query.keyword;
  const orderType = query.orderType;
  const mainStage = query.mainStage;
  const owner = query.owner;
  const queue: OrderPoolQueue = query.queue;
  const currentUser = req.authUser;
  const filtered = state.customerOrders
    .filter((order) => matchesQueue(order, queue, currentUser))
    .filter((order) => !keyword || matchesKeyword([
      order.orderNo,
      order.title,
      order.customerName,
      order.contact,
      order.ownerName,
      order.nextAction,
      order.remarks,
      ...order.collaborators.map((item) => item.displayName),
      ...order.events.map((item) => item.content),
    ], keyword))
    .filter((order) => !orderType || orderType === "all" || order.orderType === orderType)
    .filter((order) => !mainStage || mainStage === "all" || order.mainStage === mainStage)
    .filter((order) => !owner || owner === "all" || order.ownerId === owner || order.ownerName === owner || order.collaborators.some((item) => item.userId === owner || item.displayName === owner));
  const sorted = [...filtered].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id));
  const page = query.page;
  const pageSize = query.pageSize;
  const start = (page - 1) * pageSize;
  const summary = state.customerOrders.reduce((result, order) => {
    result.total += 1;
    // "待认领" is an ownership queue, not a stage label. A newly-created
    // order may still be in the "待接单" stage after its creator takes
    // responsibility, so counting the stage here would make the queue
    // badge disagree with the actual unassigned list.
    if (matchesQueue(order, "unassigned", currentUser)) result.pendingClaim += 1;
    if (order.mainStage === "跟进中") result.following += 1;
    if (order.mainStage === "待客户") result.waitingCustomer += 1;
    if (order.mainStage === "待执行") result.pendingExecution += 1;
    if (order.mainStage === "已完成") result.completed += 1;
    if (["暂停", "丢单", "取消", "售后中"].includes(order.mainStage)) result.exceptions += 1;
    if (matchesQueue(order, "mine", currentUser)) result.mine += 1;
    if (matchesQueue(order, "unassigned", currentUser)) result.unassigned += 1;
    if (matchesQueue(order, "due_today", currentUser)) result.dueToday += 1;
    if (matchesQueue(order, "overdue", currentUser)) result.overdue += 1;
    return result;
  }, {total: 0, pendingClaim: 0, following: 0, waitingCustomer: 0, pendingExecution: 0, completed: 0, exceptions: 0, mine: 0, unassigned: 0, dueToday: 0, overdue: 0});
  return {items: sorted.slice(start, start + pageSize), page, pageSize, total: sorted.length, summary};
}

/** Shared customer-order collaboration routes. Source documents stay owned by their modules. */
export function registerOrderPoolRoutes(app: Express, dependencies: OrderPoolRouteDependencies) {
  app.get("/api/order-pool/collaborators", dependencies.requireMenu("order_pool"), dependencies.asyncRoute(async (req, res) => {
    res.json({data: listCollaborators(dependencies.getState(req))});
  }));

  app.get("/api/order-pool", dependencies.requireMenu("order_pool"), dependencies.asyncRoute(async (req, res) => {
    const query = parseHttpDto(orderPoolListQueryDto, req.query);
    res.json({data: listOrders(dependencies.getState(req), req as AuthenticatedRequest<SystemUserAccount>, query)});
  }));

  app.get("/api/order-pool/:id", dependencies.requireMenu("order_pool"), dependencies.asyncRoute(async (req, res) => {
    const id = cleanQuery(req.params.id);
    const order = dependencies.getState(req).customerOrders.find((item) => item.id === id || item.orderNo === id);
    if (!order) {
      res.status(404).json({error: {code: "NOT_FOUND", message: "协同订单不存在"}});
      return;
    }
    res.json({data: order});
  }));

  app.post("/api/order-pool", dependencies.requireMenu("order_pool"), dependencies.asyncRoute(async (req, res) => {
    const authRequest = req as AuthenticatedRequest<SystemUserAccount>;
    const command = parseHttpDto(orderPoolCreateDto, req.body);
    const order = dependencies.actions(authRequest).createCustomerOrder(command);
    await dependencies.persist(authRequest, order);
    res.status(201).json({data: order});
  }));

  app.patch("/api/order-pool/:id", dependencies.requireMenu("order_pool"), dependencies.asyncRoute(async (req, res) => {
    const authRequest = req as AuthenticatedRequest<SystemUserAccount>;
    const command = parseHttpDto(orderPoolUpdateDto, req.body);
    const order = dependencies.actions(authRequest).updateCustomerOrder(cleanQuery(req.params.id), command);
    await dependencies.persist(authRequest, order);
    res.json({data: order});
  }));

  app.post("/api/order-pool/:id/events", dependencies.requireMenu("order_pool"), dependencies.asyncRoute(async (req, res) => {
    const authRequest = req as AuthenticatedRequest<SystemUserAccount>;
    const command = parseHttpDto(orderPoolEventDto, req.body);
    const order = dependencies.actions(authRequest).appendCustomerOrderNote(cleanQuery(req.params.id), command);
    await dependencies.persist(authRequest, order);
    res.status(201).json({data: order});
  }));

  app.post("/api/order-pool/:id/links", dependencies.requireMenu("order_pool"), dependencies.asyncRoute(async (req, res) => {
    const authRequest = req as AuthenticatedRequest<SystemUserAccount>;
    const command = parseHttpDto(orderPoolDocumentLinkDto, req.body);
    const order = dependencies.actions(authRequest).linkCustomerOrderDocument(cleanQuery(req.params.id), command);
    await dependencies.persist(authRequest, order);
    res.status(201).json({data: order});
  }));
}
