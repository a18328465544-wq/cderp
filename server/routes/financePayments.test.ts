import assert from "node:assert/strict";
import test from "node:test";
import type {Express, RequestHandler} from "express";
import {createInitialState} from "../store.ts";
import {registerFinancePaymentRoutes} from "./financePayments.ts";

test("finance payment and transfer routes are registered in the finance route module", () => {
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

  registerFinancePaymentRoutes(app, {
    requireMenu: () => (_req, _res, next) => next(),
    requireDeletePermission: (_req, _res, next) => next(),
    asyncRoute: (handler) => handler,
    getState: () => createInitialState(),
    actions: () => ({}) as never,
    claimMutationIdempotency: async () => null,
    releaseMutationIdempotency: async () => undefined,
    transactionHookWithIdempotency: () => undefined,
    persistEntityImages: async () => undefined,
    paymentInMerge: () => ({}),
    paymentOutMerge: () => ({}),
    accountTransferMerge: () => ({}),
  });

  assert.deepEqual(registered, [
    {method: "POST", path: "/api/gpu_erp/finance/payment-in/create", middlewareCount: 2},
    {method: "PUT", path: "/api/gpu_erp/finance/payment-in/:id", middlewareCount: 2},
    {method: "DELETE", path: "/api/gpu_erp/finance/payment-in/:id", middlewareCount: 3},
    {method: "POST", path: "/api/gpu_erp/finance/payment-in/:id/reverse", middlewareCount: 3},
    {method: "POST", path: "/api/gpu_erp/finance/payment-out/create", middlewareCount: 2},
    {method: "PUT", path: "/api/gpu_erp/finance/payment-out/:id", middlewareCount: 2},
    {method: "DELETE", path: "/api/gpu_erp/finance/payment-out/:id", middlewareCount: 3},
    {method: "POST", path: "/api/gpu_erp/finance/payment-out/:id/reverse", middlewareCount: 3},
    {method: "POST", path: "/api/gpu_erp/finance/account-transfer/create", middlewareCount: 2},
    {method: "PUT", path: "/api/gpu_erp/finance/account-transfer/:id", middlewareCount: 2},
    {method: "DELETE", path: "/api/gpu_erp/finance/account-transfer/:id", middlewareCount: 3},
    {method: "POST", path: "/api/gpu_erp/finance/account-transfer/:id/reverse", middlewareCount: 3},
  ]);
});
