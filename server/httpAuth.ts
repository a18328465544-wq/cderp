import type express from "express";
import { timingSafeEqual } from "node:crypto";
import {clearSessionCookie, csrfTokenMatches, CSRF_HEADER_NAME, getSessionCookie} from "./authCookies.ts";

export type AuthenticatedRequest<TUser> = express.Request & {
  authToken?: string;
  authMode?: "bearer" | "cookie";
  authUser?: TUser;
  tenantId?: string;
  storeId?: string;
  requestId?: string;
};

type SessionRecord = { userId: string; tenantId?: string; storeId?: string };
type SessionResolver = {
  resolve(token: string | null): Promise<SessionRecord | null>;
  revoke(token: string | null): Promise<void>;
};

export type AuthDenialDetails = {
  status: number;
  code: string;
};

export type AuthMiddlewareOptions = {
  onDenied?: (req: express.Request, details: AuthDenialDetails) => void;
};

function errorPayload(req: express.Request, code: string, message: string) {
  const requestId = (req as AuthenticatedRequest<unknown>).requestId;
  return { error: { code, message, ...(requestId ? { requestId } : {}) } };
}

function deny(
  req: express.Request,
  res: express.Response,
  details: AuthDenialDetails,
  message: string,
  options?: AuthMiddlewareOptions,
) {
  try {
    options?.onDenied?.(req, details);
  } catch {
    // An audit hook must never turn a deliberate 401/403 into a failed request.
  }
  res.status(details.status).json(errorPayload(req, details.code, message));
}

export function getBearerToken(req: express.Request) {
  const header = req.headers.authorization || "";
  const [type, token] = header.split(" ");
  return type?.toLowerCase() === "bearer" && token ? token : null;
}

function tokenEquals(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function createRequireOpenApiToken(expectedToken: string, options?: AuthMiddlewareOptions): express.RequestHandler {
  return (req, res, next) => {
    if (!expectedToken) {
      deny(req, res, { status: 503, code: "OPEN_API_NOT_CONFIGURED" }, "开放 API 尚未配置 OPEN_API_TOKEN。", options);
      return;
    }
    const token = getBearerToken(req) || String(req.headers["x-api-token"] || "");
    if (!token || !tokenEquals(token, expectedToken)) {
      deny(req, res, { status: 401, code: "OPEN_API_UNAUTHORIZED" }, "开放 API Token 无效。", options);
      return;
    }
    next();
  };
}

export function createRequireAuth<TUser extends { id: string }>(
  sessions: SessionResolver,
  resolveUser: (userId: string, session?: SessionRecord) => TUser | null | Promise<TUser | null>,
  options?: AuthMiddlewareOptions,
): express.RequestHandler {
  return (req, res, next) => {
    void (async () => {
      const authRequest = req as AuthenticatedRequest<TUser>;
      const bearerToken = getBearerToken(req);
      const cookieToken = bearerToken ? null : getSessionCookie(req);
      const token = bearerToken || cookieToken;
      const session = await sessions.resolve(token);
      if (!session) {
        if (cookieToken) clearSessionCookie(res);
        deny(req, res, { status: 401, code: "UNAUTHORIZED" }, "请先登录系统", options);
        return;
      }
      const user = await resolveUser(session.userId, session);
      if (!user) {
        await sessions.revoke(token);
        if (cookieToken) clearSessionCookie(res);
        deny(req, res, { status: 401, code: "UNAUTHORIZED" }, "账号已停用或不存在", options);
        return;
      }
      authRequest.authToken = token || undefined;
      authRequest.authMode = bearerToken ? "bearer" : "cookie";
      authRequest.tenantId = session.tenantId;
      authRequest.storeId = session.storeId;
      authRequest.authUser = user;
      next();
    })().catch(next);
  };
}

export function createRequireCsrf(options?: AuthMiddlewareOptions): express.RequestHandler {
  return (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase())) {
      next();
      return;
    }
    const authRequest = req as AuthenticatedRequest<unknown>;
    // Non-browser API clients continue to use Bearer authentication. CSRF applies only when
    // ambient browser cookies authorize the mutation.
    if (authRequest.authMode !== "cookie") {
      next();
      return;
    }
    const header = req.headers[CSRF_HEADER_NAME];
    const candidate = Array.isArray(header) ? header[0] : header;
    if (!authRequest.authToken || !csrfTokenMatches(authRequest.authToken, candidate)) {
      deny(req, res, {status: 403, code: "CSRF_INVALID"}, "安全校验已失效，请刷新页面后重试", options);
      return;
    }
    next();
  };
}

type MenuPermission = { allowedMenus?: string[] };

function requireAuthenticated<TUser>(req: AuthenticatedRequest<TUser>, res: express.Response, options?: AuthMiddlewareOptions) {
  if (req.authUser) return true;
  deny(req, res, { status: 401, code: "UNAUTHORIZED" }, "请先登录系统", options);
  return false;
}

export function createRequireMenu<TUser>(
  menuId: string,
  getPermissions: (user: TUser) => MenuPermission,
  options?: AuthMiddlewareOptions,
): express.RequestHandler {
  return (req, res, next) => {
    const authRequest = req as AuthenticatedRequest<TUser>;
    if (!requireAuthenticated(authRequest, res, options)) return;
    const allowedMenus = getPermissions(authRequest.authUser as TUser).allowedMenus || [];
    if (!allowedMenus.includes("all") && !allowedMenus.includes(menuId)) {
      deny(req, res, { status: 403, code: "FORBIDDEN" }, "当前账号没有该窗口入口权限", options);
      return;
    }
    next();
  };
}

export function createRequireAnyMenu<TUser>(
  menuIds: string[],
  getPermissions: (user: TUser) => MenuPermission,
  options?: AuthMiddlewareOptions,
): express.RequestHandler {
  return (req, res, next) => {
    const authRequest = req as AuthenticatedRequest<TUser>;
    if (!requireAuthenticated(authRequest, res, options)) return;
    const allowedMenus = getPermissions(authRequest.authUser as TUser).allowedMenus || [];
    if (allowedMenus.includes("all") || menuIds.some((menuId) => allowedMenus.includes(menuId))) {
      next();
      return;
    }
    deny(req, res, { status: 403, code: "FORBIDDEN" }, "当前账号没有该窗口入口权限", options);
  };
}
