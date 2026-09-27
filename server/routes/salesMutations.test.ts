import assert from "node:assert/strict";
import test from "node:test";
import type {Express, RequestHandler} from "express";
import {registerSalesMutationRoutes} from "./salesMutations.ts";

test("sales invoice and outbound routes preserve guard ordering", () => {
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

  registerSalesMutationRoutes(app, {
    requireMenu: () => (_req, _res, next) => next(),
    requireHistoryEditPermission: (_req, _res, next) => next(),
    requireDeletePermission: (_req, _res, next) => next(),
    requireManualOutboundPermission: (_req, _res, next) => next(),
    asyncRoute: (handler) => handler,
    getState: () => ({}) as never,
    actions: () => ({}) as never,
    actorForRequest: () => "测试用户",
    claimMutationIdempotency: async () => null,
    releaseMutationIdempotency: async () => undefined,
    transactionHookWithIdempotency: () => undefined,
    releaseInventoryReservations: async () => undefined,
    reserveSalesOutboundInventory: async () => undefined,
    notifySalesInvoiceCreated: async () => undefined,
    ok: (data) => ({data}),
  });

  assert.deepEqual(registered, [
    {method: "POST", path: "/api/sales-invoices", middlewareCount: 2},
    {method: "PUT", path: "/api/sales-invoices/:id", middlewareCount: 3},
    {method: "DELETE", path: "/api/sales-invoices/:id", middlewareCount: 3},
    {method: "POST", path: "/api/sales-invoices/:id/outbound/preflight", middlewareCount: 3},
    {method: "POST", path: "/api/sales-invoices/:id/outbound", middlewareCount: 3},
  ]);
});
