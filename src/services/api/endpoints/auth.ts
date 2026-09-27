import {apiRequest, clearBrowserAuthState, setCsrfToken} from "../client";
import type {AuthLoginResponseDto, AuthMeResponseDto, AuthUserDto, PublicStateResponseDto} from "../dto/inventory.dto";
import {adaptPublicState, type ErpStateSnapshot} from "../adapters/state.adapter";
import {defaultPermissions} from "@/src/data/systemDefaults";
import {normalizeAllowedMenus} from "@/src/utils/menu";
import type {StoreRole} from "@/src/types/auth";

export interface PermissionModel {
  role: string;
  allowedMenus: string[];
  showCost: boolean;
  showProfit: boolean;
  canDelete: boolean;
  canEditHistory: boolean;
  canManualOutbound: boolean;
}

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: string;
  enabled: boolean;
  permissionOverrides?: Partial<Pick<PermissionModel, "allowedMenus" | "showCost" | "showProfit" | "canDelete" | "canEditHistory" | "canManualOutbound">>;
}

export interface AuthSession {
  user: AuthUser;
  permissions: PermissionModel;
  /** Initial state used to seed the dashboard query during auth bootstrap. */
  initialState?: ErpStateSnapshot;
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : value === undefined || value === null ? fallback : String(value);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function adaptUser(value: unknown): AuthUser {
  const dto = record(value) as AuthUserDto;
  const rawOverrides = record(dto.permissionOverrides);
  const permissionOverrides: AuthUser["permissionOverrides"] = {
    ...(Array.isArray(rawOverrides.allowedMenus) ? {allowedMenus: rawOverrides.allowedMenus.filter((item): item is string => typeof item === "string")} : {}),
    ...(typeof rawOverrides.showCost === "boolean" ? {showCost: rawOverrides.showCost} : {}),
    ...(typeof rawOverrides.showProfit === "boolean" ? {showProfit: rawOverrides.showProfit} : {}),
    ...(typeof rawOverrides.canDelete === "boolean" ? {canDelete: rawOverrides.canDelete} : {}),
    ...(typeof rawOverrides.canEditHistory === "boolean" ? {canEditHistory: rawOverrides.canEditHistory} : {}),
    ...(typeof rawOverrides.canManualOutbound === "boolean" ? {canManualOutbound: rawOverrides.canManualOutbound} : {}),
  };
  return {id: text(dto.id), username: text(dto.username), displayName: text(dto.displayName, text(dto.username, "用户")), role: text(dto.role, "未知角色"), enabled: dto.enabled !== false, permissionOverrides};
}

export function adaptPermissions(user: AuthUser, state: unknown): PermissionModel {
  const stateRecord = record(state);
  const customPermissions = Array.isArray(stateRecord.customPermissions) ? stateRecord.customPermissions : [];
  // Match server/publicState.ts: custom role settings first, then the
  // built-in role defaults, and finally the first safe default for unknown
  // roles. The previous implementation returned an empty permission set when
  // the initial state omitted customPermissions or contained a new role.
  const rolePermission = customPermissions.find((item) => record(item).role === user.role)
    || defaultPermissions.find((item) => item.role === user.role)
    || defaultPermissions[0];
  const systemUsers = Array.isArray(stateRecord.systemUsers) ? stateRecord.systemUsers : [];
  const currentUser = systemUsers.find((item) => record(item).id === user.id);
  const stateOverrides = record(record(currentUser).permissionOverrides);
  const overrides = {...stateOverrides, ...(user.permissionOverrides || {})};
  const base = record(rolePermission);
  const owner = user.role === "老板";
  const allowedMenusValue = owner ? ["all"] : (overrides.allowedMenus ?? base.allowedMenus);
  return {
    role: user.role,
    // The API already returns normalized menus, but login/session also needs
    // to be correct when a legacy alias or a partially scoped response is
    // cached by the browser. Normalize once at the API boundary so every V2
    // page consumes the same effective permission contract.
    allowedMenus: normalizeAllowedMenus(
      Array.isArray(allowedMenusValue) ? allowedMenusValue.filter((item): item is string => typeof item === "string") : undefined,
      user.role as StoreRole,
    ),
    showCost: owner || (overrides.showCost ?? base.showCost) === true,
    showProfit: owner || (overrides.showProfit ?? base.showProfit) === true,
    canDelete: owner || (overrides.canDelete ?? base.canDelete) === true,
    canEditHistory: owner || (overrides.canEditHistory ?? base.canEditHistory) === true,
    canManualOutbound: owner || (overrides.canManualOutbound ?? base.canManualOutbound) === true,
  };
}

export const authApi = {
  async login(username: string, password: string): Promise<AuthSession> {
    const response = await apiRequest<AuthLoginResponseDto>("/api/auth/login", {method: "POST", body: JSON.stringify({username, password})});
    const data = record(response.data);
    const user = adaptUser(data.user);
    const csrfToken = text(data.csrfToken);
    if (!csrfToken) throw new Error("登录响应缺少安全校验令牌");
    setCsrfToken(csrfToken);
    return {user, permissions: adaptPermissions(user, response.state), initialState: adaptPublicState({data: response.state})};
  },

  async session(signal?: AbortSignal): Promise<AuthSession> {
    const [meResponse, stateResponse] = await Promise.all([
      apiRequest<AuthMeResponseDto>("/api/auth/me", {signal}),
      apiRequest<PublicStateResponseDto>("/api/state?mode=initial", {signal}),
    ]);
    const me = record(meResponse.data);
    const user = adaptUser(me);
    setCsrfToken(me.csrfToken);
    return {user, permissions: adaptPermissions(user, stateResponse.data), initialState: adaptPublicState(stateResponse)};
  },

  logout() {
    void apiRequest("/api/auth/logout", {method: "POST", notifyOnUnauthorized: false}).catch(() => undefined);
    clearBrowserAuthState();
  },
};
