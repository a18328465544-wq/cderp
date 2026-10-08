import assert from "node:assert/strict";
import test from "node:test";
import {createInitialState, createStoreActions} from "./store.ts";

function fixture(paid = false) {
  const state = createInitialState();
  const seed = state.inventory.find((card) => card.status === "已入库")!;
  const cards = [0, 1].map((index) => ({...seed, id: `LOCAL-SALES-VERSION-${index}`, sn: `LOCAL-SALES-VERSION-SN-${index}`}));
  state.inventory = cards; state.salesInvoices = []; state.returnOrders = [];
  const actions = createStoreActions(state);
  const customer = actions.createCustomer({name: "本地销售版本客户", contact: "LOCAL-VERSION"});
  const account = state.settlementAccounts.find((item) => item.enabled)!;
  const invoice = actions.createSalesInvoice({date: "2026-10-04", customerId: customer.id, customerName: customer.name, contact: customer.contact,
    channel: "到店", paymentMethod: paid ? "现金" : "账期欠款", settlementAccountId: paid ? account.id : undefined,
    isPaid: paid, paidAmount: paid ? 2000 : 0, unpaidAmount: paid ? 0 : 2000,
    needInvoice: false, freeShipping: true, aftersalesTerms: "店保", handleBy: "本地销售", paymentHandler: "本地销售",
    items: cards.map((card) => ({inventoryId: card.id, productId: card.productId, productName: card.productName,
      sn: card.sn, condition: card.condition, costPrice: card.costPrice, sellPrice: 1000, profit: 1000 - card.costPrice, aftersalesTerms: "店保"}))});
  return {state, actions, cards, invoice, customer, account};
}

test("two sales editors cannot silently overwrite one another", () => {
  const {state, actions, invoice} = fixture();
  actions.updateSalesInvoice(invoice.id, {remarks: "先保存的修改"}, {expectedRecordVersion: 1});
  const before = structuredClone(state);
  assert.throws(() => actions.updateSalesInvoice(invoice.id, {remarks: "过期页面覆盖"}, {expectedRecordVersion: 1}), /修改|刷新/);
  assert.deepEqual(state, before);
  assert.equal(state.salesInvoices[0].recordVersion, 2);
});

test("sales edits advance the revision and preserve stable invoice identity", () => {
  const {actions, invoice} = fixture();
  assert.equal(invoice.recordVersion, 1);
  const updated = actions.updateSalesInvoice(invoice.invoiceNo, {expressNo: "LOCAL-EXPRESS"}, {expectedRecordVersion: 1});
  assert.equal(updated.id, invoice.id); assert.equal(updated.invoiceNo, invoice.invoiceNo); assert.equal(updated.recordVersion, 2);
  assert.equal(actions.updateSalesInvoice(invoice.id, {remarks: "新版本修改"}, {expectedRecordVersion: 2}).recordVersion, 3);
});

test("legacy sales without a saved revision start from version one", () => {
  const {state, actions, invoice} = fixture();
  delete invoice.recordVersion;
  const before = structuredClone(state);
  assert.throws(() => actions.updateSalesInvoice(invoice.id, {remarks: "错误版本"}, {expectedRecordVersion: 9}), /修改|刷新/);
  assert.deepEqual(state, before);
  assert.equal(actions.updateSalesInvoice(invoice.id, {remarks: "正常历史编辑"}, {expectedRecordVersion: 1}).recordVersion, 2);
});

test("outbound invalidates an already open sales editor without repeated revision bumps on retry", () => {
  const {state, actions, cards, invoice} = fixture();
  const command = {handler: "本地仓库", codes: cards.map((card) => card.id)};
  const updated = actions.confirmSalesOutbound(invoice.id, command);
  const before = structuredClone(state);
  assert.throws(() => actions.updateSalesInvoice(invoice.id, {remarks: "出库前打开的页面"}, {expectedRecordVersion: 1}), /修改|刷新/);
  assert.deepEqual(state, before);
  assert.equal(updated.recordVersion, 2);
  assert.deepEqual(actions.confirmSalesOutbound(invoice.id, command), updated);
  assert.deepEqual(state, before);
});

test("receipts and their reversal invalidate stale sales editors before money can be overwritten", () => {
  const {state, actions, invoice, customer, account} = fixture();
  const payment = actions.createPaymentIn({customerId: customer.id, customerName: customer.name, accountId: account.id,
    amount: 300, handler: "本地收款", paymentMethod: "现金", businessType: "销售收款", relatedDocType: "销售单",
    relatedDocNo: invoice.invoiceNo, time: "2026-10-04 10:00:00"});
  const afterReceipt = structuredClone(state);
  assert.throws(() => actions.updateSalesInvoice(invoice.id, {paidAmount: 0, unpaidAmount: 2000}, {expectedRecordVersion: 1}), /修改|刷新/);
  assert.deepEqual(state, afterReceipt);
  assert.equal(state.salesInvoices[0].recordVersion, 2);
  actions.reversePaymentIn(payment.id);
  const afterReversal = structuredClone(state);
  assert.equal(state.salesInvoices[0].recordVersion, 3);
  assert.throws(() => actions.updateSalesInvoice(invoice.id, {remarks: "收款冲销前的页面"}, {expectedRecordVersion: 2}), /修改|刷新/);
  assert.deepEqual(state, afterReversal);
});

for (const batch of [false, true]) {
  test(`real ${batch ? "batch" : "single"} return and reversal keep sales revisions monotonic`, () => {
    const {state, actions, cards, invoice} = fixture(true);
    actions.confirmSalesOutbound(invoice.id, {handler: "本地仓库", codes: cards.map((card) => card.id)});
    const returned = actions.createReturnOrder({type: "销售退货", date: "2026-10-04", relatedDocType: "销售单", relatedDocNo: invoice.invoiceNo,
      sourceInventoryId: cards[0].id, amount: batch ? 2000 : 1000, settlementMode: "原路退款", handler: "本地退货", reason: "版本回归",
      inventoryAction: "退回待检测", ...(batch ? {items: cards.map((card) => ({sourceInventoryId: card.id, amount: 1000}))} : {})});
    actions.completeReturnOrder(returned.id);
    const afterReturn = structuredClone(state);
    assert.equal(state.salesInvoices[0].recordVersion, 3);
    assert.throws(() => actions.updateSalesInvoice(invoice.id, {remarks: "退货前打开的页面"}, {expectedRecordVersion: 2}), /修改|刷新/);
    assert.deepEqual(state, afterReturn);
    actions.reverseReturnOrder(returned.id);
    const afterReversal = structuredClone(state);
    assert.equal(state.salesInvoices[0].recordVersion, 4);
    assert.throws(() => actions.updateSalesInvoice(invoice.id, {remarks: "退货恢复后也不能复用旧版本"}, {expectedRecordVersion: 2}), /修改|刷新/);
    assert.deepEqual(state, afterReversal);
  });
}

test("customer archive edits invalidate stale sales edits as well", () => {
  const {state, actions, invoice, customer} = fixture();
  actions.updateCrmCustomer(customer.id, {name: "本地客户新名称", contact: "LOCAL-NEW-CONTACT"});
  const before = structuredClone(state);
  assert.throws(() => actions.updateSalesInvoice(invoice.id, {remarks: "客户变更前页面"}, {expectedRecordVersion: 1}), /修改|刷新/);
  assert.deepEqual(state, before);
  assert.equal(state.salesInvoices[0].recordVersion, 2);
});
