/** Compatibility auth contracts retained for legacy state snapshots. */
export type StoreRole = "老板" | "店员" | "检测员" | "财务";

export interface PermissionSettings {
  role: StoreRole;
  showCost: boolean;
  showProfit: boolean;
  canDelete: boolean;
  canEditHistory: boolean;
  canManualOutbound: boolean;
  allowedMenus: string[];
}

export type AccountPermissionOverrides = Partial<Omit<PermissionSettings, "role">>;

export interface SystemUserAccount {
  id: string;
  username: string;
  password?: string;
  displayName: string;
  role: StoreRole;
  enabled: boolean;
  /** Commercial control-plane scope. Optional for legacy imported accounts. */
  tenantId?: string;
  storeId?: string;
  membershipStatus?: "active" | "invited" | "deactivated";
  permissionOverrides?: AccountPermissionOverrides;
  lastLoginTime?: string;
  remarks?: string;
}

export type SafeSystemUserAccount = Omit<SystemUserAccount, "password">;
