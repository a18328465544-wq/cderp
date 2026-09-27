import type {Express, Request, RequestHandler} from "express";
import type {AuthenticatedRequest} from "../httpAuth.ts";
import type {createStoreActions} from "../store.ts";
import type {AccountPermissionOverrides, SystemUserAccount} from "../../src/types.ts";
import {DEFAULT_STORE_ID, DEFAULT_TENANT_ID} from "../commercialConstants.ts";
import {parseHttpDto, userCreateDto, userResetPasswordDto, userUpdateDto} from "../httpDto.ts";

type UserManagementRequest = AuthenticatedRequest<SystemUserAccount>;

type RawPermissionOverrides = {
  allowedMenus?: string[] | null;
  showCost?: boolean | null;
  showProfit?: boolean | null;
  canDelete?: boolean | null;
  canEditHistory?: boolean | null;
  canManualOutbound?: boolean | null;
};

function normalizePermissionOverrides(value: RawPermissionOverrides | undefined): AccountPermissionOverrides | undefined {
  if (!value) return undefined;
  return {
    allowedMenus: value.allowedMenus === null ? undefined : value.allowedMenus,
    showCost: value.showCost === null ? undefined : value.showCost,
    showProfit: value.showProfit === null ? undefined : value.showProfit,
    canDelete: value.canDelete === null ? undefined : value.canDelete,
    canEditHistory: value.canEditHistory === null ? undefined : value.canEditHistory,
    canManualOutbound: value.canManualOutbound === null ? undefined : value.canManualOutbound,
  };
}

type UserManagementDependencies = {
  requireBoss: RequestHandler;
  requireMenu: (menuId: string) => RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  actions: (req: Request) => ReturnType<typeof createStoreActions>;
  assertSeatAvailable: (tenantId: string, userId: string, storeId: string) => Promise<unknown>;
  persistUserWithMembership: (req: UserManagementRequest, user: SystemUserAccount) => Promise<SystemUserAccount>;
  revokeUserSessions?: (userId: string, tenantId: string) => Promise<unknown>;
  sendApiError: (req: UserManagementRequest, res: Parameters<RequestHandler>[1], status: number, code: string, message: string) => void;
  ok: (data?: unknown) => unknown;
};

/** User lifecycle operations are isolated from the app composition root and keep boss/seat checks together. */
export function registerUserManagementRoutes(app: Express, dependencies: UserManagementDependencies) {
  const permissionBoundary = [dependencies.requireBoss, dependencies.requireMenu("permissions")];

  app.get(
    "/api/users",
    ...permissionBoundary,
    (req, res) => {
      const authRequest = req as UserManagementRequest;
      res.json(dependencies.ok(dependencies.actions(authRequest).listUsers()));
    },
  );

  app.post(
    "/api/users",
    ...permissionBoundary,
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as UserManagementRequest;
      const parsed = parseHttpDto(userCreateDto, req.body);
      const command = {...parsed, permissionOverrides: normalizePermissionOverrides(parsed.permissionOverrides)};
      const created = dependencies.actions(authRequest).createUser(command);
      if (created.enabled) await dependencies.assertSeatAvailable(created.tenantId || DEFAULT_TENANT_ID, created.id, created.storeId || DEFAULT_STORE_ID);
      const persisted = await dependencies.persistUserWithMembership(authRequest, created);
      res.status(201).json(dependencies.ok(persisted));
    }),
  );

  app.put(
    "/api/users/:id",
    ...permissionBoundary,
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as UserManagementRequest;
      const parsed = parseHttpDto(userUpdateDto, req.body);
      const command = {...parsed, permissionOverrides: normalizePermissionOverrides(parsed.permissionOverrides)};
      const updated = dependencies.actions(authRequest).updateUser(req.params.id!, command);
      if (updated.enabled) await dependencies.assertSeatAvailable(updated.tenantId || DEFAULT_TENANT_ID, updated.id, updated.storeId || DEFAULT_STORE_ID);
      const persisted = await dependencies.persistUserWithMembership(authRequest, updated);
      res.json(dependencies.ok(persisted));
    }),
  );

  app.post(
    "/api/users/:id/deactivate",
    ...permissionBoundary,
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as UserManagementRequest;
      if (req.params.id === authRequest.authUser?.id) {
        dependencies.sendApiError(authRequest, res, 400, "SELF_DEACTIVATION", "不能停用当前登录账号");
        return;
      }
      const updated = dependencies.actions(authRequest).updateUser(req.params.id!, {enabled: false});
      const persisted = await dependencies.persistUserWithMembership(authRequest, updated);
      await dependencies.revokeUserSessions?.(updated.id, updated.tenantId || DEFAULT_TENANT_ID);
      res.json(dependencies.ok(persisted));
    }),
  );

  app.post(
    "/api/users/:id/reactivate",
    ...permissionBoundary,
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as UserManagementRequest;
      const updated = dependencies.actions(authRequest).updateUser(req.params.id!, {enabled: true});
      await dependencies.assertSeatAvailable(updated.tenantId || DEFAULT_TENANT_ID, updated.id, updated.storeId || DEFAULT_STORE_ID);
      const persisted = await dependencies.persistUserWithMembership(authRequest, updated);
      res.json(dependencies.ok(persisted));
    }),
  );

  app.post(
    "/api/users/:id/reset-password",
    ...permissionBoundary,
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as UserManagementRequest;
      const command = parseHttpDto(userResetPasswordDto, req.body);
      const updated = dependencies.actions(authRequest).updateUser(req.params.id!, command);
      const persisted = await dependencies.persistUserWithMembership(authRequest, updated);
      await dependencies.revokeUserSessions?.(updated.id, updated.tenantId || DEFAULT_TENANT_ID);
      res.json(dependencies.ok(persisted));
    }),
  );
}
