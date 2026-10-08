import assert from "node:assert/strict";
import test from "node:test";
import type {Express, RequestHandler} from "express";
import {createInitialState, createStoreActions} from "../store.ts";
import {paymentInMerge, paymentOutMerge} from "../financeStateMerges.ts";
import {registerFinancePaymentRoutes} from "./financePayments.ts";

test("finance payment and transfer routes are registered in the finance route module", () => {
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

  registerFinancePaymentRoutes(app, {
    requireMenu: () => (_req, _res, next) => next(),
    requireDeletePermission: (_req, _res, next) => next(),
    asyncRoute: (handler) => handler,
    getState: () => createInitialState(),
    actions: () => ({}) as never,
    claimMutationIdempotency: async () => null,
    releaseMutationIdempotency: async () => undefined,
    transactionHookWithIdempotency: () => undefined,
    persistEntityImages: async () => undefined,
    paymentInMerge: () => ({}),
    paymentOutMerge: () => ({}),
    accountTransferMerge: () => ({}),
  });

  assert.deepEqual(registered, [
    {method: "POST", path: "/api/gpu_erp/finance/payment-in/create", middlewareCount: 2},
    {method: "PUT", path: "/api/gpu_erp/finance/payment-in/:id", middlewareCount: 2},
    {method: "DELETE", path: "/api/gpu_erp/finance/payment-in/:id", middlewareCount: 3},
    {method: "POST", path: "/api/gpu_erp/finance/payment-in/:id/reverse", middlewareCount: 3},
    {method: "POST", path: "/api/gpu_erp/finance/payment-out/create", middlewareCount: 2},
    {method: "PUT", path: "/api/gpu_erp/finance/payment-out/:id", middlewareCount: 2},
    {method: "DELETE", path: "/api/gpu_erp/finance/payment-out/:id", middlewareCount: 3},
    {method: "POST", path: "/api/gpu_erp/finance/payment-out/:id/reverse", middlewareCount: 3},
    {method: "POST", path: "/api/gpu_erp/finance/account-transfer/create", middlewareCount: 2},
    {method: "PUT", path: "/api/gpu_erp/finance/account-transfer/:id", middlewareCount: 2},
    {method: "DELETE", path: "/api/gpu_erp/finance/account-transfer/:id", middlewareCount: 3},
    {method: "POST", path: "/api/gpu_erp/finance/account-transfer/:id/reverse", middlewareCount: 3},
  ]);
});

test("cached finance mutation responses use current permissions rather than exposing stored private patches", async () => {
  for (const receipt of [true, false]) {
    const state = createInitialState({includeDemoData: true});
    const actor = state.systemUsers.find((user) => user.role === "店员")!;
    actor.permissionOverrides = {allowedMenus: [receipt ? "payment_in" : "payment_out"], showCost: false, showProfit: false};
    const actions = createStoreActions(state);
    const account = state.settlementAccounts.find((item) => item.enabled)!;
    const payment = receipt ? actions.createPaymentIn({customerName: "本地收入", accountId: account.id, amount: 10, handler: "本地测试", paymentMethod: "现金", businessType: "返点收入", time: "2026-10-04 10:00:00"})
      : actions.createPaymentOut({supplierName: "本地支出", accountId: account.id, amount: 10, handler: "本地测试", paymentMethod: "现金", businessType: "办公费用", time: "2026-10-04 10:00:00"});
    const rawPatch = receipt ? paymentInMerge(state, payment as Parameters<typeof paymentInMerge>[1]) : paymentOutMerge(state, payment as Parameters<typeof paymentOutMerge>[1]);
    const replay = {data: payment, stateMerge: rawPatch, stateDelete: {financeLedger: ["PRIVATE-LEDGER"]}, state: {systemUsers: state.systemUsers}};
    const before = structuredClone(replay);
    const handlers = new Map<string, RequestHandler>();
    const app = Object.fromEntries(["post", "put", "delete"].map((method) => [method, (path: string, ...entries: RequestHandler[]) => handlers.set(`${method}:${path}`, entries.at(-1)!)])) as unknown as Express;
    registerFinancePaymentRoutes(app, {
      requireMenu: () => (_req, _res, next) => next(), requireDeletePermission: (_req, _res, next) => next(), asyncRoute: (handler) => handler,
      getState: () => state, actions: () => {throw new Error("Replay must not invoke another write");},
      claimMutationIdempotency: async () => ({request: {tenantId: "local", route: "local", key: "local", requestHash: "local"}, replay: {statusCode: 201, response: replay}}),
      releaseMutationIdempotency: async () => undefined, transactionHookWithIdempotency: () => undefined, persistEntityImages: async () => undefined,
      paymentInMerge: () => ({}), paymentOutMerge: () => ({}), accountTransferMerge: () => ({}),
    });
    let output: Record<string, unknown> | undefined;
    const response = {status: () => response, json: (body: Record<string, unknown>) => {output = body; return response;}};
    const handler = handlers.get(`post:/api/gpu_erp/finance/payment-${receipt ? "in" : "out"}/create`)!;
    await handler({authUser: actor} as never, response as never, () => undefined);
    assert.equal(output?.state, undefined, "cached full-state envelopes must not be passed through");
    const merge = output?.stateMerge as Record<string, unknown[]>;
    assert.equal(merge.financeLedger, undefined); assert.equal(merge.settlementLedger, undefined); assert.equal(merge.logs, undefined);
    assert.equal((merge.settlementAccounts as typeof state.settlementAccounts)[0]!.balance, 0);
    assert.deepEqual(output?.stateDelete, {});
    assert.deepEqual(replay, before, "HTTP projection must not alter the internal idempotency receipt");
  }
});

