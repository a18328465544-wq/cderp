import assert from "node:assert/strict";
import test from "node:test";
import type {Express, RequestHandler} from "express";
import {createInitialState} from "../store.ts";
import {registerFinanceReadModelRoutes} from "./financeReadModels.ts";

test("finance reconciliation is exposed as a protected read-only route", () => {
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
  } as unknown as Express;

  registerFinanceReadModelRoutes(app, {
    requireMenu: () => (_req, _res, next) => next(),
    asyncRoute: (handler) => handler,
    loadState: async () => createInitialState({includeDemoData: false, includeCrmDemoData: false}),
    getStoreDate: () => "2026-08-02",
    startOfMonth: (date) => date.slice(0, 7) + "-01",
    addDateDays: (date) => date,
    ok: (data) => ({data}),
    state: createInitialState({includeDemoData: false, includeCrmDemoData: false}),
    actions: () => ({}) as never,
    paginated: (items) => ({data: items, meta: {page: 1, pageSize: items.length, total: items.length}}),
    sendValidationError: () => undefined,
    permissionsForRequest: () => ({allowedMenus: [], showCost: false, showProfit: false}),
    claimMutationIdempotency: async () => null,
    releaseMutationIdempotency: async () => undefined,
  });

  assert.ok(registered.some((item) => item.method === "GET" && item.path === "/api/finance/reconciliation" && item.middlewareCount === 2));
});
