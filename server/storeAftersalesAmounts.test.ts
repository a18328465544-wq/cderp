import assert from "node:assert/strict";
import test from "node:test";
import {createInitialState, createStoreActions} from "./store.ts";
import {aftersalesMerge} from "./routes/aftersalesMutations.ts";

function fixture() {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const card = state.inventory.find((item) => item.status === "已入库" || item.status === "已上架")!;
  const account = state.settlementAccounts.find((item) => item.enabled)!;
  const invoice = actions.createSalesInvoice({
    date: "2026-10-04", customerName: "本地维修回归客户", contact: "LOCAL-AFTERSALES", channel: "到店",
    paymentMethod: "现金", settlementAccountId: account.id, isPaid: true, paidAmount: 10000, unpaidAmount: 0,
    needInvoice: false, freeShipping: true, aftersalesTerms: "店保", handleBy: "本地测试", paymentHandler: "本地测试",
    items: [{inventoryId: card.id, productId: card.productId, productName: card.productName, sn: card.sn,
      condition: card.condition, costPrice: card.costPrice, sellPrice: 10000, profit: 10000 - card.costPrice, aftersalesTerms: "店保"}],
  });
  actions.confirmSalesOutbound(invoice.id, {handler: "本地仓库", codes: [card.sn]});
  const claim = actions.addAftersalesClaim({salesInvoiceNo: invoice.invoiceNo, customerName: invoice.customerName,
    contact: invoice.contact, inventoryNo: card.id, productName: card.productName, sn: card.sn,
    type: "维修", desc: "维修金额回归", repairCost: 0, refundAmount: 0, finalResult: "", handler: "本地售后"});
  return {state, actions, card, account, invoice, claim};
}

test("a posted repair payment cannot be independently reversed underneath its owning aftersales claim", () => {
  const {state, actions, claim} = fixture();
  const result = actions.updateAftersalesStatus(claim.id, {status: "已完成", repairCost: 120, finalResult: "原卡寄回"})!;
  assert.ok(result.repairPaymentOutId);
  const before = structuredClone(state);
  assert.throws(() => actions.reversePaymentOut(result.repairPaymentOutId!), /售后/);
  assert.deepEqual(state, before);
});

for (const repairCost of [0, 120]) {
  test(`repair completion with explicit zero refund charges only ${repairCost} and does not refund the sale`, () => {
    const {state, actions, card, account, invoice, claim} = fixture();
    const originalInvoice = structuredClone(state.salesInvoices.find((item) => item.id === invoice.id)!);
    const balance = state.settlementAccounts.find((item) => item.id === account.id)!.balance;
    const result = actions.updateAftersalesStatus(claim.id, {status: "已完成", repairCost, finalResult: "原卡寄回"})!;
    const payments = state.paymentOutRecords.filter((item) => item.relatedDocNo === claim.id);
    assert.equal(result.refundPaymentOutId, undefined);
    assert.equal(payments.filter((item) => item.businessType === "客户退款").length, 0);
    assert.deepEqual(payments.map((item) => [item.businessType, item.amount]), repairCost ? [["维修费", repairCost]] : []);
    assert.equal(state.settlementAccounts.find((item) => item.id === account.id)!.balance, balance - repairCost);
    assert.deepEqual(state.salesInvoices.find((item) => item.id === invoice.id), originalInvoice);
    assert.equal(state.inventory.find((item) => item.id === card.id)!.status, "已售出");
    assert.deepEqual(state.financeLedger.filter((item) => item.relatedId === claim.id).map((item) => item.amount), repairCost ? [-repairCost] : []);
    const snapshot = structuredClone(state);
    actions.updateAftersalesStatus(claim.id, {status: "已完成", repairCost, finalResult: "原卡寄回"});
    assert.deepEqual(state.settlementAccounts, snapshot.settlementAccounts);
    assert.deepEqual(state.paymentOutRecords, snapshot.paymentOutRecords);
    assert.deepEqual(state.settlementLedger, snapshot.settlementLedger);
    assert.deepEqual(state.financeLedger, snapshot.financeLedger);
  });
}

test("an explicit zero repair cost does not resurrect a legacy loss amount", () => {
  const {state, actions, claim} = fixture();
  Object.assign(claim, {loss: 999});
  actions.updateAftersalesStatus(claim.id, {status: "已完成", repairCost: 0, finalResult: "无需维修"});
  assert.equal(state.paymentOutRecords.some((item) => item.relatedDocNo === claim.id), false);
});

test("a legacy missing refund does not implicitly refund a repair, while a missing repair fee can use its legacy loss", () => {
  const {state, actions, claim} = fixture();
  Object.assign(claim, {refundAmount: undefined, repairCost: undefined, loss: 120});
  actions.updateAftersalesStatus(claim.id, {status: "已完成", finalResult: "原卡寄回"});
  assert.deepEqual(state.paymentOutRecords.filter((item) => item.relatedDocNo === claim.id).map((item) => [item.businessType, item.amount]), [["维修费", 120]]);
});

test("repair persistence patch includes the exact account, payment and two ledger records", () => {
  const {state, actions, claim, account} = fixture();
  const completed = actions.updateAftersalesStatus(claim.id, {status: "已完成", repairCost: 120, finalResult: "原卡寄回"})!;
  const payment = state.paymentOutRecords.find((item) => item.id === completed.repairPaymentOutId)!;
  const patch = aftersalesMerge(state, completed);
  assert.deepEqual(patch.paymentOutRecords, [payment]);
  assert.deepEqual(patch.settlementAccounts?.map((item) => item.id), [account.id]);
  assert.deepEqual(patch.settlementLedger?.map((item) => item.id), [payment.settlementLedgerId]);
  assert.deepEqual(patch.financeLedger?.map((item) => item.id), [payment.financeLedgerId]);
  assert.equal((patch.aftersales?.[0] as {repairPaymentOutId: string}).repairPaymentOutId, payment.id);
});

for (const amount of [-1, NaN, Infinity]) {
  test(`invalid legacy repair amount ${amount} rejects completion without changing any state`, () => {
    const {state, actions, claim} = fixture();
    const before = structuredClone(state);
    assert.throws(() => actions.updateAftersalesStatus(claim.id, {status: "已完成", repairCost: amount, finalResult: "非法金额"}), /有限非负/);
    assert.deepEqual(state, before);
  });
}

test("missing enabled repair account restores all claim, inventory, balance, ledger and audit facts", () => {
  const {state, actions, claim} = fixture();
  state.settlementAccounts = state.settlementAccounts.map((account) => ({...account, enabled: false}));
  const before = structuredClone(state);
  assert.throws(() => actions.updateAftersalesStatus(claim.id, {status: "已完成", repairCost: 120, finalResult: "原卡寄回"}), /启用的结算账户/);
  assert.deepEqual(state, before);
});

for (const change of [{status: "已拒绝" as const}, {repairCost: 999}, {refundAmount: 999}]) {
  test(`posted aftersales refuses changes to ${Object.keys(change)[0]} without a financial reversal`, () => {
    const {state, actions, claim} = fixture();
    actions.updateAftersalesStatus(claim.id, {status: "已完成", repairCost: 120, finalResult: "原卡寄回"});
    const before = structuredClone(state);
    assert.throws(() => actions.updateAftersalesStatus(claim.id, change), /已结案售后/);
    assert.deepEqual(state, before);
  });
}
