import assert from "node:assert/strict";
import test from "node:test";
import type {Express, RequestHandler} from "express";
import {registerReturnMutationRoutes} from "./returnMutations.ts";

test("return mutation routes keep type guard before destructive actions", () => {
  const registered: Array<{method: string; path: string; middlewareCount: number}> = [];
  const app = {
    post(path: string, ...handlers: RequestHandler[]) {
      registered.push({method: "POST", path, middlewareCount: handlers.length});
      return this;
    },
    patch(path: string, ...handlers: RequestHandler[]) {
      registered.push({method: "PATCH", path, middlewareCount: handlers.length});
      return this;
    },
    delete(path: string, ...handlers: RequestHandler[]) {
      registered.push({method: "DELETE", path, middlewareCount: handlers.length});
      return this;
    },
  } as unknown as Express;

  registerReturnMutationRoutes(app, {
    requireAnyMenu: () => (_req, _res, next) => next(),
    requireDeletePermission: (_req, _res, next) => next(),
    asyncRoute: (handler) => handler,
    getState: () => ({returnOrders: []}) as never,
    actions: () => ({}) as never,
    permissionsForRequest: () => ({allowedMenus: []}),
    claimMutationIdempotency: async () => null,
    releaseMutationIdempotency: async () => undefined,
    sendApiError: () => undefined,
    completeIdempotency: async () => undefined,
    releaseInventoryReservations: async () => undefined,
  });

  assert.deepEqual(registered, [
    {method: "POST", path: "/api/returns", middlewareCount: 2},
    {method: "POST", path: "/api/returns/:id/complete", middlewareCount: 3},
    {method: "POST", path: "/api/returns/:id/void", middlewareCount: 4},
    {method: "PATCH", path: "/api/returns/:id", middlewareCount: 3},
    {method: "POST", path: "/api/returns/:id/reverse", middlewareCount: 4},
    {method: "DELETE", path: "/api/returns/:id", middlewareCount: 4},
  ]);
});
