import assert from "node:assert/strict";
import test from "node:test";
import type {Express, RequestHandler} from "express";
import {registerAftersalesMutationRoutes} from "./aftersalesMutations.ts";

test("aftersales mutations keep the compact two-route surface", () => {
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
  } as unknown as Express;

  registerAftersalesMutationRoutes(app, {
    requireMenu: () => (_req, _res, next) => next(),
    asyncRoute: (handler) => handler,
    getState: () => ({}) as never,
    actions: () => ({}) as never,
    claimMutationIdempotency: async () => null,
    releaseMutationIdempotency: async () => undefined,
    transactionHookWithIdempotency: () => undefined,
  });

  assert.deepEqual(registered, [
    {method: "POST", path: "/api/aftersales", middlewareCount: 2},
    {method: "PATCH", path: "/api/aftersales/:id", middlewareCount: 2},
  ]);
});
