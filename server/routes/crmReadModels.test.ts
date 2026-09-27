import assert from "node:assert/strict";
import test from "node:test";
import type {Express, RequestHandler} from "express";
import {createInitialState} from "../store.ts";
import {registerCrmReadModelRoutes} from "./crmReadModels.ts";

test("legacy CRM read routes keep their four filtered projections together", () => {
  const registered: Array<{method: string; path: string; middlewareCount: number}> = [];
  const app = {
    get(path: string, ...handlers: RequestHandler[]) {
      registered.push({method: "GET", path, middlewareCount: handlers.length});
      return this;
    },
  } as unknown as Express;

  registerCrmReadModelRoutes(app, {
    requireMenu: () => (_req, _res, next) => next(),
    getState: createInitialState,
    actions: () => ({}) as never,
    paginated: (items) => ({data: items}),
    matchesKeyword: (values, keyword) => !keyword || values.some((value) => String(value || "").includes(keyword)),
  });

  assert.deepEqual(registered, [
    {method: "GET", path: "/api/gpu_erp/crm/customers", middlewareCount: 2},
    {method: "GET", path: "/api/gpu_erp/crm/follow-ups", middlewareCount: 2},
    {method: "GET", path: "/api/gpu_erp/crm/requirements", middlewareCount: 2},
    {method: "GET", path: "/api/gpu_erp/crm/summary", middlewareCount: 2},
  ]);
});
