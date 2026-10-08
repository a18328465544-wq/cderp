import assert from "node:assert/strict";
import test from "node:test";
import type {ReturnOrder} from "../src/types.ts";
import {createInitialState} from "./store.ts";
import {publicCollectionForUser, publicStateForUser} from "./publicState.ts";
import {projectReturnMutationResponse} from "./returnMutationResponse.ts";

function fixture() {
  const state = createInitialState();
  const sale = state.salesInvoices[0]!;
  const purchase = state.purchaseInvoices[0]!;
  const order: ReturnOrder = {
    id: "TH-PRIVATE", returnNo: "XSTH-PRIVATE", type: "销售退货", status: "已完成",
    date: "2026-10-03", relatedDocType: "销售单", relatedDocNo: sale.invoiceNo,
    amount: 900, handler: "本地回归", reason: "本地测试", settlementMode: "原路退款", inventoryAction: "退回待检测",
    sourceSalesItemSnapshot: {...sale.items[0], costPrice: 731, profit: 169},
    sourcePurchaseItemSnapshot: {...purchase.items[0], buyPrice: 731},
    refundAllocations: [{sourcePaymentRecordId: "SK-PRIVATE", accountId: "ACC-PRIVATE", accountName: "私有账户", amount: 900, paymentMethod: "转账"}],
    reversedPaymentSnapshot: {...state.paymentOutRecords[0], id: "FK-PRIVATE", amount: 731},
    items: [{sourceInventoryId: "KC-PRIVATE", amount: 900, sourceSalesItemSnapshot: {...sale.items[0], costPrice: 731, profit: 169}, sourcePurchaseItemSnapshot: {...purchase.items[0], buyPrice: 731}}],
  };
  state.returnOrders = [order];
  const user = {...state.systemUsers.find((item) => item.role === "店员")!, permissionOverrides: {
    allowedMenus: ["return_sales", "return_purchase"], showCost: false, showProfit: false,
  }};
  return {state, user, order};
}

for (const mode of ["collection", "full"] as const) {
  test(`return ${mode} projection masks private scalar and batch snapshots without modifying accounting facts`, () => {
    const {state, user, order} = fixture();
    const before = structuredClone(state);
    const projected = mode === "collection"
      ? (publicCollectionForUser(state, "returnOrders", user) as ReturnOrder[])[0]!
      : publicStateForUser(state, user).returnOrders[0]!;
    assert.equal(projected.amount, order.amount, "sales refund amount is operational, not the purchase cost");
    assert.equal(projected.sourceSalesItemSnapshot?.costPrice, 0);
    assert.equal(projected.sourceSalesItemSnapshot?.profit, 0);
    assert.equal(projected.sourcePurchaseItemSnapshot?.buyPrice, 0);
    assert.equal(projected.items?.[0]?.sourceSalesItemSnapshot?.costPrice, 0);
    assert.equal(projected.items?.[0]?.sourcePurchaseItemSnapshot?.buyPrice, 0);
    assert.equal(projected.refundAllocations, undefined);
    assert.equal(projected.reversedPaymentSnapshot, undefined);
    assert.deepEqual(state, before);
  });
}

test("a purchase return cannot reveal its cost through amount, cash and nested refund lines", () => {
  const {state, user, order} = fixture();
  Object.assign(order, {type: "进货退货", amount: 731, cashReleasedAmount: 731, creditAmount: 731, vendorCreditAmount: 731, releasedVendorCreditAmount: 731});
  const projected = (publicCollectionForUser(state, "returnOrders", user) as ReturnOrder[])[0]!;
  for (const key of ["amount", "cashReleasedAmount", "creditAmount", "vendorCreditAmount", "releasedVendorCreditAmount"] as const) assert.equal(projected[key], 0);
  assert.equal(projected.items?.[0]?.amount, 0);
});

test("cost permission without profit permission masks invoice and return snapshot profit", () => {
  const {state, user} = fixture();
  user.permissionOverrides.showCost = true;
  const projected = publicStateForUser(state, user);
  assert.equal(projected.salesInvoices[0]!.totalProfit, 0);
  assert.equal(projected.salesInvoices[0]!.items[0]!.profit, 0);
  assert.equal(projected.returnOrders[0]!.sourceSalesItemSnapshot!.profit, 0);
  assert.equal(projected.returnOrders[0]!.sourceSalesItemSnapshot!.costPrice, 731);
});

