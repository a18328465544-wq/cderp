import assert from "node:assert/strict";
import test from "node:test";
import {createInitialState, createStoreActions} from "./store.ts";
import {createReturnFinancialHelpers} from "./storeReturnFinancials.ts";
import {assertPaymentRemovalDependencies} from "./storePaymentOperations.ts";

function fixture(type: "进货退货" | "销售退货") {
  const state = createInitialState();
  Object.assign(state, {purchaseInvoices: [], inventory: [], salesInvoices: [], aftersales: [], returnOrders: [], paymentInRecords: [], paymentOutRecords: [], settlementLedger: [], financeLedger: []});
  const actions = createStoreActions(state); const account = state.settlementAccounts.find((item) => item.enabled)!;
  const product = state.products[0]!; const vendor = actions.createVendor({name: "本地资金依赖供应商", contact: "LOCAL"});
  const purchase = actions.createPurchaseInvoice({date: "2026-10-04", sourceType: "同行拿货", sourcePartnerId: vendor.id, sourcePartnerType: "vendor", supplierName: vendor.name, contact: "LOCAL", paymentMethod: "现金", isPaid: true, paidAmount: 1000, unpaidAmount: 0, settlementAccountId: account.id, handleBy: "本地采购",
    items: [0, 1].map((index) => ({tempId: `LOCAL-${index}`, productId: product.id, productName: product.name, category: product.category, brand: product.brand, model: product.model, version: product.version, vram: product.vram, sn: `LOCAL-PAYMENT-SN-${index}`,
      condition: "95新", inWarranty: false, repaired: false, gpuRisk: false, fullBox: true, buyPrice: 500, estSellPrice: 700, warehouseLocation: "A区"}))});
  const cards = [...state.inventory];
  let docNo = purchase.invoiceNo;
  if (type === "销售退货") {
    state.inventory = state.inventory.map((card) => ({...card, status: "已入库"}));
    const customer = actions.createCustomer({name: "本地资金依赖客户", contact: "LOCAL"});
    const sale = actions.createSalesInvoice({date: "2026-10-04", customerId: customer.id, customerName: customer.name, contact: "LOCAL", channel: "到店", paymentMethod: "现金", settlementAccountId: account.id, isPaid: true, paidAmount: 1400, unpaidAmount: 0, needInvoice: false, freeShipping: true, aftersalesTerms: "店保", handleBy: "本地销售",
      items: cards.map((card) => ({inventoryId: card.id, productId: product.id, productName: product.name, sn: card.sn, condition: "95新", costPrice: 500, sellPrice: 700, profit: 200, aftersalesTerms: "店保"}))});
    actions.confirmSalesOutbound(sale.id, {handler: "本地仓库", codes: cards.map((card) => card.sn)}); docNo = sale.invoiceNo;
  }
  const order = actions.createReturnOrder({type, relatedDocType: type === "进货退货" ? "采购单" : "销售单", relatedDocNo: docNo, sourceInventoryId: cards[0]!.id, amount: type === "进货退货" ? 500 : 700, settlementMode: "原路退款", handler: "本地退货", reason: "资金依赖验证", inventoryAction: type === "进货退货" ? "退回供应商" : "退回待检测"});
  const sourcePaymentId = order.refundAllocations![0]!.sourcePaymentRecordId;
  const reverse = (id: string) => type === "进货退货" ? actions.reversePaymentOut(id) : actions.reversePaymentIn(id);
  return {state, actions, order, sourcePaymentId, reverse};
}

