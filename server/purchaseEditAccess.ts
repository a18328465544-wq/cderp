import {ForbiddenError} from "./errors.ts";

export type PurchaseEditAccessPermissions = {
  allowedMenus: string[];
  showCost?: boolean;
  showProfit?: boolean;
};

const metadataFields = new Set(["expressNo", "remarks"]);

export function canFullyEditPurchaseRecord(permissions: PurchaseEditAccessPermissions) {
  const menus = new Set(permissions.allowedMenus);
  const menu = (id: string) => menus.has("all") || menus.has(id);
  return Boolean(permissions.showCost)
    && Boolean(permissions.showProfit)
    && menu("purchase_add")
    && menu("payment_out")
    && (menu("return_purchase") || menu("return_orders"));
}

export function assertPurchaseUpdateScope(permissions: PurchaseEditAccessPermissions, updates: Record<string, unknown>) {
  if (canFullyEditPurchaseRecord(permissions)) return;
  if (Object.keys(updates).some((key) => !metadataFields.has(key))) {
    throw new ForbiddenError("当前账号只能修改采购快递单号和采购备注");
  }
}
