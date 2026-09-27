import assert from "node:assert/strict";
import test from "node:test";
import type {Express, RequestHandler} from "express";
import {registerLogRoutes} from "./logs.ts";

test("log routes keep read and destructive history permissions explicit", () => {
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
    delete(path: string, ...handlers: RequestHandler[]) {
      registered.push({method: "DELETE", path, middlewareCount: handlers.length});
      return this;
    },
  } as unknown as Express;

  registerLogRoutes(app, {
    requireMenu: () => (_req, _res, next) => next(),
    requireHistoryEditPermission: (_req, _res, next) => next(),
    asyncRoute: (handler) => handler,
    actions: () => ({}) as never,
    persistRequest: async (_req, result) => result,
    ok: (data) => ({data}),
  });

  assert.deepEqual(registered, [
    {method: "GET", path: "/api/logs", middlewareCount: 2},
    {method: "POST", path: "/api/logs", middlewareCount: 2},
    {method: "DELETE", path: "/api/logs", middlewareCount: 3},
  ]);
});
