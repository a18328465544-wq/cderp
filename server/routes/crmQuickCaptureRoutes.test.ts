import assert from "node:assert/strict";
import test from "node:test";
import type {Express, RequestHandler} from "express";
import {registerCrmQuickCaptureRoutes} from "./crmQuickCaptureRoutes.ts";

test("CRM quick capture keeps parse and confirm behind CRM access", () => {
  const registered: Array<{method: string; path: string; middlewareCount: number}> = [];
  const app = {
    post(path: string, ...handlers: RequestHandler[]) {
      registered.push({method: "POST", path, middlewareCount: handlers.length});
      return this;
    },
  } as unknown as Express;

  registerCrmQuickCaptureRoutes(app, {
    requireMenu: () => (_req, _res, next) => next(),
    asyncRoute: (handler) => handler,
    getState: () => ({}) as never,
    actions: () => ({}) as never,
    actorForRequest: () => "测试用户",
  });

  assert.deepEqual(registered, [
    {method: "POST", path: "/api/gpu_erp/crm/quick-capture/parse", middlewareCount: 2},
    {method: "POST", path: "/api/gpu_erp/crm/quick-capture/confirm", middlewareCount: 2},
  ]);
});
