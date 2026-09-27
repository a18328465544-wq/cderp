import {useMemo} from "react";
import type {AuthSession, PermissionModel} from "@/src/services/api/endpoints/auth";
import {useAuth} from "./AuthProvider";

export type CapabilityMenu =
  | "dashboard"
  | "inventory"
  | "products"
  | "purchase_add"
  | "purchase_list"
  | "inspections"
  | "sales_add"
  | "sales_list"
  | "sales_outbound"
  | "customers"
  | "order_pool"
  | "vendors"
  | "crm"
  | "aftersales"
  | "finance"
  | "settlement_accounts"
  | "settlement_ledger"
  | "payment_in"
  | "payment_out"
  | "account_transfer"
  | "finance_reports"
  | "permissions"
  | "logs"
  | "backup"
  | "quotes"
  | "assembly"
  | "return_purchase"
  | "return_sales"
  | "return_orders"
  | "customer_funds"
  | "purchase_commission"
  | "sales_commission"
  | "ai_insights";

export type CapabilityAction =
  | CapabilityMenu
  | "showCost"
  | "showProfit"
  | "canDelete"
  | "canEditHistory"
  | "canManualOutbound";

export function hasMenuPermission(
  permissions: PermissionModel | undefined,
  menu: string,
): boolean {
  const allowed = permissions?.allowedMenus || [];
  return allowed.includes("all") || allowed.includes(menu);
}

export function canUseCapability(
  permissions: PermissionModel | undefined,
  capability: CapabilityAction,
): boolean {
  if (capability === "showCost" || capability === "showProfit" || capability === "canDelete" || capability === "canEditHistory" || capability === "canManualOutbound") {
    return permissions?.[capability] === true;
  }
  return hasMenuPermission(permissions, capability);
}

export function createCapabilities(session: AuthSession | null | undefined) {
  const permissions = session?.permissions;
  return {
    permissions,
    can: (capability: CapabilityAction) => canUseCapability(permissions, capability),
    menu: (menu: string) => hasMenuPermission(permissions, menu),
    showCost: permissions?.showCost === true,
    showProfit: permissions?.showProfit === true,
    canDelete: permissions?.canDelete === true,
    canEditHistory: permissions?.canEditHistory === true,
    canManualOutbound: permissions?.canManualOutbound === true,
  };
}

export function useCapabilities() {
  const {session} = useAuth();
  return useMemo(() => createCapabilities(session), [session]);
}