test("all twelve finance routes project idempotency replays at the HTTP boundary", async () => {
  for (const [segment, collection, menu] of [["payment-in", "paymentInRecords", "payment_in"], ["payment-out", "paymentOutRecords", "payment_out"], ["account-transfer", "accountTransfers", "account_transfer"]] as const) {
    const state = createInitialState({includeDemoData: true});
    const actor = state.systemUsers.find((user) => user.role === "店员")!;
    actor.permissionOverrides = {allowedMenus: [menu], showCost: false, showProfit: false};
    const account = state.settlementAccounts.find((item) => item.enabled)!;
    const replay = {data: {id: "ACK-LOCAL", amount: 10}, stateMerge: {[collection]: [{id: "ACK-LOCAL", amount: 10}], settlementAccounts: [account], settlementLedger: [{id: "PRIVATE-SL", amount: 99}], financeLedger: [{id: "PRIVATE-FL", amount: 99}], logs: [{id: "PRIVATE-LOG"}], systemUsers: state.systemUsers}, stateDelete: {financeLedger: ["PRIVATE-DELETE"]}, state: {systemUsers: state.systemUsers}};
    const before = structuredClone(replay);
    const handlers = new Map<string, RequestHandler>();
    const app = Object.fromEntries(["post", "put", "delete"].map((method) => [method, (path: string, ...entries: RequestHandler[]) => handlers.set(`${method}:${path}`, entries.at(-1)!)])) as unknown as Express;
    registerFinancePaymentRoutes(app, {
      requireMenu: () => (_req, _res, next) => next(), requireDeletePermission: (_req, _res, next) => next(), asyncRoute: (handler) => handler,
      getState: () => state, actions: () => {throw new Error("Replay must not write");},
      claimMutationIdempotency: async () => ({request: {tenantId: "local", route: "local", key: "local", requestHash: "local"}, replay: {statusCode: 200, response: replay}}),
      releaseMutationIdempotency: async () => undefined, transactionHookWithIdempotency: () => undefined, persistEntityImages: async () => undefined,
      paymentInMerge: () => ({}), paymentOutMerge: () => ({}), accountTransferMerge: () => ({}),
    });
    for (const [method, suffix] of [["post", "create"], ["put", ":id"], ["delete", ":id"], ["post", ":id/reverse"]]) {
      let output: Record<string, unknown> | undefined;
      const response = {status: () => response, json: (body: Record<string, unknown>) => {output = body; return response;}};
      await handlers.get(`${method}:/api/gpu_erp/finance/${segment}/${suffix}`)!({authUser: actor} as never, response as never, () => undefined);
      assert.deepEqual(Object.keys(output!).sort(), ["data", "stateDelete", "stateMerge"]);
      const merge = output!.stateMerge as Record<string, unknown[]>;
      assert.equal(merge.systemUsers, undefined); assert.equal(merge.financeLedger, undefined); assert.equal(merge.settlementLedger, undefined); assert.equal(merge.logs, undefined);
      assert.equal((merge.settlementAccounts as typeof state.settlementAccounts)[0]!.balance, 0);
      assert.deepEqual(output!.stateDelete, {}); assert.deepEqual(replay, before);
    }
  }
});
