import assert from "node:assert/strict";
import test from "node:test";
import type {Express, RequestHandler} from "express";
import {registerPartnerMutationRoutes} from "./partnerMutations.ts";

test("customer and vendor mutations are registered behind their domain permissions", () => {
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

  registerPartnerMutationRoutes(app, {
    requireMenu: () => (_req, _res, next) => next(),
    requireDeletePermission: (_req, _res, next) => next(),
    asyncRoute: (handler) => handler,
    actions: () => ({}) as never,
    customerCreateMerge: () => ({}),
    vendorCreateMerge: () => ({}),
    vendorRecordMerge: () => ({}),
    deleteMerge: () => ({}),
    persistCustomerAccount: async () => undefined,
  });

  assert.deepEqual(registered, [
    {method: "POST", path: "/api/customers", middlewareCount: 2},
    {method: "DELETE", path: "/api/customers/:id", middlewareCount: 3},
    {method: "POST", path: "/api/vendors", middlewareCount: 2},
    {method: "PUT", path: "/api/vendors/:id", middlewareCount: 2},
    {method: "DELETE", path: "/api/vendors/:id", middlewareCount: 3},
  ]);
});
