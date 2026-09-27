import type {Express, Request, RequestHandler, Response} from "express";
import type {AuthenticatedRequest} from "../httpAuth.ts";
import {toDomainError} from "../errors.ts";
import {clearSessionCookie, setSessionCookie} from "../authCookies.ts";
import {authLoginDto, parseHttpDto} from "../httpDto.ts";
import type {StateCollectionKey, StateRecordSave} from "../db.ts";
import type {PublicStateMode} from "../publicState.ts";
import type {AppState, createStoreActions} from "../store.ts";
import type {SystemUserAccount} from "../../src/types.ts";

type AuthRouteRequest = AuthenticatedRequest<SystemUserAccount>;
type AuthSessionManager = {
  create: (userId: string, scope?: {tenantId?: string; storeId?: string}) => Promise<string>;
  revoke: (token: string | null | undefined) => Promise<void>;
};
type OkResult = {data: unknown; state?: unknown};

type AuthRouteDependencies = {
  loginRateLimiter: RequestHandler;
  authMutationRoute: (handler: RequestHandler) => RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  requireBoss: RequestHandler;
  reloadStateCollections: (keys: StateCollectionKey[]) => Promise<void>;
  reloadState: () => Promise<void>;
  replaceState: (state: AppState) => void;
  getState: () => AppState;
  actions: (req: Request) => ReturnType<typeof createStoreActions>;
  sessions: AuthSessionManager;
  setSessionCookie: typeof setSessionCookie;
  clearSessionCookie: typeof clearSessionCookie;
  createCsrfToken: (token: string) => string;
  getStateRevision: () => number | Promise<number>;
  saveStateRecords: (records: StateRecordSave[]) => Promise<unknown>;
  saveState: (state: AppState) => Promise<unknown>;
  ok: (data?: unknown, user?: SystemUserAccount, mode?: PublicStateMode) => OkResult;
  sendApiError: (req: Request, res: Response, status: number, code: string, message: string, audit?: boolean) => void;
  defaultTenantId: string;
  defaultStoreId: string;
};

function authUserRecord(state: AppState, userId: string) {
  return state.systemUsers.find((item) => item.id === userId);
}

export function registerLoginRoute(app: Express, dependencies: AuthRouteDependencies) {
  app.post("/api/auth/login", dependencies.loginRateLimiter, dependencies.authMutationRoute(async (req, res) => {
    try {
      // Login only needs the account collection. Keeping the lazy collections out
      // of this path makes sign-in independent from audit/ledger table size.
      await dependencies.reloadStateCollections(["systemUsers"]);
      const credentials = parseHttpDto(authLoginDto, req.body);
      const user = dependencies.actions(req).login(credentials);
      const token = await dependencies.sessions.create(user.id, {
        tenantId: user.tenantId || dependencies.defaultTenantId,
        storeId: user.storeId || dependencies.defaultStoreId,
      });
      dependencies.setSessionCookie(res, token);
      const savedUser = authUserRecord(dependencies.getState(), user.id);
      await dependencies.saveStateRecords([
        ...(savedUser ? [{key: "systemUsers" as const, items: [savedUser]}] : []),
        {key: "logs", items: dependencies.getState().logs.slice(0, 1)},
      ]);
      res.json({
        ...dependencies.ok({user, csrfToken: dependencies.createCsrfToken(token)}, savedUser, "initial"),
        meta: {stateMode: "initial", stateRevision: await dependencies.getStateRevision()},
      });
    } catch (error) {
      const domainError = toDomainError(error);
      if (domainError.status === 401 || domainError.code === "VALIDATION_ERROR") {
        dependencies.sendApiError(req, res, 401, "LOGIN_FAILED", "账号或密码错误", true);
        return;
      }
      await dependencies.reloadState().catch(() => undefined);
      throw error;
    }
  }));
}

export function registerLogoutRoute(app: Express, dependencies: AuthRouteDependencies) {
  app.post("/api/auth/logout", dependencies.authMutationRoute(async (req, res) => {
    const authRequest = req as AuthRouteRequest;
    try {
      await dependencies.sessions.revoke(authRequest.authToken);
      dependencies.clearSessionCookie(res);
      const result = dependencies.actions(req).logout();
      await dependencies.saveStateRecords([{key: "logs", items: dependencies.getState().logs.slice(0, 1)}]);
      await dependencies.reloadState();
      res.json(dependencies.ok(result));
    } catch (error) {
      await dependencies.reloadState().catch(() => undefined);
      throw error;
    }
  }));
}

export function registerResetRoute(app: Express, dependencies: AuthRouteDependencies) {
  app.post("/api/reset", dependencies.requireBoss, dependencies.asyncRoute(async (req, res) => {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_PRODUCTION_RESET !== "true") {
      dependencies.sendApiError(req, res, 403, "FORBIDDEN", "生产环境已禁用数据初始化接口", true);
      return;
    }
    const nextState = dependencies.actions(req).resetToDemoData();
    dependencies.replaceState(nextState);
    await dependencies.saveState(dependencies.getState());
    await dependencies.reloadState();
    res.json(dependencies.ok(dependencies.getState()));
  }));
}
