import assert from "node:assert/strict";
import test from "node:test";
import type {Express, RequestHandler} from "express";
import {registerAftersalesMutationRoutes} from "./aftersalesMutations.ts";
import {createInitialState} from "../store.ts";

test("aftersales mutations keep the compact two-route surface", () => {
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
  } as unknown as Express;

  registerAftersalesMutationRoutes(app, {
    requireMenu: () => (_req, _res, next) => next(),
    asyncRoute: (handler) => handler,
    getState: () => ({}) as never,
    actions: () => ({}) as never,
    claimMutationIdempotency: async () => null,
    releaseMutationIdempotency: async () => undefined,
    transactionHookWithIdempotency: () => undefined,
  });

  assert.deepEqual(registered, [
    {method: "POST", path: "/api/aftersales", middlewareCount: 2},
    {method: "PATCH", path: "/api/aftersales/:id", middlewareCount: 2},
  ]);
});

for (const method of ["post", "patch"] as const) {
  test(`aftersales ${method} replay applies current actor permissions without running or saving the command`, async () => {
    const state = createInitialState();
    const record = state.aftersales[0]!;
    const actor = {...state.systemUsers.find((user) => user.role === "店员")!, permissionOverrides: {allowedMenus: ["aftersales"], showCost: false, showProfit: false}};
    let handler: RequestHandler | undefined;
    const app = {
      post(_path: string, ...handlers: RequestHandler[]) {if (method === "post") handler = handlers.at(-1); return this;},
      patch(_path: string, ...handlers: RequestHandler[]) {if (method === "patch") handler = handlers.at(-1); return this;},
    } as unknown as Express;
    let actions = 0;
    registerAftersalesMutationRoutes(app, {
      requireMenu: () => (_req, _res, next) => next(), asyncRoute: (value) => value, getState: () => state,
      actions: () => {actions += 1; throw new Error("replay must not run an action");},
      claimMutationIdempotency: async () => ({request: {tenantId: "test", route: "test", key: "test", requestHash: "test"}, replay: {statusCode: 200, response: {data: record, stateMerge: {aftersales: [record], inventory: state.inventory, salesInvoices: state.salesInvoices, paymentOutRecords: state.paymentOutRecords}, state}}}),
      releaseMutationIdempotency: async () => {throw new Error("replay must not release a key");}, transactionHookWithIdempotency: () => {throw new Error("replay must not save");},
    });
    let response: ReturnType<typeof import("../aftersalesResponse.ts").projectAftersalesResponse> | undefined;
    const res = {status() {return this;}, json(value: typeof response) {response = value; return this;}};
    await handler!({params: {id: record.id}, authUser: actor} as never, res as never, () => undefined);
    assert.equal(actions, 0);
    assert.equal(response!.data!.id, record.id);
    assert.equal("state" in response!, false);
    assert.equal(response!.stateMerge.paymentOutRecords, undefined);
    assert.ok(response!.stateMerge.inventory!.every((card) => (card as {costPrice: number}).costPrice === 0));
  });
}

test("missing aftersales is rejected before claiming a key or persisting an audit patch", async () => {
  const state = createInitialState();
  let handler: RequestHandler | undefined;
  let claims = 0;
  const app = {post() {return this;}, patch(_path: string, ...handlers: RequestHandler[]) {handler = handlers.at(-1); return this;}} as unknown as Express;
  registerAftersalesMutationRoutes(app, {
    requireMenu: () => (_req, _res, next) => next(), asyncRoute: (value) => value, getState: () => state,
    actions: () => {throw new Error("missing record must not run an action");},
    claimMutationIdempotency: async () => {claims += 1; return null;}, releaseMutationIdempotency: async () => undefined, transactionHookWithIdempotency: () => undefined,
  });
  const before = structuredClone(state);
  await assert.rejects(async () => handler!({params: {id: "missing"}} as never, {} as never, () => undefined), /售后单不存在/);
  assert.equal(claims, 0); assert.deepEqual(state, before);
});
