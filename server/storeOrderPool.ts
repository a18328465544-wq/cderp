import type {
  CustomerOrder,
  OrderPoolBlocker,
  OrderPoolCreateInput,
  OrderPoolDocumentLinkInput,
  OrderPoolEventInput,
  OrderPoolStage,
  OrderPoolUpdateInput,
  SystemUserAccount,
} from "../src/types.ts";
import {
  orderPoolBlockers,
  orderPoolDocumentTypes,
  orderPoolExceptionStages,
  orderPoolInactiveStageValues,
  orderPoolMainStages,
  orderPoolOrderTypes,
  orderPoolPartyTypeValues,
  orderPoolPriorityValues,
} from "../src/types.ts";
import {NotFoundError, ValidationError} from "./errors.ts";

export type OrderPoolState = {
  customerOrders: CustomerOrder[];
  systemUsers: SystemUserAccount[];
};

export type OrderPoolDependencies = {
  state: OrderPoolState;
  userId?: string;
  nowStamp: () => string;
  dateKey: () => string;
  genId: (prefix: string) => string;
  getActiveActor: () => string;
  addLog: (user: string, module: string, type: string, target: string, beforeVal?: string, afterVal?: string) => unknown;
};

const orderPoolStages = new Set<OrderPoolStage>([...orderPoolMainStages, ...orderPoolExceptionStages]);
const orderPoolPartyTypes = new Set(orderPoolPartyTypeValues);
const orderPoolPriorities = new Set(orderPoolPriorityValues);

/**
 * Customer order-pool commands own collaboration state only. Amounts, stock and
 * source documents remain owned by their respective domain actions.
 */
