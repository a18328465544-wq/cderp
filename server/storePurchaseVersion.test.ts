import assert from "node:assert/strict";
import test from "node:test";
import {createInitialState, createStoreActions} from "./store.ts";

function fixture(paid = false, personal = false, credit = 0) {
  const state = createInitialState();
  state.purchaseInvoices = []; state.inventory = []; state.inspections = []; state.returnOrders = [];
  const actions = createStoreActions(state);
  const product = state.products[0]!;
  const partner = personal ? actions.createCustomer({name: "本地采购版本客户", contact: "LOCAL-PURCHASE"}) : actions.createVendor({name: "本地采购版本供应商", contact: "LOCAL-PURCHASE"});
  if (credit) state.vendors = state.vendors.map((vendor) => vendor.id === partner.id ? {...vendor, returnCreditBalance: credit} : vendor);
  const account = state.settlementAccounts.find((item) => item.enabled)!;
  const invoice = actions.createPurchaseInvoice({date: "2026-10-04", sourceType: personal ? "个人回收" : "同行拿货", sourcePartnerId: partner.id,
    sourcePartnerType: personal ? "customer" : "vendor", supplierName: partner.name, contact: partner.contact,
    paymentMethod: paid ? "现金" : "账期欠款", settlementAccountId: paid ? account.id : undefined, paidAmount: paid ? 2000 : 0, vendorCreditAppliedAmount: credit,
    unpaidAmount: paid ? 0 : 2000 - credit, isPaid: paid, handleBy: "本地采购", expressNo: "LOCAL-PURCHASE-EXPRESS",
    items: [0, 1].map((index) => ({tempId: `local-purchase-line-${index}`, productId: product.id, productName: product.name, category: product.category,
      brand: product.brand, model: product.model, version: product.version, vram: product.vram, sn: "", condition: "95新", inWarranty: false,
      repaired: false, gpuRisk: false, fullBox: true, buyPrice: 1000, estSellPrice: 1300, warehouseLocation: "待检测区"}))});
  const cards = state.inventory.filter((card) => card.purchaseInvoiceNo === invoice.invoiceNo);
  const assertStale = (version: number) => {
    const before = structuredClone(state);
    assert.throws(() => actions.updatePurchaseInvoice(invoice.id, {remarks: "过期采购页面覆盖"}, {expectedRecordVersion: version}), /修改|刷新|核对/);
    assert.deepEqual(state, before, "stale saves must not mutate any inventory, partner, account, ledger or audit fact");
  };
  const current = () => state.purchaseInvoices.find((item) => item.id === invoice.id)!;
  const pay = (amount = 300) => actions.createPaymentOut({supplierId: personal ? undefined : partner.id, customerId: personal ? partner.id : undefined,
    supplierName: partner.name, customerName: personal ? partner.name : undefined, accountId: account.id, amount,
    handler: "本地付款", paymentMethod: "现金", businessType: "采购付款", relatedDocType: "采购单", relatedDocNo: invoice.invoiceNo, time: "2026-10-04 10:00:00"});
  return {state, actions, partner, invoice, cards, current, assertStale, pay, account};
}

test("purchase payments and reversals invalidate stale drafts before changing money", () => {
  const {actions, current, assertStale, pay} = fixture();
  const payment = pay();
  assert.equal(current().recordVersion, 2); assertStale(1);
  actions.reversePaymentOut(payment.id);
  assert.equal(current().recordVersion, 3); assertStale(2);
});

test("purchase payments preserve applied supplier credit instead of resurrecting paid debt", () => {
  const {state, actions, partner, current, pay, account} = fixture(false, false, 500);
  const beforeBalance = account.balance;
  const payment = pay(1500);
  assert.equal(current().paidAmount, 1500); assert.equal(current().vendorCreditAppliedAmount, 500);
  assert.equal(current().unpaidAmount, 0); assert.equal(current().paymentStatus, "已付款");
  assert.equal(state.vendors.find((vendor) => vendor.id === partner.id)!.accountPayable, 0);
  const beforeOverpay = structuredClone(state);
  assert.throws(() => pay(1), /未付|不能补录/); assert.deepEqual(state, beforeOverpay);
  actions.reversePaymentOut(payment.id);
  assert.equal(current().paidAmount, 0); assert.equal(current().unpaidAmount, 1500);
  assert.equal(current().paymentStatus, "部分付款"); assert.equal(current().vendorCreditAppliedAmount, 500);
  assert.equal(state.vendors.find((vendor) => vendor.id === partner.id)!.accountPayable, 1500);
  assert.equal(state.settlementAccounts.find((item) => item.id === account.id)!.balance, beforeBalance);
});

