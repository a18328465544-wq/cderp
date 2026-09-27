import assert from "node:assert/strict";
import test from "node:test";
import type {Express, RequestHandler} from "express";
import {registerCrmNormalizedReadRoutes} from "./crmNormalizedReads.ts";

test("normalized CRM read routes keep tenant-scoped projections together", () => {
  const registered: Array<{method: string; path: string; middlewareCount: number}> = [];
  const app = {
    get(path: string, ...handlers: RequestHandler[]) {
      registered.push({method: "GET", path, middlewareCount: handlers.length});
      return this;
    },
  } as unknown as Express;

  registerCrmNormalizedReadRoutes(app, {
    requireMenu: () => (_req, _res, next) => next(),
    asyncRoute: (handler) => handler,
  });

  assert.deepEqual(registered, [
    {method: "GET", path: "/api/gpu_erp/crm/accounts", middlewareCount: 2},
    {method: "GET", path: "/api/gpu_erp/crm/accounts/:id/timeline", middlewareCount: 2},
    {method: "GET", path: "/api/gpu_erp/crm/quick-capture/leads", middlewareCount: 2},
  ]);
});
