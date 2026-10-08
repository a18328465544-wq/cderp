import assert from "node:assert/strict";
import test from "node:test";
import type {Express, Request, RequestHandler, Response} from "express";
import type {ReturnOrder} from "../../src/types.ts";
import {createInitialState} from "../store.ts";
import {registerReturnMutationRoutes} from "./returnMutations.ts";

test("return mutation routes use one serialized handler with destructive permission middleware", () => {
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

  registerReturnMutationRoutes(app, {
    requireAnyMenu: () => (_req, _res, next) => next(),
    requireDeletePermission: (_req, _res, next) => next(),
    asyncRoute: (handler) => handler,
    getState: () => ({returnOrders: []}) as never,
    actions: () => ({}) as never,
    permissionsForRequest: () => ({allowedMenus: []}),
    claimMutationIdempotency: async () => null,
    releaseMutationIdempotency: async () => undefined,
    sendApiError: () => undefined,
    completeIdempotency: async () => undefined,
    releaseInventoryReservations: async () => undefined,
  });

  assert.deepEqual(registered, [
    {method: "POST", path: "/api/returns", middlewareCount: 2},
    {method: "POST", path: "/api/returns/:id/complete", middlewareCount: 2},
    {method: "POST", path: "/api/returns/:id/void", middlewareCount: 3},
    {method: "PATCH", path: "/api/returns/:id", middlewareCount: 2},
    {method: "POST", path: "/api/returns/:id/reverse", middlewareCount: 3},
    {method: "DELETE", path: "/api/returns/:id", middlewareCount: 3},
  ]);
});

function reversalRouteFixture(replay: boolean, allowedMenus = ["return_sales"], allowDelete = true) {
  const state = createInitialState();
  const order: ReturnOrder = {
    id: "TH-LOCAL-REPLAY", returnNo: "XSTH-LOCAL-001", type: "销售退货", status: "已作废",
    accountingStatus: "作废", date: "2026-09-08", relatedDocType: "销售单", relatedDocNo: "XS-LOCAL-001",
    sourceInventoryId: "KC-LOCAL", amount: 100, settlementMode: "原路退款", handler: "测试",
    reason: "本地幂等回归", inventoryAction: "退回待检测",
  };
  state.returnOrders = [order];
  const response = {data: order, stateMerge: {returnOrders: [order]}, stateDelete: {}};
  const calls = {claim: 0, release: 0, actions: 0, deletePermission: 0};
  let handlers: RequestHandler[] = [];
  const app = {
    post(path: string, ...nextHandlers: RequestHandler[]) {
      if (path === "/api/returns/:id/reverse") handlers = nextHandlers;
      return this;
    },
    patch() {return this;},
    delete() {return this;},
  } as unknown as Express;
  registerReturnMutationRoutes(app, {
    requireAnyMenu: () => (_req, _res, next) => next(),
    requireDeletePermission: (_req, res, next) => {
      calls.deletePermission += 1;
      if (!allowDelete) {res.status(403).json({code: "FORBIDDEN"}); return;}
      next();
    },
    asyncRoute: (handler) => handler,
    getState: () => state,
    actions: () => {calls.actions += 1; throw new Error("Replay/status rejection must not execute a mutation");},
    permissionsForRequest: () => ({allowedMenus}),
    claimMutationIdempotency: async () => {
      calls.claim += 1;
      return {
        request: {tenantId: "local-return-test", route: "/api/returns/:id/reverse", key: "LOCAL-RETRY", requestHash: "LOCAL-HASH"},
        ...(replay ? {replay: {statusCode: 200, response}} : {}),
      };
    },
    releaseMutationIdempotency: async () => {calls.release += 1;},
    sendApiError: (_req, res, status, code, message) => {res.status(status).json({code, message});},
    completeIdempotency: async () => {throw new Error("Replay must not persist anything");},
    releaseInventoryReservations: async () => {throw new Error("Replay must not release stock reservations");},
  });
  const execute = async () => {
    let statusCode = 200;
    let body: unknown;
    const authUser = {...state.systemUsers.find((user) => user.role === "店员")!, permissionOverrides: {allowedMenus}};
    const req = {params: {id: order.id}, tenantId: "local-return-test", storeId: "local", body: {}, authUser} as unknown as Request;
    const res = {
      status(code: number) {statusCode = code; return this;},
      json(value: unknown) {body = value; return this;},
    } as unknown as Response;
    for (const handler of handlers) {
      let advance = false;
      await handler(req, res, (error?: unknown) => {if (error) throw error; advance = true;});
      if (!advance) break;
    }
    return {statusCode, body};
  };
  return {state, calls, response, execute};
}

test("authorized reversal retry replays its successful result even though the return is now voided", async () => {
  const {state, calls, response, execute} = reversalRouteFixture(true);
  const before = structuredClone(state);
  assert.deepEqual(await execute(), {statusCode: 200, body: response});
  assert.deepEqual(calls, {claim: 1, release: 0, actions: 0, deletePermission: 1});
  assert.deepEqual(state, before);
});