for (const batch of [false, true]) test(`${batch ? "batch" : "single"} purchase return and reversal keep document revisions monotonic`, () => {
  const {actions, invoice, cards, current, assertStale} = fixture(true);
  const order = actions.createReturnOrder({type: "进货退货", relatedDocType: "采购单", relatedDocNo: invoice.invoiceNo,
    sourceInventoryId: cards[0]!.id, amount: batch ? 2000 : 1000, settlementMode: "原路退款", handler: "本地采购退货", reason: "版本回归",
    inventoryAction: "退回供应商", ...(batch ? {items: cards.map((card, index) => ({sourceInventoryId: card.id, sourcePurchaseItemIndex: index}))} : {})});
  actions.completeReturnOrder(order.id);
  assert.equal(current().recordVersion, 2); assertStale(1);
  actions.reverseReturnOrder(order.id);
  assert.equal(current().recordVersion, 3); assertStale(1); assertStale(2);
});

for (const personal of [false, true]) test(`${personal ? "customer" : "vendor"} identity updates invalidate purchase drafts`, () => {
  const {actions, partner, current, assertStale} = fixture(false, personal);
  if (personal) actions.updateCrmCustomer(partner.id, {name: "更名采购客户", contact: "NEW-CONTACT"});
  else actions.updateVendor(partner.id, {name: "更名供应商", contact: "NEW-CONTACT"});
  assert.equal(current().recordVersion, 2); assertStale(1);
});

test("inspection submission and edits advance only the related purchase revision", () => {
  const {state, actions, invoice, cards, current, assertStale} = fixture();
  state.purchaseInvoices.push({...invoice, id: "UNRELATED-PURCHASE", invoiceNo: `${invoice.invoiceNo}9`, recordVersion: 8});
  const report = actions.submitInspection({inventoryId: cards[0]!.id, sn: "LOCAL-PURCHASE-INSPECTION", inspector: "本地质检",
    exteriorCheck: "完美无瑕", fanCheck: "静音顺畅", portsCheck: "全部正常", gpuzCheck: "核对一致", furmarkResult: "通过",
    threedMarkResult: "通过", vramResult: "全显存测试通过", temperature: 70, wattage: 300, noise: "适中", repaired: false, hiddenDefects: false, resultStatus: "通过"});
  assert.equal(current().recordVersion, 2); assertStale(1);
  actions.updateInspection(report.id, {remarks: "已核对质保"}, 1);
  assert.equal(current().recordVersion, 3); assertStale(2);
  assert.equal(state.purchaseInvoices.find((item) => item.id === "UNRELATED-PURCHASE")!.recordVersion, 8);
});

test("tracking inbound, relocation and a multi-card batch each invalidate a purchase draft once", () => {
  const {actions, invoice, current, cards, assertStale} = fixture();
  const inbound = actions.scanInventoryFlow({mode: "入库", codes: [], trackingSnPairs: [{trackingNo: "LOCAL-PURCHASE-EXPRESS", sn: "LOCAL-INBOUND-SN"}], handler: "本地仓库"});
  assert.equal(inbound.updatedCount, 1); assert.equal(current().recordVersion, 2); assertStale(1);
  actions.scanInventoryFlow({mode: "移库", codes: [cards[0]!.id], warehouseLocation: "LOCAL-A2", handler: "本地仓库"});
  assert.equal(current().recordVersion, 3); assertStale(2);
  actions.batchUpdateInventory(cards.map((card) => card.id), {warehouseLocation: "LOCAL-A3"});
  assert.equal(current().recordVersion, 4); assertStale(3);
  const before = current().recordVersion;
  actions.scanInventoryFlow({mode: "入库", codes: [], trackingSnPairs: [{trackingNo: "INVALID-TRACKING", sn: "NEW-SN"}], handler: "本地仓库"});
  assert.equal(current().recordVersion, before, "a refused scan does not invalidate unrelated drafts");
  assert.equal(current().id, invoice.id);
});
