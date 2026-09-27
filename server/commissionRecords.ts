import type {
  CommissionAdjustment,
  CommissionMode,
  PermissionSettings,
  PurchaseCommissionRecord,
  PurchaseCommissionStatus,
} from "../src/types.ts";

type CommissionPermissions = Pick<PermissionSettings, "allowedMenus"> &
  Partial<Pick<PermissionSettings, "showCost" | "showProfit">>;

function hasMenu(permissions: CommissionPermissions, menu: string) {
  return permissions.allowedMenus.includes("all") || permissions.allowedMenus.includes(menu);
}

export function canAccessCommissionMode(permissions: CommissionPermissions, mode: CommissionMode) {
  return hasMenu(permissions, mode === "purchase" ? "purchase_commission" : "sales_commission");
}

function roleAmount(record: PurchaseCommissionRecord, mode: CommissionMode) {
  const original = mode === "purchase"
    ? Number(record.purchaseCommissionAmount ?? record.commissionAmount ?? 0)
    : Number(record.salesCommissionAmount ?? record.commissionAmount ?? 0);
  const adjustments = (record.commissionAdjustments || [])
    .filter((item) => item.mode === mode)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  return Number(Math.max(0, original + adjustments).toFixed(2));
}

export function commissionAdjustmentAmount(record: PurchaseCommissionRecord, mode: CommissionMode) {
  return Number((record.commissionAdjustments || [])
    .filter((item) => item.mode === mode)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0)
    .toFixed(2));
}

export function commissionOriginalAmount(record: PurchaseCommissionRecord, mode: CommissionMode) {
  return Number((mode === "purchase"
    ? record.purchaseCommissionAmount ?? record.commissionAmount ?? 0
    : record.salesCommissionAmount ?? record.commissionAmount ?? 0) || 0);
}

export function commissionStatus(record: PurchaseCommissionRecord, mode: CommissionMode): PurchaseCommissionStatus {
  const explicit = mode === "purchase" ? record.purchaseStatus : record.salesStatus;
  const fallback = record.status || "待结算";
  const effectiveAmount = roleAmount(record, mode);
  if (explicit) return explicit;
  if (effectiveAmount <= 0 && commissionAdjustmentAmount(record, mode) < 0) return "已冲销";
  return fallback;
}

function roleAdjustments(record: PurchaseCommissionRecord, mode: CommissionMode) {
  return (record.commissionAdjustments || []).filter((item) => item.mode === mode);
}

function projectRoleRecord(record: PurchaseCommissionRecord, mode: CommissionMode, showProfit: boolean, showCost: boolean) {
  const purchase = mode === "purchase";
  const status = commissionStatus(record, mode);
  const adjustments = roleAdjustments(record, mode);
  const amount = roleAmount(record, mode);
  const originalAmount = commissionOriginalAmount(record, mode);
  const adjustmentAmount = commissionAdjustmentAmount(record, mode);
  const common = {
    id: record.id,
    inventoryId: record.inventoryId,
    sn: record.sn,
    productName: record.productName,
    handler: purchase ? record.purchaseHandler : record.salesHandler || "未记录",
    handlerType: purchase ? "采购经办人" : "销售经办人",
    documentNo: purchase ? record.purchaseInvoiceNo || record.id : record.salesInvoiceNo || record.id,
    status,
    createdAt: record.createdAt,
    settledAt: purchase ? record.purchaseSettledAt || record.settledAt : record.salesSettledAt || record.settledAt,
    settledBy: purchase ? record.purchaseSettledBy : record.salesSettledBy,
    settlementBatchId: purchase ? record.purchaseSettlementBatchId : record.salesSettlementBatchId,
    remarks: record.remarks,
    adjustmentCount: adjustments.length,
  };
  if (!showProfit) return common;
  return {
    ...common,
    baseAmount: purchase ? (showCost ? record.costPrice : undefined) : record.salesPrice,
    salesPrice: record.salesPrice,
    grossProfit: showCost ? record.grossProfit : undefined,
    rate: purchase ? record.purchaseRate ?? record.rate : record.salesRate ?? record.rate,
    commissionAmount: amount,
    originalCommissionAmount: originalAmount,
    adjustmentAmount,
    adjustments,
    calculationMethod: purchase ? record.purchaseCalculationMethod : record.salesCalculationMethod,
  };
}

/** Purpose-built commission response. It never sends the other role's handler or amount. */
export function projectCommissionRecord(
  record: PurchaseCommissionRecord,
  mode: CommissionMode,
  permissions: CommissionPermissions,
) {
  return projectRoleRecord(record, mode, permissions.showProfit === true, permissions.showCost === true);
}

/**
 * Legacy full-state consumers still receive purchaseCommissions. Redact at the server boundary
 * rather than zeroing sensitive values in the browser, which avoids false financial values and
 * prevents a role from reading the other side of a commission record.
 */
export function sanitizeCommissionRecord(record: PurchaseCommissionRecord, permissions: CommissionPermissions) {
  const next: Record<string, unknown> = {...record};
  const canPurchase = canAccessCommissionMode(permissions, "purchase");
  const canSales = canAccessCommissionMode(permissions, "sales");

  if (!canPurchase) {
    for (const key of ["purchaseInvoiceNo", "purchaseHandler", "purchaseRate", "purchaseCommissionAmount", "purchaseCalculationMethod", "purchaseStatus", "purchaseSettledAt", "purchaseSettledBy", "purchaseSettlementBatchId"]) delete next[key];
  }
  if (!canSales) {
    for (const key of ["salesInvoiceNo", "salesHandler", "salesRate", "salesCommissionAmount", "salesCalculationMethod", "salesStatus", "salesSettledAt", "salesSettledBy", "salesSettlementBatchId"]) delete next[key];
  }
  const visibleAdjustments = (record.commissionAdjustments || []).filter((item) => (item.mode === "purchase" && canPurchase) || (item.mode === "sales" && canSales));
  if (!permissions.showProfit) {
    for (const key of ["grossProfit", "rate", "commissionAmount", "purchaseRate", "purchaseCommissionAmount", "salesRate", "salesCommissionAmount"]) delete next[key];
    delete next.commissionAdjustments;
  } else {
    if (visibleAdjustments.length) next.commissionAdjustments = visibleAdjustments;
    else delete next.commissionAdjustments;

    // Legacy records used generic rate/commissionAmount fields for the purchase side.
    // Keep that compatibility only for a purchase-authorized projection; a sales-only
    // account must never infer its amount from a field owned by the other role.
    if (!canPurchase && canSales) {
      if (record.salesCommissionAmount !== undefined) next.commissionAmount = roleAmount(record, "sales");
      else delete next.commissionAmount;
      if (record.salesRate !== undefined) next.rate = record.salesRate;
      else delete next.rate;
    } else if (canPurchase && !canSales) {
      next.commissionAmount = roleAmount(record, "purchase");
      next.rate = record.purchaseRate ?? record.rate;
    }
  }
  if (!permissions.showCost) delete next.costPrice;
  return next;
}

export function effectiveCommissionAmount(record: PurchaseCommissionRecord, mode: CommissionMode) {
  return roleAmount(record, mode);
}

export function appendCommissionAdjustment(
  record: PurchaseCommissionRecord,
  adjustment: CommissionAdjustment,
) {
  const current = record.commissionAdjustments || [];
  if (current.some((item) => item.id === adjustment.id || (item.mode === adjustment.mode && item.documentNo && item.documentNo === adjustment.documentNo))) {
    return record;
  }
  return {
    ...record,
    commissionAdjustments: [...current, adjustment],
  };
}