test("reversal idempotency replay cannot bypass return-type permissions", async () => {
  const {state, calls, execute} = reversalRouteFixture(true, ["return_purchase"]);
  const before = structuredClone(state);
  const result = await execute();
  assert.equal(result.statusCode, 403);
  assert.deepEqual(calls, {claim: 0, release: 0, actions: 0, deletePermission: 1});
  assert.deepEqual(state, before);
});

test("reversal idempotency replay cannot bypass delete permission", async () => {
  const {state, calls, execute} = reversalRouteFixture(true, ["return_sales"], false);
  const before = structuredClone(state);
  assert.equal((await execute()).statusCode, 403);
  assert.deepEqual(calls, {claim: 0, release: 0, actions: 0, deletePermission: 1});
  assert.deepEqual(state, before);
});

test("a fresh reversal key for an already voided return is rejected and its claim is released", async () => {
  const {state, calls, execute} = reversalRouteFixture(false);
  const before = structuredClone(state);
  const result = await execute();
  assert.equal(result.statusCode, 409);
  assert.deepEqual(calls, {claim: 1, release: 1, actions: 0, deletePermission: 1});
  assert.deepEqual(state, before);
});

for (const [method, path] of [
  ["POST", "/api/returns/:id/complete"],
  ["POST", "/api/returns/:id/void"],
  ["PATCH", "/api/returns/:id"],
  ["POST", "/api/returns/:id/reverse"],
  ["DELETE", "/api/returns/:id"],
] as const) {
  for (const outcome of ["authorized", "forbidden", "missing"] as const) {
    test(`${method} ${path} checks live return type inside serialization (${outcome})`, async () => {
      const state = createInitialState();
      state.returnOrders = [];
      const order: ReturnOrder = {
        id: "TH-COLD", returnNo: "CGTH-COLD", type: "进货退货", status: "待处理",
        date: "2026-10-03", relatedDocType: "采购单", relatedDocNo: "JH-COLD",
        amount: 100, settlementMode: "原路退款", handler: "本地测试", reason: "本地回归", inventoryAction: "退回供应商",
      };
      const replayResponse = {data: order, stateMerge: {}, stateDelete: {}};
      let handlers: RequestHandler[] = [];
      let serialized = false;
      let claimCount = 0;
      const register = (registeredMethod: string) => (registeredPath: string, ...nextHandlers: RequestHandler[]) => {
        if (registeredMethod === method && registeredPath === path) handlers = nextHandlers;
        return app;
      };
      const app = {post: register("POST"), patch: register("PATCH"), delete: register("DELETE")} as unknown as Express;
      registerReturnMutationRoutes(app, {
        requireAnyMenu: () => (_req, _res, next) => next(),
        requireDeletePermission: (_req, _res, next) => next(),
        asyncRoute: (handler) => async (req, res, next) => {
          serialized = true;
          state.returnOrders = outcome === "missing" ? [] : [order];
          await handler(req, res, next);
        },
        getState: () => {
          assert.equal(serialized, true, "Business state must only be read after the serialized reload");
          return state;
        },
        permissionsForRequest: () => {
          assert.equal(serialized, true, "Return type permission must use the fresh authenticated context");
          return {allowedMenus: [outcome === "forbidden" ? "return_sales" : "return_purchase"]};
        },
        actions: () => {throw new Error("Replay/rejection must not execute domain actions");},
        claimMutationIdempotency: async () => {
          claimCount += 1;
          return {
            request: {tenantId: "local-cold", route: path, key: "LOCAL-RETRY", requestHash: "LOCAL-HASH"},
            replay: {statusCode: 200, response: replayResponse},
          };
        },
        releaseMutationIdempotency: async () => {throw new Error("No new claim should be released");},
        sendApiError: (_req, res, status, code) => {res.status(status).json({code});},
        completeIdempotency: async () => {throw new Error("Replay/rejection must not persist anything");},
        releaseInventoryReservations: async () => {throw new Error("Replay/rejection must not modify reservations");},
      });
      let statusCode = 200;
      let body: unknown;
      const authUser = {...state.systemUsers.find((user) => user.role === "店员")!, permissionOverrides: {allowedMenus: ["return_purchase"]}};
      const req = {params: {id: order.id}, body: {}, authUser} as unknown as Request;
      const res = {
        status(code: number) {statusCode = code; return this;},
        json(value: unknown) {body = value; return this;},
      } as unknown as Response;
      for (const handler of handlers) {
        let advance = false;
        await handler(req, res, (error?: unknown) => {if (error) throw error; advance = true;});
        if (!advance) break;
      }
      assert.equal(serialized, true);
      assert.equal(statusCode, outcome === "authorized" ? 200 : outcome === "forbidden" ? 403 : 404);
      assert.equal(claimCount, outcome === "authorized" ? 1 : 0);
      assert.deepEqual(body, outcome === "authorized" ? replayResponse : {code: outcome === "forbidden" ? "FORBIDDEN" : "NOT_FOUND"});
      assert.deepEqual(state.returnOrders, outcome === "missing" ? [] : [order]);
    });
  }
}
