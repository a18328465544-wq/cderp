import assert from "node:assert/strict";
import test from "node:test";
import type {Express, RequestHandler} from "express";
import {createInitialState} from "../store.ts";
import {registerCrmMutationRoutes} from "./crmMutations.ts";

test("CRM customer and activity mutation routes stay in the CRM feature module", () => {
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

  registerCrmMutationRoutes(app, {
    requireMenu: () => (_req, _res, next) => next(),
    asyncRoute: (handler) => handler,
    getState: createInitialState,
    actions: () => ({}) as never,
    actorForRequest: () => "测试用户",
  });

  assert.deepEqual(registered, [
    {method: "POST", path: "/api/gpu_erp/crm/customer/lead-preview", middlewareCount: 2},
    {method: "POST", path: "/api/gpu_erp/crm/customer/create", middlewareCount: 2},
    {method: "PATCH", path: "/api/gpu_erp/crm/customer/:id", middlewareCount: 2},
    {method: "POST", path: "/api/gpu_erp/crm/follow-up/create", middlewareCount: 2},
    {method: "POST", path: "/api/gpu_erp/crm/requirement/create", middlewareCount: 2},
    {method: "POST", path: "/api/gpu_erp/crm/quote/create", middlewareCount: 2},
  ]);
});
