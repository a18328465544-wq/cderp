import assert from "node:assert/strict";
import test from "node:test";
import type {Express, RequestHandler} from "express";
import {registerAssemblyMutationRoutes} from "./assemblyMutations.ts";

test("assembly operations preserve delete protection", () => {
  const registered: Array<{method: string; path: string; middlewareCount: number}> = [];
  const app = {
    post(path: string, ...handlers: RequestHandler[]) {
      registered.push({method: "POST", path, middlewareCount: handlers.length});
      return this;
    },
    delete(path: string, ...handlers: RequestHandler[]) {
      registered.push({method: "DELETE", path, middlewareCount: handlers.length});
      return this;
    },
  } as unknown as Express;

  registerAssemblyMutationRoutes(app, {
    requireMenu: () => (_req, _res, next) => next(),
    requireDeletePermission: (_req, _res, next) => next(),
    asyncRoute: (handler) => handler,
    getState: () => ({}) as never,
    actions: () => ({}) as never,
  });

  assert.deepEqual(registered, [
    {method: "POST", path: "/api/assembly-operations", middlewareCount: 2},
    {method: "DELETE", path: "/api/assembly-operations/:id", middlewareCount: 3},
  ]);
});
