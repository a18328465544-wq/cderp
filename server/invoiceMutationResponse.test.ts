import assert from "node:assert/strict";
import test from "node:test";
import type {Express, RequestHandler} from "express";
import type {PurchaseInvoice, SalesInvoice} from "../src/types.ts";
import {createInitialState} from "./store.ts";
import {projectInvoiceMutationResponse} from "./invoiceMutationResponse.ts";
import {registerPurchaseMutationRoutes} from "./routes/purchaseMutations.ts";
import {registerSalesMutationRoutes} from "./routes/salesMutations.ts";

for (const collection of ["purchaseInvoices", "salesInvoices"] as const) {
  const sales = collection === "salesInvoices";
  const menu = sales ? "sales_list" : "purchase_list";
  const fixture = () => {
    const state = createInitialState();
    const invoice = state[collection][0]!;
    const actor = {...state.systemUsers.find((user) => user.role === "店员")!, permissionOverrides: {allowedMenus: [menu], showCost: false, showProfit: false, canEditHistory: true, canDelete: true}};
    const response = {data: invoice, stateMerge: {...state}, stateDelete: {[collection]: [invoice.id, "UNRELATED-INVOICE"], [sales ? "purchaseInvoices" : "salesInvoices"]: ["OTHER-DOMAIN-INVOICE"], settlementLedger: ["SECRET-LEDGER"], financeLedger: ["SECRET-FINANCE"], systemUsers: ["SECRET-USER"]}, state};
    return {state, invoice, actor, response};
  };
  test(`${collection} acknowledgments project data, financial deltas and cached envelopes without changing facts`, () => {
    const {state, invoice, actor, response} = fixture();
    const before = structuredClone({state, response});
    const result = projectInvoiceMutationResponse(state, response, actor, collection);
    const data = result.data as unknown as PurchaseInvoice | SalesInvoice;
    assert.equal(data.id, invoice.id); assert.equal(data.totalCost, 0);
    if ("totalProfit" in data) {assert.equal(data.totalProfit, 0); assert.ok(data.items.every((item) => item.costPrice === 0 && item.profit === 0));}
    else {assert.equal(data.estTotalProfit, 0); assert.ok(data.items.every((item) => item.buyPrice === 0));}
    assert.deepEqual(Object.keys(result.stateMerge), sales ? [collection, "inventory"] : [collection]);
    if (sales) assert.ok(result.stateMerge.inventory!.every((card) => (card as {costPrice: number}).costPrice === 0));
    assert.deepEqual(result.stateDelete, {[collection]: [invoice.id]});
    assert.equal("state" in result, false); assert.deepEqual({state, response}, before);
    const full = projectInvoiceMutationResponse(state, response, state.systemUsers.find((user) => user.role === "老板")!, collection);
    assert.equal((full.data as unknown as PurchaseInvoice | SalesInvoice).totalCost, invoice.totalCost);
    assert.equal(full.stateMerge.systemUsers, undefined);
    assert.equal(full.stateDelete.systemUsers, undefined);
    assert.equal(full.stateDelete[sales ? "purchaseInvoices" : "salesInvoices"], undefined);
  });
  test(`${collection} response rejects unauthenticated, unauthorized and malformed records`, () => {
    const {state, actor, response} = fixture();
    assert.throws(() => projectInvoiceMutationResponse(state, response, undefined, collection), /已认证/);
    actor.permissionOverrides.allowedMenus = ["products"];
    assert.throws(() => projectInvoiceMutationResponse(state, response, actor, collection), /无权/);
    for (const invalid of [null, {}, {data: {}}, {data: {id: "", items: []}}, {data: {id: "BAD", items: null}}]) assert.throws(() => projectInvoiceMutationResponse(state, invalid, actor, collection), /格式/);
  });
  for (const method of ["post", "put", "delete"] as const) {
    test(`${collection} ${method} replay reprojects the current actor without running or saving the command`, async () => {
      const {state, invoice, actor, response: cache} = fixture();
      const cachedBefore = structuredClone(cache);
      let handler: RequestHandler | undefined;
      const app = {
        post(path: string, ...handlers: RequestHandler[]) {if (method === "post" && !path.includes("outbound")) handler = handlers.at(-1); return this;},
        put(_path: string, ...handlers: RequestHandler[]) {if (method === "put") handler = handlers.at(-1); return this;},
        delete(_path: string, ...handlers: RequestHandler[]) {if (method === "delete") handler = handlers.at(-1); return this;},
      } as unknown as Express;
      const noop: RequestHandler = (_req, _res, next) => next();
      const dependencies = {
        requireMenu: () => noop, requireDeletePermission: noop, requireHistoryEditPermission: noop, requireManualOutboundPermission: noop,
        asyncRoute: (value: RequestHandler) => value, getState: () => state,
        actions: () => {throw new Error("Replay must not run a domain action");}, actorForRequest: () => "LOCAL",
        claimMutationIdempotency: async () => ({request: {tenantId: "local-test", route: "local-test", key: "local-test", requestHash: "local-test"}, replay: {statusCode: method === "post" ? 201 : 200, response: cache}}),
        releaseMutationIdempotency: async () => {throw new Error("Replay must not release a key");},
        transactionHookWithIdempotency: () => {throw new Error("Replay must not save records");},
        permissionsForRequest: () => actor.permissionOverrides, withoutImagePayload: (body: unknown) => body,
        persistEntityImages: async () => undefined, releaseInventoryReservations: async () => undefined, reserveSalesOutboundInventory: async () => undefined,
        notifySalesInvoiceCreated: async () => undefined, ok: (data: unknown) => ({data}),
      };
      if (sales) registerSalesMutationRoutes(app, dependencies); else registerPurchaseMutationRoutes(app, dependencies);
      let received: ReturnType<typeof projectInvoiceMutationResponse> | undefined;
      const res = {status() {return this;}, json(value: typeof received) {received = value; return this;}};
      const body = sales ? {date: invoice.date, customerName: "LOCAL", contact: "LOCAL", channel: "到店", paymentMethod: "现金", isPaid: false, paidAmount: 0, unpaidAmount: 100, needInvoice: false, freeShipping: true, aftersalesTerms: "店保", handleBy: "LOCAL",
        items: [{inventoryId: "LOCAL-KC", productId: "LOCAL-P", productName: "LOCAL", sn: "LOCAL-SN", condition: "95新", costPrice: 50, sellPrice: 100, profit: 50, aftersalesTerms: "店保"}]} : {};
      await handler!({params: {id: invoice.id}, authUser: actor, body} as never, res as never, () => undefined);
      assert.equal((received!.data as unknown as PurchaseInvoice | SalesInvoice).totalCost, 0);
      assert.equal(received!.stateMerge.settlementLedger, undefined);
      assert.equal(received!.stateMerge.financeLedger, undefined);
      assert.equal(received!.stateMerge.settlementAccounts, undefined);
      assert.equal("state" in received!, false);
      assert.deepEqual(cache, cachedBefore);
    });
  }
}