for (const type of ["进货退货", "销售退货"] as const) {
  test(`${type} source payments cannot be reversed underneath pending or completed refunds`, () => {
    const {state, actions, order, sourcePaymentId, reverse} = fixture(type);
    let before = structuredClone(state);
    assert.throws(() => reverse(sourcePaymentId), /退货|退款/); assert.deepEqual(state, before);
    actions.completeReturnOrder(order.id);
    before = structuredClone(state);
    assert.throws(() => reverse(sourcePaymentId), /退货|退款/); assert.deepEqual(state, before);
    actions.reverseReturnOrder(order.id);
    assert.doesNotThrow(() => reverse(sourcePaymentId), "reversing the owning return first releases the source payment dependency");
  });
  test(`${type} generated refunds can only be reversed through their owning return`, () => {
    const {state, actions, order} = fixture(type); actions.completeReturnOrder(order.id);
    const current = state.returnOrders.find((item) => item.id === order.id)!;
    const refund = current.paymentRecordId!; assert.ok(refund);
    const before = structuredClone(state);
    assert.throws(() => type === "进货退货" ? actions.reversePaymentIn(refund) : actions.reversePaymentOut(refund), /退货|退款/);
    assert.deepEqual(state, before);
    actions.reverseReturnOrder(order.id);
    assert.equal(state.returnOrders.find((item) => item.id === order.id)!.status, "已作废");
  });
  test(`${type} pending return blocks source invoice settlement edits before any fact changes`, () => {
    const {state, actions, order} = fixture(type);
    const before = structuredClone(state);
    const invoice = type === "进货退货" ? state.purchaseInvoices.find((item) => item.invoiceNo === order.relatedDocNo)! : state.salesInvoices.find((item) => item.invoiceNo === order.relatedDocNo)!;
    assert.throws(() => type === "进货退货" ? actions.updatePurchaseInvoice(invoice.id, {paidAmount: 100}) : actions.updateSalesInvoice(invoice.id, {paidAmount: 100}), /退货/);
    assert.deepEqual(state, before);
  });
  test(`${type} legacy refund allocation absence still protects ID and number aliases`, () => {
    const {state, order, sourcePaymentId, reverse} = fixture(type);
    const invoice = type === "进货退货" ? state.purchaseInvoices.find((item) => item.invoiceNo === order.relatedDocNo)! : state.salesInvoices.find((item) => item.invoiceNo === order.relatedDocNo)!;
    order.refundAllocations = [];
    order.relatedDocNo = invoice.id;
    const before = structuredClone(state);
    assert.throws(() => reverse(sourcePaymentId), /退货/);
    assert.deepEqual(state, before);
  });
  test(`${type} voided original payments cannot be reused even with an explicit fallback account`, () => {
    const {state, order, sourcePaymentId} = fixture(type);
    const payment = type === "进货退货" ? state.paymentOutRecords.find((item) => item.id === sourcePaymentId)! : state.paymentInRecords.find((item) => item.id === sourcePaymentId)!;
    payment.accountingStatus = "作废";
    const before = structuredClone(state);
    const helpers = createReturnFinancialHelpers({state, findSettlementAccount: (id) => state.settlementAccounts.find((item) => item.id === id)!});
    assert.throws(() => helpers.createRefundAllocations(type, order.relatedDocNo, order.amount, undefined, payment.accountId), /已作废|未入账/);
    assert.deepEqual(state, before);
  });
  test(`${type} skip-invoice options or another owning return never bypass generated-refund protection`, () => {
    const {state, actions, order} = fixture(type); actions.completeReturnOrder(order.id);
    const current = state.returnOrders.find((item) => item.id === order.id)!;
    const direction = type === "进货退货" ? "in" : "out";
    const payment = direction === "in" ? state.paymentInRecords.find((item) => item.id === current.paymentRecordId)! : state.paymentOutRecords.find((item) => item.id === current.paymentRecordId)!;
    const before = structuredClone(state);
    for (const options of [{skipInvoiceUpdate: true, allowPostedReverse: true}, {owningReturnId: "WRONG-RETURN", allowPostedReverse: true}]) {
      assert.throws(() => assertPaymentRemovalDependencies(state, payment, direction, options), /退货/);
    }
    assert.deepEqual(state, before);
  });
}
