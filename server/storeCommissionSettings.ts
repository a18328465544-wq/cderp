import type {AuditLog, CommissionMode, CommissionRules, PurchaseCommissionRecord} from "../src/types.ts";
import {normalizeCommissionRules, type CommissionRulesPatch} from "../src/utils/commissionRules.ts";
import {commissionStatus, effectiveCommissionAmount} from "./commissionRecords.ts";
import {ConflictError, NotFoundError, ValidationError} from "./errors.ts";

export type CommissionSettingsState = {
  commissionRules: CommissionRules;
  purchaseCommissions: PurchaseCommissionRecord[];
};

export type CommissionSettingsDependencies = {
  state: CommissionSettingsState;
  nowStamp: () => string;
  genId: (prefix: string) => string;
  getActiveActor: () => string;
  addLog: (user: string, module: string, type: string, target: string, beforeVal?: string, afterVal?: string) => AuditLog;
};

export function createCommissionSettingsHelpers(dependencies: CommissionSettingsDependencies) {
  const {state, nowStamp, genId, getActiveActor, addLog} = dependencies;

  const getCommissionRules = () => structuredClone(state.commissionRules);

  const updateCommissionRules = (input: CommissionRulesPatch) => {
    const current = state.commissionRules;
    const next = normalizeCommissionRules({
      ...current,
      ...input,
      purchase: {
        ...current.purchase,
        ...(input.purchase || {}),
        targets: {...current.purchase.targets, ...(input.purchase?.targets || {})},
      },
      sales: {
        ...current.sales,
        ...(input.sales || {}),
        targets: {...current.sales.targets, ...(input.sales?.targets || {})},
      },
      updatedAt: nowStamp().replace(" ", "T"),
    });
    state.commissionRules = next;
    addLog(getActiveActor(), "提成规则", "更新", "进货/卖货提成规则", JSON.stringify(current), JSON.stringify(next));
    return structuredClone(next);
  };

  const settleCommissionRecords = (mode: CommissionMode, ids: string[], note?: string) => {
    const uniqueIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
    if (!uniqueIds.length) throw new ValidationError("至少选择一条提成记录");
    const records = uniqueIds.map((id) => {
      const record = state.purchaseCommissions.find((item) => item.id === id);
      if (!record) throw new NotFoundError(`提成记录不存在: ${id}`);
      return record;
    });
    const invalid = records.find((record) => commissionStatus(record, mode) === "已结算");
    if (invalid) throw new ConflictError(`提成记录 ${invalid.id} 已结算，不能重复结算`);
    const voided = records.find((record) => commissionStatus(record, mode) === "已冲销" || effectiveCommissionAmount(record, mode) <= 0);
    if (voided) throw new ConflictError(`提成记录 ${voided.id} 当前没有可结算金额`);

    const settledAt = nowStamp();
    const settlementBatchId = genId("TJB");
    const settledBy = getActiveActor();
    const recordIds = new Set(uniqueIds);
    const updatedRecords = state.purchaseCommissions
      .filter((record) => recordIds.has(record.id))
      .map((record) => {
        const next = mode === "purchase"
          ? {...record, purchaseStatus: "已结算" as const, purchaseSettledAt: settledAt, purchaseSettledBy: settledBy, purchaseSettlementBatchId: settlementBatchId}
          : {...record, salesStatus: "已结算" as const, salesSettledAt: settledAt, salesSettledBy: settledBy, salesSettlementBatchId: settlementBatchId};
        const purchaseStatus = next.purchaseStatus || next.status;
        const salesStatus = next.salesStatus || next.status;
        return {
          ...next,
          status: purchaseStatus === "已结算" && salesStatus === "已结算"
            ? "已结算" as const
            : purchaseStatus === "已冲销" && salesStatus === "已冲销"
              ? "已冲销" as const
              : "待结算" as const,
        };
      });
    state.purchaseCommissions = state.purchaseCommissions.map((record) => updatedRecords.find((item) => item.id === record.id) || record);
    const log = addLog(
      `${settledBy} (系统)`,
      "员工提成",
      "标记结算",
      `${mode === "purchase" ? "进货" : "销售"}提成 ${settlementBatchId}`,
      undefined,
      `${uniqueIds.length} 条；${note?.trim() || "未填写备注"}；仅更新提成结算状态，不自动生成账户出账`,
    );
    return {mode, settlementBatchId, settledAt, settledBy, count: updatedRecords.length, records: updatedRecords, log};
  };

  return {getCommissionRules, updateCommissionRules, settleCommissionRecords};
}