test("return acknowledgment projects all patch collections and deletion IDs without modifying cached facts", () => {
  const {state, user, order} = fixture();
  Object.assign(state.customers[0]!, {totalProfit: 169, receivableBalance: 900});
  Object.assign(state.vendors[0]!, {avgProfit: 169, accountPayable: 731, returnCreditBalance: 731});
  const response = {data: order, stateMerge: {
    returnOrders: [order], inventory: state.inventory, salesInvoices: state.salesInvoices, purchaseInvoices: state.purchaseInvoices,
    customers: state.customers, vendors: state.vendors, settlementAccounts: state.settlementAccounts, paymentInRecords: state.paymentInRecords,
    paymentOutRecords: state.paymentOutRecords, settlementLedger: state.settlementLedger, financeLedger: state.financeLedger, logs: state.logs,
    customPermissions: state.customPermissions,
  }, stateDelete: {returnOrders: [order.id, "TH-OTHER"], financeLedger: ["FL-PRIVATE"], paymentOutRecords: ["FK-PRIVATE"]}, state};
  const before = structuredClone({state, response});
  const projected = projectReturnMutationResponse(state, response, user);
  assert.deepEqual(Object.keys(projected.stateMerge).sort(), ["customers", "inventory", "purchaseInvoices", "returnOrders", "salesInvoices", "vendors"]);
  assert.deepEqual(projected.stateDelete, {returnOrders: [order.id]});
  assert.ok(projected.stateMerge.inventory?.every((item) => (item as {costPrice: number}).costPrice === 0));
  const customer = projected.stateMerge.customers![0] as {totalProfit: number; receivableBalance: number};
  assert.equal(customer.totalProfit, 0); assert.equal(customer.receivableBalance, 0);
  const vendor = projected.stateMerge.vendors![0] as {avgProfit: number; accountPayable: number; returnCreditBalance: number};
  assert.equal(vendor.avgProfit, 0); assert.equal(vendor.accountPayable, 0); assert.equal(vendor.returnCreditBalance, 0);
  assert.equal("state" in projected, false);
  assert.equal(projected.data.sourceSalesItemSnapshot!.costPrice, 0);
  assert.deepEqual({state, response}, before);
});

test("cached return acknowledgments are reprojected after a permission change", () => {
  const {state, user, order} = fixture();
  const owner = state.systemUsers.find((item) => item.role === "老板")!;
  const cached = {data: order, stateMerge: {returnOrders: [order]}, stateDelete: {}};
  const before = structuredClone(cached);
  assert.equal(projectReturnMutationResponse(state, cached, owner).data.sourceSalesItemSnapshot!.costPrice, 731);
  assert.equal(projectReturnMutationResponse(state, cached, owner).data.refundAllocations![0]!.amount, 900);
  const restricted = projectReturnMutationResponse(state, cached, user);
  assert.equal(restricted.data.sourceSalesItemSnapshot!.costPrice, 0);
  assert.equal(restricted.data.refundAllocations, undefined);
  user.permissionOverrides.allowedMenus = ["products"];
  assert.throws(() => projectReturnMutationResponse(state, cached, user), /无权/);
  assert.deepEqual(cached, before);
});

test("return acknowledgment rejects missing actors and malformed cached responses", () => {
  const {state, user, order} = fixture();
  assert.throws(() => projectReturnMutationResponse(state, {data: order}), /已认证/);
  for (const response of [null, {}, {data: null}, {data: {id: order.id}}, {data: {...order, items: {}}}]) {
    assert.throws(() => projectReturnMutationResponse(state, response, user), /格式/);
  }
});

test("funds permission does not grant cost or profit access, while owners retain complete accounting snapshots", () => {
  const {state, user, order} = fixture();
  user.permissionOverrides.allowedMenus = ["return_orders", "payment_in", "payment_out", "settlement_accounts"];
  const projected = (publicCollectionForUser(state, "returnOrders", user) as ReturnOrder[])[0]!;
  assert.equal(projected.refundAllocations![0]!.amount, 900);
  assert.equal(projected.sourceSalesItemSnapshot!.costPrice, 0);
  assert.equal(projected.sourceSalesItemSnapshot!.profit, 0);
  const owner = state.systemUsers.find((item) => item.role === "老板")!;
  assert.deepEqual((publicCollectionForUser(state, "returnOrders", owner) as ReturnOrder[])[0], order);
});
