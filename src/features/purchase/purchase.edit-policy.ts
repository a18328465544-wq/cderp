import type {PurchaseDetail} from "@/src/types/purchase";
import {inventoryInspectionPendingStatusValues} from "@/src/types/inventory";

export type PurchaseEditRisk = "green" | "yellow" | "red";

export interface PurchaseEditPolicy {
  mode: "read-only" | "limited" | "full";
  inventoryStage: "not-created" | "pending-inspection" | "processing" | "completed";
  canEditMetadata: boolean;
  canEditItems: boolean;
  canEditSource: boolean;
  canEditSettlement: boolean;
  summary: string;
  reasons: string[];
  fields: {
    green: readonly string[];
    yellow: readonly string[];
    red: readonly string[];
  };
}

const fullEditFields = ["联系方式", "日期", "商品模板", "数量", "采购价", "预计售价", "来源客户 / 供应商", "现金付款", "供应商抵扣", "结算账户"] as const;
const redFields = ["商品模板", "数量", "SN", "采购价", "来源客户 / 供应商", "现金付款", "供应商抵扣", "结算账户"] as const;

export function derivePurchaseEditPolicy(
  detail: PurchaseDetail,
  access: {canEditHistory: boolean; hasFullRecordAccess: boolean} = {canEditHistory: false, hasFullRecordAccess: false},
): PurchaseEditPolicy {
  const statuses = new Set(detail.inventory.map((item) => item.status));
  const hasCompletedInventory = [...statuses].some((status) => !inventoryInspectionPendingStatusValues.includes(status as typeof inventoryInspectionPendingStatusValues[number]));
  const hasProcessingInventory = detail.inspectionCount > 0 || [...statuses].some((status) => status !== "待检测");
  const inventoryStage = detail.inventory.length === 0
    ? "not-created"
    : hasCompletedInventory
      ? "completed"
      : hasProcessingInventory
        ? "processing"
        : "pending-inspection";

  const canSeeDependencies = detail.paymentCount !== null && detail.completedReturnCount !== null;
  const hasBlockingDependencies = (detail.paymentCount || 0) > 1 || (detail.completedReturnCount || 0) > 0;
  const canEditFullRecord = access.canEditHistory
    && access.hasFullRecordAccess
    && canSeeDependencies
    && !hasBlockingDependencies
    && (inventoryStage === "not-created" || inventoryStage === "pending-inspection");
  const mode: PurchaseEditPolicy["mode"] = !access.canEditHistory ? "read-only" : canEditFullRecord ? "full" : "limited";
  const reasons: string[] = [];
  if (!access.canEditHistory) reasons.push("当前账号没有历史单据编辑权限。");
  if (access.canEditHistory && !access.hasFullRecordAccess) reasons.push("当前账号缺少采购开单、成本或预计售价权限，只开放低风险字段。");
  if (inventoryStage === "processing" || inventoryStage === "completed") reasons.push("部分实物库存已检测或入库，商品、数量和 SN 不能由采购页直接改写。");
  if (detail.paymentCount === null) reasons.push("当前账号无法读取付款流水，不能安全判断结算是否可编辑。");
  else if (detail.paymentCount === 1) reasons.push("该单据关联 1 笔付款流水；结算发生变化时，保存流程会安全冲销并重建该笔流水。");
  else if (detail.paymentCount > 1) reasons.push(`该单据关联 ${detail.paymentCount} 笔付款流水，结算必须在付款流水中单独冲销或调整。`);
  if (detail.completedReturnCount === null) reasons.push("当前账号无法确认是否存在已完成采购退货。");
  else if (detail.completedReturnCount > 0) reasons.push("该单据已存在完成的采购退货，往来对象、商品和结算结构已受保护。");

  return {
    mode,
    inventoryStage,
    canEditMetadata: mode !== "read-only",
    canEditItems: mode === "full",
    canEditSource: mode === "full",
    canEditSettlement: mode === "full",
    summary: mode === "full"
      ? "该采购单尚未形成受保护的库存、退货或多笔付款事实，可以完整编辑；保存时会校验记录版本。"
      : mode === "limited"
        ? "该采购单已形成关联业务事实，仅允许修改快递单号和采购备注。"
        : "当前账号只能查看该采购单。",
    reasons,
    fields: {
      green: mode === "read-only" ? [] : ["采购备注", "快递单号"],
      yellow: mode === "full" ? fullEditFields : [],
      red: mode === "full" ? ["SN", "检测结果", "最终库位"] : redFields,
    },
  };
}

export function purchaseInventoryStageLabel(stage: PurchaseEditPolicy["inventoryStage"]) {
  return stage === "not-created" ? "未生成库存" : stage === "pending-inspection" ? "待检测" : stage === "processing" ? "检测 / 入库中" : "已形成库存事实";
}
