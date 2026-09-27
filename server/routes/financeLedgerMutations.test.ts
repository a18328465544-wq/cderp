import assert from "node:assert/strict";
import test from "node:test";
import type {Express, RequestHandler} from "express";
import {registerFinanceLedgerMutationRoutes} from "./financeLedgerMutations.ts";

test("finance ledger reconciliation requires the finance menu", () => {
  const registered: Array<{method: string; path: string; middlewareCount: number}> = [];
  const app = {
    patch(path: string, ...handlers: RequestHandler[]) {
      registered.push({method: "PATCH", path, middlewareCount: handlers.length});
      return this;
    },
  } as unknown as Express;

  registerFinanceLedgerMutationRoutes(app, {
    requireMenu: () => (_req, _res, next) => next(),
    asyncRoute: (handler) => handler,
    getState: () => ({}) as never,
    actions: () => ({}) as never,
    claimMutationIdempotency: async () => null,
    releaseMutationIdempotency: async () => undefined,
  });

  assert.deepEqual(registered, [
    {method: "PATCH", path: "/api/finance-ledger/:id/reconcile", middlewareCount: 2},
  ]);
});