export function createOrderPoolHelpers(dependencies: OrderPoolDependencies) {
  const {state, userId, nowStamp, dateKey, genId, getActiveActor, addLog} = dependencies;

  const cleanOrderPoolText = (value: unknown, label: string, maxLength: number, required = false) => {
    const text = typeof value === "string" ? value.trim() : "";
    if (required && !text) throw new ValidationError(`${label}不能为空`);
    if (text.length > maxLength) throw new ValidationError(`${label}不能超过 ${maxLength} 个字符`);
    return text;
  };

  const assertOrderPoolRecord = (value: unknown, label: string): Record<string, unknown> => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new ValidationError(`${label}格式无效`);
    }
    return value as Record<string, unknown>;
  };

  const resolveOrderPoolUser = (id?: string, name?: string) => {
    const userId = cleanOrderPoolText(id, "账号", 100);
    if (userId) {
      const user = state.systemUsers.find((item) => item.id === userId && item.enabled);
      if (!user) throw new NotFoundError(`协作账号不存在或已停用: ${userId}`);
      return {userId: user.id, displayName: user.displayName || user.username};
    }
    const displayName = cleanOrderPoolText(name, "人员名称", 80);
    return displayName ? {displayName} : undefined;
  };

  const resolveOrderPoolCollaborators = (ids: unknown, ownerId?: string) => {
    if (ids === undefined) return [] as CustomerOrder["collaborators"];
    if (!Array.isArray(ids)) throw new ValidationError("协作者账号格式无效");
    const uniqueIds = Array.from(
      new Set(ids.map((value) => cleanOrderPoolText(value, "协作者账号", 100)).filter(Boolean)),
    );
    const joinedAt = nowStamp();
    return uniqueIds
      .map((collaboratorId) => {
        const resolved = resolveOrderPoolUser(collaboratorId);
        return {
          userId: resolved?.userId || collaboratorId,
          displayName: resolved?.displayName || collaboratorId,
          joinedAt,
        };
      })
      .filter((item) => item.userId !== ownerId);
  };

  const nextCustomerOrderNo = () => {
    const prefix = `DD-${dateKey()}-`;
    const max = state.customerOrders.reduce((current, order) => {
      if (!order.orderNo?.startsWith(prefix)) return current;
      const value = Number(order.orderNo.slice(prefix.length));
      return Number.isFinite(value) ? Math.max(value, current) : current;
    }, 0);
    return `${prefix}${String(max + 1).padStart(3, "0")}`;
  };

  const addCustomerOrderEvent = (
    order: CustomerOrder,
    input: {type: CustomerOrder["events"][number]["type"]; content: string; metadata?: Record<string, string>},
  ) => {
    const event = {
      id: genId("ODE"),
      type: input.type,
      content: cleanOrderPoolText(input.content, "事件内容", 2000, true),
      actorId: userId,
      actor: getActiveActor(),
      occurredAt: nowStamp(),
      ...(input.metadata ? {metadata: input.metadata} : {}),
    };
    order.events = [event, ...order.events].slice(0, 200);
    order.updatedAt = event.occurredAt;
    return event;
  };

  const assertOrderPoolBaseFields = (input: {
    orderType?: unknown;
    partyType?: unknown;
    mainStage?: unknown;
    blocker?: unknown;
    priority?: unknown;
  }) => {
    if (!orderPoolOrderTypes.includes(input.orderType as (typeof orderPoolOrderTypes)[number])) {
      throw new ValidationError("订单类型无效");
    }
    if (input.partyType !== undefined && !orderPoolPartyTypes.has(input.partyType as "customer" | "vendor" | "mixed")) {
      throw new ValidationError("关联主体类型无效");
    }
    if (input.mainStage !== undefined && !orderPoolStages.has(input.mainStage as OrderPoolStage)) {
      throw new ValidationError("订单阶段无效");
    }
    if (input.blocker !== undefined && input.blocker !== null && !orderPoolBlockers.includes(input.blocker as OrderPoolBlocker)) {
      throw new ValidationError("待办标签无效");
    }
    if (input.priority !== undefined && !orderPoolPriorities.has(input.priority as "low" | "normal" | "high" | "urgent")) {
      throw new ValidationError("优先级无效");
    }
  };

  const createCustomerOrder = (input: OrderPoolCreateInput) => {
    assertOrderPoolRecord(input, "订单内容");
    assertOrderPoolBaseFields(input);
    const customerName = cleanOrderPoolText(input.customerName, "客户/同行名称", 160, true);
    const orderType = input.orderType;
    const partyType = input.partyType || "customer";
    if (!orderPoolPartyTypes.has(partyType)) throw new ValidationError("关联主体类型无效");
    const now = nowStamp();
    const owner = resolveOrderPoolUser(input.ownerId, input.ownerName) || {
      userId,
      displayName: getActiveActor(),
    };
    const collaborators = resolveOrderPoolCollaborators(input.collaboratorIds, owner.userId);
    const mainStage = input.mainStage || "待接单";
    const blocker = input.blocker || (orderType === "销售" ? "待报价" : orderType === "回收" ? "待估价" : "待客户确认");
    const record: CustomerOrder = {
      id: genId("DD"),
      orderNo: nextCustomerOrderNo(),
      title: cleanOrderPoolText(input.title, "订单标题", 160) || `${customerName} · ${orderType}`,
      orderType,
      partyType,
      customerId: cleanOrderPoolText(input.customerId, "客户档案", 100) || undefined,
      customerName,
      contact: cleanOrderPoolText(input.contact, "联系方式", 160) || undefined,
      mainStage,
      blocker: orderPoolInactiveStageValues.includes(mainStage as (typeof orderPoolInactiveStageValues)[number]) ? undefined : blocker,
      priority: input.priority || "normal",
      ownerId: owner.userId,
      ownerName: owner.displayName,
      collaborators,
      nextAction: cleanOrderPoolText(input.nextAction, "下一步", 240) || undefined,
      nextFollowUpAt: cleanOrderPoolText(input.nextFollowUpAt, "下次跟进时间", 40) || undefined,
      linkedDocuments: [],
      events: [],
      createdAt: now,
      updatedAt: now,
      createdBy: getActiveActor(),
      remarks: cleanOrderPoolText(input.remarks, "备注", 2000) || undefined,
    };
    addCustomerOrderEvent(record, {type: "created", content: `创建${record.orderType}协同订单`});
    state.customerOrders = [record, ...state.customerOrders];
    addLog(getActiveActor(), "订单池", "新建协同订单", record.orderNo, undefined, `${record.customerName} · ${record.orderType}`);
    return record;
  };

  const updateCustomerOrder = (id: string, patch: OrderPoolUpdateInput) => {
    assertOrderPoolRecord(patch, "订单修改内容");
    const existing = state.customerOrders.find((item) => item.id === id || item.orderNo === id);
    if (!existing) throw new NotFoundError(`协同订单不存在: ${id}`);
    assertOrderPoolBaseFields({
      orderType: existing.orderType,
      mainStage: patch.mainStage,
      blocker: patch.blocker,
      priority: patch.priority,
    });
    const beforeStage = existing.mainStage;
    const beforeOwner = existing.ownerId || existing.ownerName || "";
    const owner = patch.ownerId !== undefined || patch.ownerName !== undefined
      ? patch.ownerId === null && patch.ownerName === null
        ? undefined
        : resolveOrderPoolUser(patch.ownerId || undefined, patch.ownerName || undefined)
      : {userId: existing.ownerId, displayName: existing.ownerName};
    const nextStage = patch.mainStage || existing.mainStage;
    const nextBlocker = patch.blocker === null || orderPoolInactiveStageValues.includes(nextStage as (typeof orderPoolInactiveStageValues)[number])
      ? undefined
      : patch.blocker === undefined
        ? existing.blocker
        : patch.blocker;
    const next: CustomerOrder = {
      ...existing,
      ...(patch.title !== undefined ? {title: cleanOrderPoolText(patch.title, "订单标题", 160, true)} : {}),
      ...(patch.customerName !== undefined ? {customerName: cleanOrderPoolText(patch.customerName, "客户/同行名称", 160, true)} : {}),
      ...(patch.customerId !== undefined ? {customerId: cleanOrderPoolText(patch.customerId, "客户档案", 100) || undefined} : {}),
      ...(patch.contact !== undefined ? {contact: cleanOrderPoolText(patch.contact, "联系方式", 160) || undefined} : {}),
      mainStage: nextStage,
      blocker: nextBlocker,
      ...(patch.priority !== undefined ? {priority: patch.priority} : {}),
      ownerId: owner?.userId,
      ownerName: owner?.displayName,
      ...(patch.collaboratorIds !== undefined ? {collaborators: resolveOrderPoolCollaborators(patch.collaboratorIds, owner?.userId)} : {}),
      ...(patch.nextAction !== undefined ? {nextAction: patch.nextAction === null ? undefined : cleanOrderPoolText(patch.nextAction, "下一步", 240)} : {}),
      ...(patch.nextFollowUpAt !== undefined ? {nextFollowUpAt: patch.nextFollowUpAt === null ? undefined : cleanOrderPoolText(patch.nextFollowUpAt, "下次跟进时间", 40)} : {}),
      ...(patch.remarks !== undefined ? {remarks: patch.remarks === null ? undefined : cleanOrderPoolText(patch.remarks, "备注", 2000)} : {}),
      updatedAt: nowStamp(),
    };
    if (nextStage !== beforeStage) {
      addCustomerOrderEvent(next, {
        type: "stage_changed",
        content: `阶段由「${beforeStage}」调整为「${nextStage}」`,
        metadata: {from: beforeStage, to: nextStage},
      });
    }
    const afterOwner = next.ownerId || next.ownerName || "";
    if (afterOwner !== beforeOwner) addCustomerOrderEvent(next, {type: "assigned", content: `负责人调整为${next.ownerName || "待认领"}`});
    if (next.updatedAt === existing.updatedAt) next.updatedAt = nowStamp();
    state.customerOrders = state.customerOrders.map((item) => item.id === existing.id ? next : item);
    addLog(getActiveActor(), "订单池", "更新协同订单", next.orderNo, beforeStage, next.mainStage);
    return next;
  };

  const appendCustomerOrderNote = (id: string, input: OrderPoolEventInput) => {
    assertOrderPoolRecord(input, "跟进内容");
    const existing = state.customerOrders.find((item) => item.id === id || item.orderNo === id);
    if (!existing) throw new NotFoundError(`协同订单不存在: ${id}`);
    const next = structuredClone(existing);
    addCustomerOrderEvent(next, {type: "note", content: input.content});
    state.customerOrders = state.customerOrders.map((item) => item.id === existing.id ? next : item);
    addLog(getActiveActor(), "订单池", "记录跟进", next.orderNo, undefined, input.content.trim().slice(0, 120));
    return next;
  };

  const linkCustomerOrderDocument = (id: string, input: OrderPoolDocumentLinkInput) => {
    assertOrderPoolRecord(input, "关联单据内容");
    const existing = state.customerOrders.find((item) => item.id === id || item.orderNo === id);
    if (!existing) throw new NotFoundError(`协同订单不存在: ${id}`);
    if (!orderPoolDocumentTypes.includes(input.type)) throw new ValidationError("关联单据类型无效");
    const documentId = cleanOrderPoolText(input.id, "关联单据", 160, true);
    const next = structuredClone(existing);
    if (!next.linkedDocuments.some((item) => item.type === input.type && item.id === documentId)) {
      next.linkedDocuments = [
        {
          type: input.type,
          id: documentId,
          label: cleanOrderPoolText(input.label, "关联单据名称", 160) || undefined,
          linkedAt: nowStamp(),
          linkedBy: getActiveActor(),
        },
        ...next.linkedDocuments,
      ];
      addCustomerOrderEvent(next, {
        type: "link_added",
        content: `关联${input.type}单据 ${documentId}`,
        metadata: {type: input.type, id: documentId},
      });
      state.customerOrders = state.customerOrders.map((item) => item.id === existing.id ? next : item);
      addLog(getActiveActor(), "订单池", "关联业务单据", next.orderNo, undefined, documentId);
    }
    return next;
  };

  return {
    createCustomerOrder,
    updateCustomerOrder,
    appendCustomerOrderNote,
    linkCustomerOrderDocument,
  };
}
