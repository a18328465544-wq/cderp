import assert from "node:assert/strict";
import test from "node:test";
import type {CardInventory, SalesInvoice} from "../src/types.ts";
import {inventorySellableStatusValues, inventoryStatuses} from "../src/types/inventory.ts";
import {ConflictError, NotFoundError} from "./errors.ts";
import {getAuthenticationReloadKeys} from "./requestStatePolicy.ts";
import {createInitialState, createStoreActions} from "./store.ts";

function boundInvoiceFixture() {
  const state = createInitialState();
  const seed = state.inventory.find((card) => card.status === "已入库");
  assert.ok(seed);
  const product = state.products.find((item) => item.id === seed.productId);
  assert.ok(product);
  const card: CardInventory = {...seed, id: "KC-LEGACY-BOUND", sn: "SN-LEGACY-BOUND", salesInvoiceId: undefined};
  const invoice: SalesInvoice = {
    id: "XS-LEGACY-BOUND", invoiceNo: "XS-20261003-LEGACY", date: "2026-10-03",
    customerName: "旧单出库测试客户", contact: "", channel: "到店", paymentMethod: "账期欠款",
    isPaid: false, paidAmount: 0, unpaidAmount: 11200, outboundStatus: "待出库",
    needInvoice: false, freeShipping: true, aftersalesTerms: "", handleBy: "测试开单人",
    totalCount: 1, totalAmount: 11200, totalCost: card.costPrice, totalProfit: 11200 - card.costPrice,
    items: [{
      inventoryId: card.id, productId: card.productId, productName: card.productName, sn: card.sn,
      condition: card.condition, costPrice: card.costPrice, sellPrice: 11200,
      profit: 11200 - card.costPrice, aftersalesTerms: "",
    }],
  };
  state.products = [{...product, currentStock: 1}];
  state.inventory = [card];
  state.salesInvoices = [invoice];
  const actions = createStoreActions(state);
  return {state, card, invoice, actions};
}

test("cold outbound preview loads the displayed invoice instead of relying on a warmed process snapshot", () => {
  const {state: persisted, card, invoice} = boundInvoiceFixture();
  const secondCard = {...card, id: "KC-COLD-SECOND", sn: "郭老师拿回家"};
  persisted.inventory.push(secondCard);
  invoice.items.push({...invoice.items[0]!, inventoryId: secondCard.id, sn: secondCard.sn});
  invoice.totalCount = 2;
  invoice.totalAmount = invoice.items.reduce((sum, item) => sum + item.sellPrice, 0);
  const command = {handler: "测试仓库员", codes: [card.sn, secondCard.sn], manual: false, remarks: ""};
  const path = `/api/sales-invoices/${invoice.id}/outbound/preflight`;

  // Reproduce the old POST authentication snapshot. A SQL-backed list can
  // display the persisted invoice while this request still has no sales rows.
  const accountsOnly = createInitialState({includeDemoData: false});
  accountsOnly.systemUsers = structuredClone(persisted.systemUsers);
  assert.throws(() => createStoreActions(accountsOnly).previewSalesOutbound(invoice.id, command), NotFoundError);

  for (const suffix of ["", "/"]) {
    const keys = getAuthenticationReloadKeys("POST", `${path}${suffix}`);
    assert.ok(keys);
    const requestState = createInitialState({includeDemoData: false});
    Object.assign(requestState, Object.fromEntries(keys.map((key) => [key, structuredClone(persisted[key])])));
    const actions = createStoreActions(requestState);
    const before = structuredClone(requestState);
    const preview = actions.previewSalesOutbound(invoice.id, command);
    assert.equal(preview.invoiceId, invoice.id);
    assert.equal(preview.invoiceNo, invoice.invoiceNo);
    assert.equal(preview.ready, true);
    assert.equal(preview.expectedCount, 2);
    assert.equal(preview.matchedCount, 2);
    assert.deepEqual(preview.rows.map((row) => row.inventoryId), [card.id, secondCard.id]);
    assert.deepEqual(requestState, before, "loading and previewing must not dispatch stock or write financial facts");
  }
});

const nonSellableStatuses = inventoryStatuses.filter((status) =>
  !inventorySellableStatusValues.some((sellable) => sellable === status));

for (const status of nonSellableStatuses) {
  test(`legacy bound outbound refuses ${status} in scanner and manual modes without side effects`, () => {
    for (const manual of [false, true]) {
      const {state, card, invoice, actions} = boundInvoiceFixture();
      card.status = status;
      if (status === "已售出") card.salesInvoiceId = "XS-ANOTHER-SALE";
      const before = structuredClone(state);
      const command = {handler: "测试仓库员", codes: manual ? [] : [card.sn], manual, remarks: manual ? "扫码设备故障，人工复核" : ""};
      const preview = actions.previewSalesOutbound(invoice.id, command);
      assert.equal(preview.ready, false);
      assert.equal(preview.matchedCount, 0);
      assert.equal(preview.rows[0]?.matched, false);
      assert.match(preview.rows[0]!.reason, new RegExp(status));
      assert.deepEqual(state, before, "preview must not change any inventory, invoice, payment or commission data");
      assert.throws(() => actions.confirmSalesOutbound(invoice.id, command), ConflictError);
      assert.deepEqual(state, before, "a refused confirmation must leave all business collections unchanged");
    }
  });
}

