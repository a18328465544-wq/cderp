import assert from "node:assert/strict";
import test from "node:test";
import {createInitialState, createStoreActions} from "./store.ts";
import {publicCollectionForUser, publicStateForUser} from "./publicState.ts";
import {projectAftersalesWorkspaceForPermissions} from "./aftersalesPermissionProjection.ts";
import {projectAftersalesResponse} from "./aftersalesResponse.ts";

function fixture() {
  const state = createInitialState();
  const claim = {...state.aftersales[0]!, repairPaymentOutId: "FK-PRIVATE", refundPaymentOutId: "FK-REFUND-PRIVATE"};
  state.aftersales = [claim];
  createStoreActions(state).createPaymentOut({accountId: state.settlementAccounts.find((account) => account.enabled)!.id,
    amount: 120, handler: "本地测试", paymentMethod: "现金", businessType: "维修费", relatedDocType: "售后单", relatedDocNo: claim.id, time: "2026-10-04 10:00"});
  const user = {...state.systemUsers.find((item) => item.role === "店员")!, permissionOverrides: {allowedMenus: ["aftersales"], showCost: false, showProfit: false}};
  const cached = {data: claim, stateMerge: {aftersales: [claim], inventory: state.inventory, salesInvoices: state.salesInvoices,
    customers: state.customers, paymentOutRecords: state.paymentOutRecords, settlementAccounts: state.settlementAccounts,
    financeLedger: state.financeLedger, settlementLedger: state.settlementLedger, logs: state.logs,
    systemUsers: state.systemUsers}, stateDelete: {inventory: ["OTHER-ID"]}, state};
  return {state, claim, user, cached};
}

test("full and single-collection aftersales reads hide private payment identifiers without changing operational fees", () => {
  const {state, claim, user} = fixture();
  const before = structuredClone(state);
  for (const projected of [publicStateForUser(state, user).aftersales[0]!, (publicCollectionForUser(state, "aftersales", user) as typeof state.aftersales)[0]!]) {
    assert.equal(projected.repairPaymentOutId, undefined); assert.equal(projected.refundPaymentOutId, undefined);
    assert.equal(projected.repairCost, claim.repairCost); assert.equal(projected.refundAmount, claim.refundAmount);
  }
  assert.deepEqual(state, before);
});

for (const showCost of [false, true]) {
  test(`workspace retains related work candidates and masks profit with cost permission=${showCost}`, () => {
    const {state, user} = fixture();
    const data = {aftersales: state.aftersales, inventory: state.inventory, salesInvoices: state.salesInvoices};
    const before = structuredClone(data);
    const result = projectAftersalesWorkspaceForPermissions(data, {...user.permissionOverrides, showCost});
    assert.ok(result.inventory.length); assert.ok(result.salesInvoices.length);
    assert.equal(result.inventory[0]!.costPrice, showCost ? data.inventory[0]!.costPrice : 0);
    assert.equal(result.salesInvoices[0]!.totalCost, showCost ? data.salesInvoices[0]!.totalCost : 0);
    assert.equal(result.salesInvoices[0]!.totalProfit, 0);
    assert.ok(result.salesInvoices.every((invoice) => invoice.items.every((item) => item.profit === 0 && (showCost || item.costPrice === 0))));
    assert.equal(result.salesInvoices[0]!.totalAmount, data.salesInvoices[0]!.totalAmount);
    assert.deepEqual(data, before);
  });
}

test("restricted aftersales acknowledgments hide financial patches and never alter the persistence/cache envelope", () => {
  const {state, user, cached} = fixture();
  const before = structuredClone({state, cached});
  const result = projectAftersalesResponse(state, cached, user);
  assert.deepEqual(Object.keys(result.stateMerge).sort(), ["aftersales", "inventory", "salesInvoices"]);
  assert.equal(result.data!.repairPaymentOutId, undefined);
  assert.ok(result.stateMerge.inventory!.every((card) => (card as {costPrice: number}).costPrice === 0));
  assert.ok(result.stateMerge.salesInvoices!.every((invoice) => (invoice as {totalProfit: number}).totalProfit === 0));
  assert.deepEqual(result.stateDelete, {}); assert.equal("state" in result, false);
  assert.deepEqual({state, cached}, before);
});

test("saved aftersales results are reprojected with current permissions and owners keep full accounting facts", () => {
  const {state, user, cached, claim} = fixture();
  const owner = state.systemUsers.find((item) => item.role === "老板")!;
  const full = projectAftersalesResponse(state, cached, owner);
  assert.deepEqual(full.data, claim); assert.deepEqual(full.stateMerge.paymentOutRecords, state.paymentOutRecords);
  assert.deepEqual(full.stateMerge.settlementAccounts, state.settlementAccounts);
  user.permissionOverrides.showCost = true;
  assert.equal((projectAftersalesResponse(state, cached, user).stateMerge.salesInvoices![0] as {totalProfit: number}).totalProfit, 0);
  user.permissionOverrides.allowedMenus = ["inventory"];
  assert.throws(() => projectAftersalesResponse(state, cached, user), /无权/);
});

test("aftersales acknowledgments require an actor, reject malformed records and preserve the legacy not-found shape", () => {
  const {state, user, cached} = fixture();
  assert.throws(() => projectAftersalesResponse(state, cached), /已认证/);
  for (const response of [null, {}, {data: []}, {data: {}}, {data: {id: 1}}, {data: {id: ""}}]) assert.throws(() => projectAftersalesResponse(state, response, user), /格式/);
  assert.deepEqual(projectAftersalesResponse(state, {...cached, data: null}, user), {data: null, stateMerge: {}, stateDelete: {}});
});

test("aftersales financial deletions follow current permissions and cannot remove unrelated operational records", () => {
  const {state, user, cached} = fixture();
  const response = {...cached, stateDelete: {paymentOutRecords: ["FK-PRIVATE", "FK-PRIVATE", ""], settlementLedger: ["SL-PRIVATE"], financeLedger: ["FL-PRIVATE"], inventory: ["OTHER-KC"], salesInvoices: ["OTHER-XS"], systemUsers: ["OTHER-USER"]}};
  const before = structuredClone(response);
  assert.deepEqual(projectAftersalesResponse(state, response, user).stateDelete, {});
  const owner = state.systemUsers.find((item) => item.role === "老板")!;
  assert.deepEqual(projectAftersalesResponse(state, response, owner).stateDelete, {paymentOutRecords: ["FK-PRIVATE"], settlementLedger: ["SL-PRIVATE"], financeLedger: ["FL-PRIVATE"]});
  assert.deepEqual(response, before);
});
