import type {AuditLog, CardInventory, ProductTemplate, ReturnOrder, StoreRole, SystemUserAccount} from "../src/types.ts";
import {ConflictError, ValidationError} from "./errors.ts";
import {nextDailyDocumentSequence} from "./storeIdentifiers.ts";
import {syncProductCurrentStock} from "./storeStateNormalization.ts";

export const MAX_LOG_ENTRIES = 10000;

export type RuntimeHelpersState = {
  currentRole: StoreRole;
  currentUserId?: string;
  systemUsers: SystemUserAccount[];
  products: ProductTemplate[];
  inventory: CardInventory[];
  returnOrders: ReturnOrder[];
  logs: AuditLog[];
};

export type RuntimeHelpersContext = {
  userId?: string;
  role?: StoreRole;
  actor?: string;
  requestId?: string;
  tenantId?: string;
  storeId?: string;
};

export type RuntimeHelpersDependencies = {
  state: RuntimeHelpersState;
  context: RuntimeHelpersContext;
  nowStamp: () => string;
  dateKey: () => string;
  genId: (prefix: string) => string;
};

/**
 * Runtime policy is intentionally kept separate from business operations. It owns
 * request identity, validation primitives, bounded audit logs and document numbering.
 */
export function createRuntimeHelpers(dependencies: RuntimeHelpersDependencies) {
  const {state, context, nowStamp, dateKey, genId} = dependencies;

  const finiteNumber = (value: unknown, label: string) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) throw new ValidationError(`${label}必须是有效数字`);
    return numeric;
  };
  const positiveAmount = (value: unknown, label: string) => {
    const numeric = finiteNumber(value, label);
    if (numeric <= 0) throw new ValidationError(`${label}必须大于 0`);
    return numeric;
  };
  const nonNegativeAmount = (value: unknown, label: string) => {
    const numeric = finiteNumber(value, label);
    if (numeric < 0) throw new ValidationError(`${label}不能小于 0`);
    return numeric;
  };
  const getActiveUserId = () => context.userId || state.currentUserId;
  const getActiveUser = () => state.systemUsers.find((user) => user.id === getActiveUserId());
  const getActiveRole = () => context.role || getActiveUser()?.role || state.currentRole;
  const getActiveActor = () => context.actor?.trim() || getActiveRole();
  const systemActor = () => `${getActiveActor()} (系统)`;

  const addLog = (user: string, module: string, type: string, target: string, beforeVal?: string, afterVal?: string) => {
    syncProductCurrentStock(state);
    const newLog: AuditLog = {
      id: genId("L"),
      user,
      time: nowStamp(),
      module,
      type,
      target,
      beforeVal,
      afterVal,
      requestId: context.requestId,
      tenantId: context.tenantId,
      storeId: context.storeId,
    };
    state.logs = [newLog, ...state.logs].slice(0, MAX_LOG_ENTRIES);
    return newLog;
  };

  const findCardBySn = (sn: string, excludeId?: string) => {
    const key = sn.trim().toLowerCase();
    if (!key) return undefined;
    return state.inventory.find((card) => card.id !== excludeId && card.sn && card.sn.toLowerCase() === key);
  };
  const assertSnUnique = (sn: string, excludeId?: string) => {
    const trimmed = sn.trim();
    if (trimmed && findCardBySn(trimmed, excludeId)) {
      throw new ConflictError(`SN已存在: ${trimmed}`);
    }
  };

  const nextDailySeq = (docs: Array<{invoiceNo: string}>, prefix: string) =>
    nextDailyDocumentSequence(docs, prefix, dateKey());

  const nextReturnNo = (type: ReturnOrder["type"]) => {
    const prefix = type === "销售退货" ? "XSTH" : "JHTH";
    const head = `${prefix}-${dateKey()}-`;
    const max = state.returnOrders.reduce((acc, order) => {
      if (!order.returnNo?.startsWith(head)) return acc;
      const n = Number(order.returnNo.slice(head.length));
      return Number.isFinite(n) ? Math.max(acc, n) : acc;
    }, 0);
    return `${head}${String(max + 1).padStart(3, "0")}`;
  };

  return {
    finiteNumber,
    positiveAmount,
    nonNegativeAmount,
    getActiveUserId,
    getActiveUser,
    getActiveRole,
    getActiveActor,
    systemActor,
    addLog,
    findCardBySn,
    assertSnUnique,
    nextDailySeq,
    nextReturnNo,
  };
}