test("legacy bound outbound refuses a card whose product identity changed", () => {
  for (const manual of [false, true]) {
    const {state, card, invoice, actions} = boundInvoiceFixture();
    const originalProduct = state.products[0]!;
    state.products.push({...originalProduct, id: "P-DIFFERENT", name: "另一型号显卡", model: "RTX-OTHER"});
    card.productId = "P-DIFFERENT";
    card.productName = "另一型号显卡";
    const before = structuredClone(state);
    const command = {handler: "测试仓库员", codes: manual ? [] : [card.sn], manual, remarks: manual ? "人工复核" : ""};
    const preview = actions.previewSalesOutbound(invoice.id, command);
    assert.equal(preview.ready, false);
    assert.match(preview.rows[0]!.reason, /型号/);
    assert.throws(() => actions.confirmSalesOutbound(invoice.id, command), ConflictError);
    assert.deepEqual(state, before);
  }
});

test("legacy binding still supports current sellable inventory and repeat confirmation is harmless", () => {
  for (const status of inventorySellableStatusValues) {
    for (const manual of [false, true]) {
      const {state, card, invoice, actions} = boundInvoiceFixture();
      card.status = status;
      const command = {handler: "测试仓库员", codes: manual ? [] : [card.sn.toLowerCase()], manual, remarks: manual ? "人工复核" : ""};
      assert.equal(actions.previewSalesOutbound(invoice.invoiceNo, command).ready, true);
      const confirmed = actions.confirmSalesOutbound(invoice.id, command);
      assert.equal(confirmed.outboundStatus, "已出库");
      assert.equal(confirmed.items[0]!.inventoryId, card.id);
      assert.equal(state.inventory[0]!.status, "已售出");
      assert.equal(state.inventory[0]!.salesInvoiceId, invoice.invoiceNo);
      const after = structuredClone(state);
      assert.deepEqual(actions.confirmSalesOutbound(invoice.id, command), confirmed);
      assert.deepEqual(state, after, "a retry must not reapply stock, audit or commissions");
    }
  }
});

test("legacy product IDs retain the existing unique-name identity compatibility", () => {
  const {card, invoice, actions} = boundInvoiceFixture();
  invoice.items[0]!.productId = "P-OLD-REPLACED-ID";
  assert.equal(actions.previewSalesOutbound(invoice.id, {handler: "测试仓库员", codes: [card.id]}).ready, true);
});

test("legacy verification uses only the current card ID and SN", () => {
  const {state, card, invoice, actions} = boundInvoiceFixture();
  invoice.items[0]!.sn = "OLD-SN";
  const before = structuredClone(state);
  const command = {handler: "测试仓库员", codes: ["OLD-SN"]};
  const rejected = actions.previewSalesOutbound(invoice.id, command);
  assert.equal(rejected.ready, false);
  assert.equal(rejected.matchedCount, 0);
  assert.throws(() => actions.confirmSalesOutbound(invoice.id, command), ConflictError);
  assert.deepEqual(state, before);
  assert.equal(actions.previewSalesOutbound(invoice.id, {...command, codes: [card.sn]}).ready, true);
  assert.equal(actions.previewSalesOutbound(invoice.id, {...command, codes: [card.id]}).ready, true);
});

test("historical Chinese stock identifiers remain valid without rewriting the card or invoice", () => {
  const {state, card, invoice, actions} = boundInvoiceFixture();
  card.sn = "历史中文库存标识";
  invoice.items[0]!.sn = card.sn;
  const before = structuredClone(state);
  const command = {handler: "测试仓库员", codes: [card.sn]};
  const preview = actions.previewSalesOutbound(invoice.id, command);
  assert.equal(preview.ready, true);
  assert.equal(preview.rows[0]?.serialNumber, card.sn);
  assert.deepEqual(state, before, "preview must not rewrite a historical identifier");
  const confirmed = actions.confirmSalesOutbound(invoice.id, command);
  assert.equal(confirmed.outboundStatus, "已出库");
  assert.equal(confirmed.items[0]?.sn, "历史中文库存标识");
  assert.equal(state.inventory[0]?.sn, "历史中文库存标识");
});

test("a partially valid legacy invoice cannot mutate its sellable rows", () => {
  const {state, card, invoice, actions} = boundInvoiceFixture();
  const invalidCard = {...card, id: "KC-LEGACY-RETURNED", sn: "SN-LEGACY-RETURNED", status: "已退货" as const};
  state.inventory.push(invalidCard);
  invoice.items.push({...invoice.items[0]!, inventoryId: invalidCard.id, sn: invalidCard.sn});
  const before = structuredClone(state);
  const command = {handler: "测试仓库员", codes: [card.sn, invalidCard.sn]};
  const preview = actions.previewSalesOutbound(invoice.id, command);
  assert.equal(preview.ready, false);
  assert.equal(preview.matchedCount, 1);
  assert.throws(() => actions.confirmSalesOutbound(invoice.id, command), ConflictError);
  assert.deepEqual(state, before, "the valid first line must not be sold if any later line fails");
});

test("one legacy-bound card cannot satisfy two invoice lines", () => {
  for (const manual of [false, true]) {
    const {state, card, invoice, actions} = boundInvoiceFixture();
    invoice.items.push({...invoice.items[0]!});
    const before = structuredClone(state);
    const command = {handler: "测试仓库员", codes: manual ? [] : [card.sn], manual, remarks: manual ? "人工复核" : ""};
    const preview = actions.previewSalesOutbound(invoice.id, command);
    assert.equal(preview.ready, false);
    assert.equal(preview.matchedCount, 1);
    assert.match(preview.rows[1]!.reason, /重复绑定/);
    assert.throws(() => actions.confirmSalesOutbound(invoice.id, command), ConflictError);
    assert.deepEqual(state, before);
  }
});
