import assert from "node:assert/strict";
import test from "node:test";
import type {Express, RequestHandler} from "express";
import {createInitialState} from "../store.ts";
import type {AuthenticatedRequest} from "../httpAuth.ts";
import {registerMarketQuoteRoutes} from "./marketQuotes.ts";

test("行情专用读取路由返回数据库快照中的行情集合，而不是商品集合", () => {
  const state = createInitialState({includeDemoData: true});
  const owner = state.systemUsers.find((user) => user.role === "老板");
  assert.ok(owner);
  const registered: {path: string; middleware: RequestHandler; handler: RequestHandler}[] = [];
  const app = {
    get(path: string, middleware: RequestHandler, handler: RequestHandler) {
      registered.push({path, middleware, handler});
      return this;
    },
  } as unknown as Express;
  registerMarketQuoteRoutes(app, {
    requireMenu: () => (_req, _res, next) => next(),
    getState: () => state,
  });

  const route = registered.find((item) => item.path === "/api/market-quotes");
  assert.ok(route);
  let payload: unknown;
  const req = {authUser: owner} as AuthenticatedRequest<typeof owner>;
  const res = {json(value: unknown) {payload = value; return this;}} as never;
  route.middleware(req, res, (error?: unknown) => {
    assert.equal(error, undefined);
    route.handler(req, res, (handlerError?: unknown) => { throw handlerError; });
  });

  const response = payload as {data: {marketQuotes: Array<{id: string}>; inventory: unknown[]}; meta: {total: number; source: string}};
  assert.equal(response.meta.source, "market-quotes-snapshot");
  assert.equal(response.meta.total, state.marketQuotes.length);
  assert.equal(response.data.marketQuotes.length, state.marketQuotes.length);
  assert.equal(response.data.marketQuotes[0]?.id, state.marketQuotes[0]?.id);
  assert.ok(Array.isArray(response.data.inventory));
  assert.equal("sn" in ((response.data.inventory[0] || {}) as Record<string, unknown>), false);
  assert.equal("warehouseLocation" in ((response.data.inventory[0] || {}) as Record<string, unknown>), false);
});
