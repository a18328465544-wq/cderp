import type { PermissionSettings, SystemUserAccount } from "../types";
import { ROLE_DEFAULT_MENU_IDS } from "../utils/menu";

export const defaultPermissions: PermissionSettings[] = [
  {
    role: "老板",
    showCost: true,
    showProfit: true,
    canDelete: true,
    canEditHistory: true,
    canManualOutbound: true,
    allowedMenus: ROLE_DEFAULT_MENU_IDS["老板"],
  },
  {
    role: "店员",
    showCost: true,
    showProfit: false,
    canDelete: false,
    canEditHistory: false,
    canManualOutbound: false,
    allowedMenus: ROLE_DEFAULT_MENU_IDS["店员"],
  },
  {
    role: "检测员",
    showCost: false,
    showProfit: false,
    canDelete: false,
    canEditHistory: false,
    canManualOutbound: false,
    allowedMenus: ROLE_DEFAULT_MENU_IDS["检测员"],
  },
  {
    role: "财务",
    showCost: true,
    showProfit: true,
    canDelete: false,
    canEditHistory: false,
    canManualOutbound: false,
    allowedMenus: ROLE_DEFAULT_MENU_IDS["财务"],
  },
];

export const initialSystemUsers: SystemUserAccount[] = [
  {
    id: "USR-ADMIN",
    username: "admin",
    password: "admin123",
    displayName: "精诚小张",
    role: "老板",
    enabled: true,
    remarks: "默认老板账号，上线后请立即修改密码",
  },
  {
    id: "USR-SALES",
    username: "sales",
    password: "sales123",
    displayName: "销售小王",
    role: "店员",
    enabled: true,
  },
  {
    id: "USR-QC",
    username: "qc",
    password: "qc123",
    displayName: "质检老默",
    role: "检测员",
    enabled: true,
  },
  {
    id: "USR-FINANCE",
    username: "finance",
    password: "finance123",
    displayName: "财务小李",
    role: "财务",
    enabled: true,
  },
];
