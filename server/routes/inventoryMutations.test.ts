import assert from "node:assert/strict";
import test from "node:test";
import type {Express, RequestHandler} from "express";
import {registerInventoryMutationRoutes} from "./inventoryMutations.ts";

test("inventory routes share the inventory permission boundary", () => {
  const registered: Array<{method: string; path: string; middlewareCount: number}> = [];
  const app = {
    get(path: string, ...handlers: RequestHandler[]) {
      registered.push({method: "GET", path, middlewareCount: handlers.length});
      return this;
    },
    patch(path: string, ...handlers: RequestHandler[]) {
      registered.push({method: "PATCH", path, middlewareCount: handlers.length});
      return this;
    },
    post(path: string, ...handlers: RequestHandler[]) {
      registered.push({method: "POST", path, middlewareCount: handlers.length});
      return this;
    },
  } as unknown as Express;

  registerInventoryMutationRoutes(app, {
    requireMenu: () => (_req, _res, next) => next(),
    asyncRoute: (handler) => handler,
    getState: () => ({}) as never,
    actions: () => ({}) as never,
    sanitizeInventoryRows: (rows) => rows,
  });

  assert.deepEqual(registered, [
    {method: "PATCH", path: "/api/inventory/batch", middlewareCount: 2},
    {method: "GET", path: "/api/inventory/summary", middlewareCount: 2},
    {method: "GET", path: "/api/inventory/items", middlewareCount: 2},
    {method: "POST", path: "/api/inventory/import", middlewareCount: 2},
    {method: "POST", path: "/api/inventory/scan-flow", middlewareCount: 2},
  ]);
});
