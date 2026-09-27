import type {PermissionSettings, StoreRole, SystemUserAccount} from "../src/types.ts";
import {defaultPermissions} from "../src/data/systemDefaults.ts";
import {normalizeAllowedMenus} from "../src/utils/menu.ts";
import {DEFAULT_STORE_ID, DEFAULT_TENANT_ID} from "./commercialConstants.ts";
import {ConflictError, NotFoundError, UnauthorizedError, ValidationError} from "./errors.ts";
import {hashPassword, isPasswordHash, sanitizeUserAccount, verifyPassword} from "./security.ts";

export type UserAccessState = {
  systemUsers: SystemUserAccount[];
  customPermissions: PermissionSettings[];
  currentRole: StoreRole;
  currentUserId?: string;
};

export type UserAccessDependencies = {
  state: UserAccessState;
  contextUserId?: string;
  contextRole?: StoreRole;
  contextTenantId?: string;
  contextStoreId?: string;
  getActiveUserId: () => string | undefined;
  getActiveRole: () => StoreRole;
  getActiveActor: () => string;
  nowStamp: () => string;
  genId: (prefix: string) => string;
  addLog: (user: string, module: string, type: string, target: string, beforeVal?: string, afterVal?: string) => unknown;
};

export function createUserAccessHelpers(dependencies: UserAccessDependencies) {
  const {
    state,
    contextTenantId,
    contextStoreId,
    getActiveUserId,
    getActiveRole,
    getActiveActor,
    nowStamp,
    genId,
    addLog,
  } = dependencies;

  const listUsers = () => state.systemUsers.map(sanitizeUserAccount);

  const getCurrentUser = () => {
    const current = state.systemUsers.find((user) => user.id === getActiveUserId());
    return current ? sanitizeUserAccount(current) : null;
  };

  const login = (credentials: {username?: string; password?: string} | null | undefined) => {
    const input = credentials && typeof credentials === "object" ? credentials : {};
    const username = typeof input.username === "string" ? input.username.trim() : "";
    const password = typeof input.password === "string" ? input.password : "";
    // Reject malformed or oversized credentials before password verification. The
    // scrypt fallback is intentionally expensive, so unbounded request strings
    // must not reach it.
    if (!username || username.length > 128 || password.length > 1024) {
      throw new UnauthorizedError("账号或密码错误");
    }
    const user = state.systemUsers.find((item) => item.username.toLowerCase() === username.toLowerCase());
    if (!user || !verifyPassword(user.password, password)) {
      throw new UnauthorizedError("账号或密码错误");
    }
    if (!user.enabled) {
      throw new UnauthorizedError("账号已停用");
    }
    const loginTime = nowStamp();
    const upgradedPassword = isPasswordHash(user.password) ? user.password : hashPassword(password);
    state.systemUsers = state.systemUsers.map((item) => item.id === user.id ? {...item, password: upgradedPassword, lastLoginTime: loginTime} : item);
    state.currentUserId = user.id;
    state.currentRole = user.role;
    addLog(`${user.displayName} (${user.role})`, "账号登录", "登录系统", user.username, undefined, `登录时间: ${loginTime}`);
    return sanitizeUserAccount({...user, password: upgradedPassword, lastLoginTime: loginTime});
  };

  const logout = () => {
    const user = state.systemUsers.find((item) => item.id === getActiveUserId());
    if (user) {
      addLog(`${user.displayName} (${user.role})`, "账号登录", "退出系统", user.username);
    }
    state.currentUserId = undefined;
    return null;
  };

  const createUser = (input: Partial<SystemUserAccount> | null | undefined) => {
    const payload = input && typeof input === "object" ? input : {};
    const username = typeof payload.username === "string" ? payload.username.trim() : "";
    const password = typeof payload.password === "string" ? payload.password.trim() : "";
    const displayName = typeof payload.displayName === "string" ? payload.displayName.trim() : "";
    if (!username || !password || !displayName || !payload.role) {
      throw new ValidationError("账号、密码、姓名和角色不能为空");
    }
    if (username.length > 128 || password.length > 1024 || displayName.length > 128) {
      throw new ValidationError("账号、密码或姓名长度超出限制");
    }
    if (state.systemUsers.some((item) => item.username.toLowerCase() === username.toLowerCase())) {
      throw new ConflictError("账号已存在");
    }
    const user: SystemUserAccount = {
      id: genId("USR"),
      username,
      password: hashPassword(password),
      displayName,
      role: payload.role,
      enabled: payload.enabled ?? true,
      tenantId: contextTenantId || payload.tenantId || DEFAULT_TENANT_ID,
      storeId: contextStoreId || payload.storeId || DEFAULT_STORE_ID,
      membershipStatus: "active",
      permissionOverrides: payload.permissionOverrides || {},
      remarks: payload.remarks,
    };
    state.systemUsers = [user, ...state.systemUsers];
    addLog(getActiveActor(), "账号权限", "新增账号", username, undefined, `角色: ${user.role}`);
    return sanitizeUserAccount(user);
  };

  const updateUser = (id: string, input: Partial<SystemUserAccount> | null | undefined) => {
    const existing = state.systemUsers.find((item) => item.id === id);
    if (!existing) throw new NotFoundError("账号不存在");
    const payload = input && typeof input === "object" ? input : {};
    const nextUsername = typeof payload.username === "string" ? payload.username.trim() : undefined;
    const nextDisplayName = typeof payload.displayName === "string" ? payload.displayName.trim() : undefined;
    const nextPassword = typeof payload.password === "string" ? payload.password.trim() : undefined;
    if (nextUsername === "" || nextDisplayName === "") {
      throw new ValidationError("账号和姓名不能为空");
    }
    if ((payload.username !== undefined && typeof payload.username !== "string") || (payload.displayName !== undefined && typeof payload.displayName !== "string") || (payload.password !== undefined && typeof payload.password !== "string")) {
      throw new ValidationError("账号、密码或姓名格式不合法");
    }
    if ((nextUsername && nextUsername.length > 128) || (nextDisplayName && nextDisplayName.length > 128) || (nextPassword && nextPassword.length > 1024)) {
      throw new ValidationError("账号、密码或姓名长度超出限制");
    }
    if (nextUsername && state.systemUsers.some((item) => item.id !== id && item.username.toLowerCase() === nextUsername.toLowerCase())) {
      throw new ConflictError("账号已存在");
    }
    const {tenantId: _tenantId, storeId: _storeId, membershipStatus: _membershipStatus, ...safePayload} = payload;
    const updated: SystemUserAccount = {
      ...existing,
      ...safePayload,
      tenantId: existing.tenantId || DEFAULT_TENANT_ID,
      storeId: existing.storeId || DEFAULT_STORE_ID,
      membershipStatus: payload.enabled === false ? "deactivated" : payload.enabled === true ? "active" : existing.membershipStatus || "active",
      username: nextUsername || existing.username,
      displayName: nextDisplayName || existing.displayName,
      password: nextPassword ? hashPassword(nextPassword) : existing.password,
      permissionOverrides: payload.permissionOverrides === undefined ? existing.permissionOverrides : {...(existing.permissionOverrides || {}), ...payload.permissionOverrides},
    };
    state.systemUsers = state.systemUsers.map((item) => item.id === id ? updated : item);
    if (getActiveUserId() === id) {
      state.currentRole = updated.role;
    }
    addLog(getActiveActor(), "账号权限", "更新账号", updated.username, existing.role, updated.role);
    return sanitizeUserAccount(updated);
  };

  const getPermissions = () => {
    const base = state.customPermissions.find((item) => item.role === getActiveRole()) || defaultPermissions[0]!;
    const currentUser = state.systemUsers.find((user) => user.id === getActiveUserId());
    const merged = currentUser?.permissionOverrides
      ? {...base, ...currentUser.permissionOverrides, role: getActiveRole()}
      : base;
    return {
      ...merged,
      allowedMenus: normalizeAllowedMenus(merged.allowedMenus, getActiveRole()),
    };
  };

  return {listUsers, getCurrentUser, login, logout, createUser, updateUser, getPermissions};
}
