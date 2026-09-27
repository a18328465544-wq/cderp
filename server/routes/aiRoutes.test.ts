import assert from "node:assert/strict";
import test from "node:test";
import type {Express, RequestHandler} from "express";
import {createInitialState} from "../store.ts";
import {registerAiRoutes} from "./aiRoutes.ts";

test("AI routes stay in the AI feature module and keep guard ordering", () => {
  const registered: Array<{method: string; path: string; middlewareCount: number}> = [];
  const app = {
    get(path: string, ...handlers: RequestHandler[]) {
      registered.push({method: "GET", path, middlewareCount: handlers.length});
      return this;
    },
    post(path: string, ...handlers: RequestHandler[]) {
      registered.push({method: "POST", path, middlewareCount: handlers.length});
      return this;
    },
    put(path: string, ...handlers: RequestHandler[]) {
      registered.push({method: "PUT", path, middlewareCount: handlers.length});
      return this;
    },
  } as unknown as Express;

  registerAiRoutes(app, {
    requireAnyMenu: () => (_req, _res, next) => next(),
    requireBoss: (_req, _res, next) => next(),
    requireMenu: () => (_req, _res, next) => next(),
    asyncRoute: (handler) => handler,
    loadState: async () => createInitialState(),
    replaceState: () => undefined,
    reloadState: async () => undefined,
    getState: createInitialState,
    featureEnabled: async () => true,
    recordUsage: async () => undefined,
    estimateUsageUnits: () => 1,
    actorForRequest: () => "测试用户",
    sendApiError: () => undefined,
    logRequestError: () => undefined,
    defaultTenantId: "tenant-test",
  });

  assert.deepEqual(registered, [
    {method: "GET", path: "/api/ai/insights", middlewareCount: 2},
    {method: "POST", path: "/api/ai/insights/refresh", middlewareCount: 3},
    {method: "POST", path: "/api/ai/copilot", middlewareCount: 2},
    {method: "GET", path: "/api/ai/insight-actions", middlewareCount: 2},
    {method: "PUT", path: "/api/ai/insight-actions/:id", middlewareCount: 3},
  ]);
});
