import assert from "node:assert/strict";
import test from "node:test";
import type {Express, RequestHandler} from "express";
import {registerProductMutationRoutes} from "./productMutations.ts";

test("product mutation routes stay in the product route module", () => {
  const registered: Array<{method: string; path: string; middlewareCount: number}> = [];
  const app = {
    post(path: string, ...handlers: RequestHandler[]) {
      registered.push({method: "POST", path, middlewareCount: handlers.length});
      return this;
    },
    put(path: string, ...handlers: RequestHandler[]) {
      registered.push({method: "PUT", path, middlewareCount: handlers.length});
      return this;
    },
    delete(path: string, ...handlers: RequestHandler[]) {
      registered.push({method: "DELETE", path, middlewareCount: handlers.length});
      return this;
    },
  } as unknown as Express;

  registerProductMutationRoutes(app, {
    requireMenu: () => (_req, _res, next) => next(),
    requireDeletePermission: (_req, _res, next) => next(),
    asyncRoute: (handler) => handler,
    actions: () => ({}) as never,
    persistProductImages: async (_req, product) => product,
    productTemplateMerge: () => ({}),
    deleteMerge: () => ({}),
  });

  assert.deepEqual(registered, [
    {method: "POST", path: "/api/products", middlewareCount: 2},
    {method: "POST", path: "/api/products/import", middlewareCount: 2},
    {method: "PUT", path: "/api/products/:id", middlewareCount: 2},
    {method: "DELETE", path: "/api/products/:id", middlewareCount: 3},
  ]);
});
