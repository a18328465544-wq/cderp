import assert from "node:assert/strict";
import test from "node:test";
import type {Express, RequestHandler} from "express";
import {registerMediaRoutes} from "./media.ts";

test("shared media routes are registered behind the shared menu guard", () => {
  const registered: Array<{method: string; path: string; middlewareCount: number}> = [];
  const app = {
    post(path: string, ...handlers: RequestHandler[]) {
      registered.push({method: "POST", path, middlewareCount: handlers.length});
      return this;
    },
    get(path: string, ...handlers: RequestHandler[]) {
      registered.push({method: "GET", path, middlewareCount: handlers.length});
      return this;
    },
  } as unknown as Express;

  registerMediaRoutes(app, {
    requireAnyMenu: (menuIds) => {
      assert.ok(menuIds.includes("products"));
      assert.ok(menuIds.includes("finance_reports"));
      return (_req, _res, next) => next();
    },
    asyncRoute: (handler) => handler,
    actorForRequest: () => "测试用户",
    sendNotFound: () => undefined,
  });

  assert.deepEqual(registered, [
    {method: "POST", path: "/api/media", middlewareCount: 2},
    {method: "GET", path: "/api/media", middlewareCount: 2},
    {method: "GET", path: "/api/media/assets/:id", middlewareCount: 2},
  ]);
});
