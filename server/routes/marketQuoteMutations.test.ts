import assert from "node:assert/strict";
import test from "node:test";
import type {Express, RequestHandler} from "express";
import {registerMarketQuoteMutationRoutes} from "./marketQuoteMutations.ts";
import type {AppState} from "../store.ts";

test("market quote mutations preserve import validation and delete protection", () => {
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
    delete(path: string, ...handlers: RequestHandler[]) {
      registered.push({method: "DELETE", path, middlewareCount: handlers.length});
      return this;
    },
  } as unknown as Express;

  registerMarketQuoteMutationRoutes(app, {
    requireMenu: () => (_req, _res, next) => next(),
    requireDeletePermission: (_req, _res, next) => next(),
    asyncRoute: (handler) => handler,
    getState: () => ({marketQuotes: []} as unknown as AppState),
    actions: () => ({}) as never,
    deleteMerge: () => ({}),
    notifyPriceChanged: async () => undefined,
    notifyPriceChanges: async () => undefined,
    sendValidationError: () => undefined,
  });

  assert.deepEqual(registered, [
    {method: "POST", path: "/api/market-quotes", middlewareCount: 2},
    {method: "POST", path: "/api/market-quotes/import", middlewareCount: 2},
    {method: "PATCH", path: "/api/market-quotes/:id", middlewareCount: 2},
    {method: "DELETE", path: "/api/market-quotes/:id", middlewareCount: 3},
  ]);
});
