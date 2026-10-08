import assert from "node:assert/strict";
import test from "node:test";
import type {PurchaseItem} from "../src/types.ts";
import {ValidationError} from "./errors.ts";
import {createInitialState, createStoreActions} from "./store.ts";
import {expandPurchaseItems} from "./storeInventoryPlanning.ts";

function purchaseFixture() {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0]!;
  const customer = state.customers[0]!;
  const account = state.settlementAccounts.find((item) => item.enabled)!;
  const item: PurchaseItem = {
    tempId: "quantity-line", productId: product.id, productName: product.name, category: product.category,
    brand: product.brand, model: product.model, version: product.version, vram: product.vram,
    sn: "", condition: "95新", inWarranty: false, repaired: false, gpuRisk: false, fullBox: false,
    quantity: 1, buyPrice: 100, estSellPrice: 130, warehouseLocation: "待检测区",
  };
  const command: Parameters<typeof actions.createPurchaseInvoice>[0] = {
    date: "2026-10-04", sourceType: "个人回收", sourcePartnerId: customer.id, sourcePartnerType: "customer",
    supplierName: customer.name, contact: "", paymentMethod: "微信", isPaid: true, paidAmount: 100,
    unpaidAmount: 0, settlementAccountId: account.id, handleBy: "数量测试员", items: [item],
  };
  return {state, actions, command, item};
}

test("invalid purchase quantities cannot create or edit inventory, balances, payments or audit records", () => {
  const {state, actions, command, item} = purchaseFixture();
  for (const quantity of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 501, 1_000_000_000]) {
    const before = structuredClone(state);
    assert.throws(() => actions.createPurchaseInvoice({...command, items: [{...item, quantity}]}), ValidationError);
    assert.deepEqual(state, before, "invalid creation must not touch any business collection");
  }
  const invoice = actions.createPurchaseInvoice(command);
  for (const quantity of [0, -1, 1.5, 501, 1_000_000_000]) {
    const before = structuredClone(state);
    assert.throws(() => actions.updatePurchaseInvoice(invoice.id, {items: [{...item, quantity}]}, {expectedRecordVersion: invoice.recordVersion}), ValidationError);
    assert.deepEqual(state, before, "invalid editing must preserve inventory, financial events, payments and record version");
  }
  const before = structuredClone(state);
  assert.throws(() => actions.updatePurchaseInvoice(invoice.id, {items: [{...item, quantity: 500}, item]}, {expectedRecordVersion: invoice.recordVersion}), /不能超过 500 件/);
  assert.deepEqual(state, before);
});

test("purchase physical-unit limit is checked before expanding even the first valid row", () => {
  const {item} = purchaseFixture();
  const first = {...item, quantity: 500};
  Object.defineProperty(first, "buyPrice", {get() {throw new Error("physical row was expanded before validating the whole batch");}});
  assert.throws(() => expandPurchaseItems([first, item]), /不能超过 500 件/);
});
