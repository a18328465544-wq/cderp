import assert from "node:assert/strict";
import test from "node:test";
import type {Express, RequestHandler} from "express";
import {registerInspectionMutationRoutes} from "./inspectionMutations.ts";

test("inspection routes keep version history behind the same permission boundary", () => {
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

  registerInspectionMutationRoutes(app, {
    requireMenu: () => (_req, _res, next) => next(),
    requireHistoryEditPermission: (_req, _res, next) => next(),
    asyncRoute: (handler) => handler,
    getState: () => ({inspections: []}) as never,
    actions: () => ({}) as never,
    withoutImagePayload: (body) => body,
    persistEntityImages: async () => undefined,
    actorForRequest: () => "测试用户",
    sendNotFound: () => undefined,
  });

  assert.deepEqual(registered, [
    {method: "POST", path: "/api/inspections", middlewareCount: 2},
    {method: "GET", path: "/api/inspections/:id/versions", middlewareCount: 2},
    {method: "PUT", path: "/api/inspections/:id", middlewareCount: 3},
  ]);
});
