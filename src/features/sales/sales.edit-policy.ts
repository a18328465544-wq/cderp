import type {SalesListItem} from "@/src/types/sales";

export type SalesEditRisk = "green" | "yellow" | "red";

export interface SalesEditPolicy {
  mode: "read-only" | "limited" | "full";
  inventoryStage: "pending-outbound" | "completed";
  canEditMetadata: boolean;
  canEditItems: boolean;
  canEditCustomer: boolean;
  canEditSettlement: boolean;
  summary: string;
  reasons: string[];
  fields: {
    green: readonly string[];
    yellow: readonly string[];
    red: readonly string[];
  };
}

const fullEditFields = ["客户档案", "联系方式", "日期", "销售渠道", "商品模板", "数量", "销售价", "收款状态", "收款账户"] as const;
const redFields = ["客户档案", "商品模板", "数量", "销售价", "收款状态", "收款账户"] as const;

/**
 * Sales edits preserve the core reservation -> outbound binding chain. A
 * pending order can be edited completely when the account has the same
 * business visibility required to make that decision; once physical cards
 * have been bound/outbound, only non-financial metadata remains editable.
 * The server remains authoritative for payment/return conflicts on save.
 */
export function deriveSalesEditPolicy(
  item: SalesListItem,
  access: {canEditHistory: boolean; hasFullRecordAccess: boolean} = {canEditHistory: false, hasFullRecordAccess: false},
): SalesEditPolicy {
  const inventoryStage: SalesEditPolicy["inventoryStage"] = item.outboundStatus === "已出库" || item.linkedInventoryCount > 0
    ? "completed"
    : "pending-outbound";
  const canEditFullRecord = access.canEditHistory && access.hasFullRecordAccess && inventoryStage === "pending-outbound";
  const mode: SalesEditPolicy["mode"] = !access.canEditHistory ? "read-only" : canEditFullRecord ? "full" : "limited";
  const reasons: string[] = [];
  if (!access.canEditHistory) reasons.push("当前账号没有历史销售单编辑权限。");
  if (access.canEditHistory && !access.hasFullRecordAccess) reasons.push("当前账号缺少销售开单、库存、收款账户或成本利润查看权限，只开放低风险字段。");
  if (inventoryStage === "completed") reasons.push("销售单已绑定或已出库实物库存，商品、数量和结算结构不能由销售页直接改写。");
  reasons.push("保存时服务端会重新校验可售库存、退货和关联收款，冲突不会清空表单。");
  return {
    mode,
    inventoryStage,
    canEditMetadata: mode !== "read-only",
    canEditItems: mode === "full",
    canEditCustomer: mode === "full",
    canEditSettlement: mode === "full",
    summary: mode === "full"
      ? "该销售单仍处于待出库阶段，可以完整编辑；保存后仍按商品型号预占库存，实物 SN 继续由出库环节绑定。"
      : mode === "limited"
        ? "该销售单已形成关联业务事实，仅允许修改快递单号和备注。"
        : "当前账号只能查看该销售单。",
    reasons,
    fields: {
      green: mode === "read-only" ? [] : ["快递单号", "销售备注"],
      yellow: mode === "full" ? fullEditFields : [],
      red: mode === "full" ? ["实物 SN", "出库状态"] : redFields,
    },
  };
}

export function salesInventoryStageLabel(stage: SalesEditPolicy["inventoryStage"]) {
  return stage === "pending-outbound" ? "待出库（型号预占）" : "已绑定 / 已出库";
}
