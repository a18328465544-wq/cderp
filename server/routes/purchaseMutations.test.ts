import assert from "node:assert/strict";
import test from "node:test";
import type {Express, RequestHandler} from "express";
import {registerPurchaseMutationRoutes} from "./purchaseMutations.ts";

test("purchase invoice mutation routes preserve guards and paths", () => {
  const registered: Array<{method: string; path: string; middlewareCount: number}> = [];
  const app = {
    post(path: string, ...handlers: RequestHandler[]) {
      registered.push({method: "POST", path, middlewareCount: handlers.length});
      return this;
    },
    put(path: string, ...handlers: RequestHandler[]) {
      registered.push({method: "PUT", path, middlewareCount: handlers.length});
      return this;
    },
    delete(path: string, ...handlers: RequestHandler[]) {
      registered.push({method: "DELETE", path, middlewareCount: handlers.length});
      return this;
    },
  } as unknown as Express;

  registerPurchaseMutationRoutes(app, {
    requireMenu: () => (_req, _res, next) => next(),
    requireDeletePermission: (_req, _res, next) => next(),
    requireHistoryEditPermission: (_req, _res, next) => next(),
    asyncRoute: (handler) => handler,
    getState: () => ({}) as never,
    actions: () => ({}) as never,
    permissionsForRequest: () => ({allowedMenus: [], showCost: false, showProfit: false}),
    actorForRequest: () => "测试用户",
    withoutImagePayload: (body) => body,
    persistEntityImages: async () => undefined,
    claimMutationIdempotency: async () => null,
    releaseMutationIdempotency: async () => undefined,
    transactionHookWithIdempotency: () => undefined,
  });

  assert.deepEqual(registered, [
    {method: "POST", path: "/api/purchase-invoices", middlewareCount: 2},
    {method: "PUT", path: "/api/purchase-invoices/:id", middlewareCount: 3},
    {method: "DELETE", path: "/api/purchase-invoices/:id", middlewareCount: 3},
  ]);
});
