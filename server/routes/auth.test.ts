import assert from "node:assert/strict";
import test from "node:test";
import type {Express, RequestHandler} from "express";
import {registerLoginRoute, registerLogoutRoute, registerResetRoute} from "./auth.ts";

test("auth routes keep login, logout and reset in one explicit route boundary", () => {
  const registered: Array<{method: string; path: string; middlewareCount: number}> = [];
  const app = {
    post(path: string, ...handlers: RequestHandler[]) {
      registered.push({method: "POST", path, middlewareCount: handlers.length});
      return this;
    },
  } as unknown as Express;
  const dependencies = {
    loginRateLimiter: (_req: never, _res: never, next: () => void) => next(),
    authMutationRoute: (handler: RequestHandler) => handler,
    asyncRoute: (handler: RequestHandler) => handler,
    requireBoss: (_req: never, _res: never, next: () => void) => next(),
  } as never;

  registerLoginRoute(app, dependencies);
  registerLogoutRoute(app, dependencies);
  registerResetRoute(app, dependencies);

  assert.deepEqual(registered, [
    {method: "POST", path: "/api/auth/login", middlewareCount: 2},
    {method: "POST", path: "/api/auth/logout", middlewareCount: 1},
    {method: "POST", path: "/api/reset", middlewareCount: 2},
  ]);
});
