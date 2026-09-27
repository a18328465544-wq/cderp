export interface PurchaseCapabilities {
  canReadCustomers: boolean;
  canReadVendors: boolean;
  canReadProducts: boolean;
  canCreateCustomer: boolean;
  canCreateVendor: boolean;
  canCreateProduct: boolean;
  canReadSettlementAccounts: boolean;
  canInspect: boolean;
  canEnterPurchaseCost: boolean;
}

/**
 * Purchase UI capabilities are derived from the server's existing menu and
 * scoped state contract. The purchase create endpoint needs the reference
 * projection (products, sources and accounts) even when the user does not
 * have the corresponding management page permission. Quick-create actions
 * remain separately gated by their mutation endpoint permissions.
 */
export function derivePurchaseCapabilities(allowedMenus: readonly string[]): PurchaseCapabilities {
  const hasAllPermissions = allowedMenus.includes("all");
  const has = (menu: string) => hasAllPermissions || allowedMenus.includes(menu);
  return {
    canReadCustomers: has("purchase_add") || has("customers") || has("crm"),
    canReadVendors: has("purchase_add") || has("vendors"),
    canReadProducts: has("purchase_add") || has("products"),
    canCreateCustomer: has("customers"),
    canCreateVendor: has("vendors"),
    canCreateProduct: has("products"),
    canReadSettlementAccounts: has("purchase_add") || has("settlement_accounts"),
    canInspect: has("inspections"),
    canEnterPurchaseCost: has("purchase_add"),
  };
}
