import assert from "node:assert/strict";
import test from "node:test";
import type {Express, RequestHandler} from "express";
import {registerUserManagementRoutes} from "./userManagement.ts";

test("user management routes share boss and permissions boundaries", () => {
  const registered: Array<{method: string; path: string; middlewareCount: number}> = [];
  const app = {
    get(path: string, ...handlers: RequestHandler[]) {
      registered.push({method: "GET", path, middlewareCount: handlers.length});
      return this;
    },
    post(path: string, ...handlers: RequestHandler[]) {
      registered.push({method: "POST", path, middlewareCount: handlers.length});
      return this;
    },
    put(path: string, ...handlers: RequestHandler[]) {
      registered.push({method: "PUT", path, middlewareCount: handlers.length});
      return this;
    },
  } as unknown as Express;

  registerUserManagementRoutes(app, {
    requireBoss: (_req, _res, next) => next(),
    requireMenu: () => (_req, _res, next) => next(),
    asyncRoute: (handler) => handler,
    actions: () => ({}) as never,
    assertSeatAvailable: async () => undefined,
    persistUserWithMembership: async (_req, user) => user,
    revokeUserSessions: async () => undefined,
    sendApiError: () => undefined,
    ok: (data) => ({data}),
  });

  assert.deepEqual(registered, [
    {method: "GET", path: "/api/users", middlewareCount: 3},
    {method: "POST", path: "/api/users", middlewareCount: 3},
    {method: "PUT", path: "/api/users/:id", middlewareCount: 3},
    {method: "POST", path: "/api/users/:id/deactivate", middlewareCount: 3},
    {method: "POST", path: "/api/users/:id/reactivate", middlewareCount: 3},
    {method: "POST", path: "/api/users/:id/reset-password", middlewareCount: 3},
  ]);
});
