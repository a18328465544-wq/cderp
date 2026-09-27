import assert from "node:assert/strict";
import test from "node:test";
import type {Express, RequestHandler} from "express";
import {createInitialState} from "../store.ts";
import {registerFinanceAccountRoutes} from "./financeAccounts.ts";

test("finance settlement-account routes are registered in the finance route module", () => {
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

  registerFinanceAccountRoutes(app, {
    requireMenu: () => (_req, _res, next) => next(),
    requireDeletePermission: (_req, _res, next) => next(),
    asyncRoute: (handler) => handler,
    getState: () => createInitialState(),
    actions: () => ({}) as never,
    claimMutationIdempotency: async () => null,
    releaseMutationIdempotency: async () => undefined,
    transactionHookWithIdempotency: () => undefined,
  });

  assert.deepEqual(registered, [
    {method: "POST", path: "/api/gpu_erp/finance/settlement-account/create", middlewareCount: 2},
    {method: "PATCH", path: "/api/gpu_erp/finance/settlement-account/:id/reconcile", middlewareCount: 2},
    {method: "DELETE", path: "/api/gpu_erp/finance/settlement-account/:id", middlewareCount: 3},
  ]);
});
