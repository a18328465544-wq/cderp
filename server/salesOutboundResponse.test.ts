import assert from "node:assert/strict";
import test from "node:test";
import type {SalesInvoice} from "../src/types.ts";
import {createInitialState} from "./store.ts";
import {projectSalesOutboundResponse} from "./salesOutboundResponse.ts";

function fixture() {
  const state = createInitialState();
  const invoice = state.salesInvoices[0]!;
  const user = {...state.systemUsers.find((item) => item.role === "店员")!, permissionOverrides: {
    allowedMenus: ["sales_outbound"], showCost: false, showProfit: false, canManualOutbound: false,
  }};
  const response = {data: invoice, stateMerge: {
    salesInvoices: [invoice], inventory: state.inventory, customers: state.customers,
    settlementAccounts: state.settlementAccounts, paymentInRecords: state.paymentInRecords,
    financeLedger: state.financeLedger, settlementLedger: state.settlementLedger,
    purchaseCommissions: state.purchaseCommissions, logs: state.logs,
  }, stateDelete: {}, state: state};
  return {state, invoice, user, response};
}

test("warehouse outbound acknowledgment and all patch collections use server-side permission projection", () => {
  const {state, invoice, user, response} = fixture();
  const before = structuredClone({state, response});
  const projected = projectSalesOutboundResponse(state, response, user);
  assert.equal(projected.data.id, invoice.id);
  assert.equal(projected.data.totalCost, 0);
  assert.equal(projected.data.totalProfit, 0);
  assert.ok(projected.data.items.every((item) => item.costPrice === 0 && item.profit === 0));
  assert.ok(projected.stateMerge.inventory?.every((item) => (item as {costPrice: number}).costPrice === 0));
  assert.deepEqual(Object.keys(projected.stateMerge).sort(), ["inventory", "salesInvoices"]);
  const patchedInvoice = projected.stateMerge.salesInvoices?.[0] as SalesInvoice;
  assert.equal(patchedInvoice.totalCost, 0);
  assert.equal(patchedInvoice.totalProfit, 0);
  assert.equal("state" in projected, false);
  assert.deepEqual({state, response}, before, "projection must not change persisted amounts or cached command results");
});

test("replayed outbound responses are projected using current permissions, not the cached actor", () => {
  const {state, invoice, user, response} = fixture();
  const owner = state.systemUsers.find((item) => item.role === "老板")!;
  const cached = structuredClone(response);
  const authorized = projectSalesOutboundResponse(state, cached, owner);
  assert.equal(authorized.data.totalCost, invoice.totalCost);
  assert.equal(authorized.data.totalProfit, invoice.totalProfit);
  const restricted = projectSalesOutboundResponse(state, cached, user);
  assert.equal(restricted.data.totalCost, 0);
  assert.equal(restricted.data.totalProfit, 0);
  assert.equal(cached.data.totalCost, invoice.totalCost);
  assert.equal(cached.data.totalProfit, invoice.totalProfit);
});

test("cost permission alone does not expose profit through outbound data or patches", () => {
  const {state, invoice, user, response} = fixture();
  user.permissionOverrides.showCost = true;
  const projected = projectSalesOutboundResponse(state, response, user);
  assert.equal(projected.data.totalCost, invoice.totalCost);
  assert.equal(projected.data.totalProfit, 0);
  assert.ok(projected.data.items.every((item, index) => item.costPrice === invoice.items[index]!.costPrice && item.profit === 0));
  assert.equal((projected.stateMerge.salesInvoices?.[0] as SalesInvoice).totalProfit, 0);
});

test("outbound responses fail closed without an authenticated and authorized actor", () => {
  const {state, user, response} = fixture();
  assert.throws(() => projectSalesOutboundResponse(state, response), /已认证/);
  // An empty menu override means role defaults in the existing permission
  // contract. Use an explicit unrelated menu to test denied sales visibility.
  user.permissionOverrides.allowedMenus = ["products"];
  assert.throws(() => projectSalesOutboundResponse(state, response, user), /无权/);
  for (const payload of [null, {}, {data: null}, {data: {id: "XS-1", items: null}}]) {
    assert.throws(() => projectSalesOutboundResponse(state, payload, user), /格式/);
  }
});
