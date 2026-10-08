import assert from "node:assert/strict";
import test from "node:test";
import {createInitialState, createStoreActions} from "./store.ts";
import {aftersalesMerge} from "./routes/aftersalesMutations.ts";

function fixture(outbound = true) {
  const state = createInitialState();
  const original = state.inventory.find((item) => item.status === "已入库")!;
  const cards = [0, 1].map((index) => ({...original, id: `LOCAL-AFTERSALES-KC-${index}`, sn: `LOCAL-AFTERSALES-SN-${index}`}));
  state.inventory = cards; state.aftersales = [];
  const actions = createStoreActions(state);
  const account = state.settlementAccounts.find((item) => item.enabled)!;
  const customer = actions.createCustomer({name: "本地售后关联客户", contact: "LOCAL-AFTERSALES-BINDING"});
  let sale = actions.createSalesInvoice({date: "2026-10-04", customerId: customer.id, customerName: customer.name,
    contact: customer.contact, channel: "到店", paymentMethod: "现金", settlementAccountId: account.id,
    isPaid: true, paidAmount: 2000, unpaidAmount: 0, needInvoice: false, freeShipping: true, aftersalesTerms: "店保",
    handleBy: "本地销售", paymentHandler: "本地销售", items: cards.map((card) => ({inventoryId: card.id,
      productId: card.productId, productName: card.productName, sn: card.sn, condition: card.condition,
      costPrice: card.costPrice, sellPrice: 1000, profit: 1000 - card.costPrice, aftersalesTerms: "店保"}))});
  if (outbound) sale = actions.confirmSalesOutbound(sale.id, {handler: "本地仓库", codes: cards.map((card) => card.id)});
  const input = {salesInvoiceNo: sale.invoiceNo, customerId: customer.id, customerName: customer.name,
    contact: customer.contact, inventoryNo: cards[0].id, productName: cards[0].productName, sn: cards[0].sn,
    type: "维修" as const, desc: "实物关联回归", repairCost: 0, refundAmount: 0, finalResult: "", handler: "本地售后"};
  return {state, actions, cards, sale, customer, input};
}

for (const change of ["missing-sale", "missing-inventory", "wrong-inventory", "wrong-sn", "wrong-customer", "void-sale", "wrong-line"] as const) {
  test(`aftersales creation rejects ${change} without changing any business state`, () => {
    const {state, actions, cards, sale, input} = fixture();
    const command = {...input};
    if (change === "missing-sale") command.salesInvoiceNo = "XS-NOT-FOUND";
    if (change === "missing-inventory") command.inventoryNo = "KC-NOT-FOUND";
    if (change === "wrong-inventory") command.inventoryNo = cards[1].id;
    if (change === "wrong-sn") command.sn = cards[1].sn;
    if (change === "wrong-customer") command.customerId = "KH-WRONG-CUSTOMER";
    if (change === "void-sale") sale.accountingStatus = "作废";
    if (change === "wrong-line") sale.items[0].inventoryId = "KC-OTHER-PHYSICAL-UNIT";
    const before = structuredClone(state);
    assert.throws(() => actions.addAftersalesClaim(command), /销售单|库存|序列号|客户|实物/);
    assert.deepEqual(state, before);
  });
}

test("aftersales cannot begin before real outbound confirmation", () => {
  const {state, actions, input} = fixture(false);
  const before = structuredClone(state);
  assert.throws(() => actions.addAftersalesClaim(input), /尚未.*出库|未出库/);
  assert.deepEqual(state, before);
});

test("a fresh command cannot create a second active claim for the same physical unit", () => {
  const {state, actions, input} = fixture();
  actions.addAftersalesClaim(input);
  const before = structuredClone(state);
  assert.throws(() => actions.addAftersalesClaim({...input, desc: "不同幂等号的重复工单"}), /处理中.*售后|售后工单/);
  assert.deepEqual(state, before);
});

test("physical IDs isolate legacy duplicate SN cards and the persistence patch", () => {
  const {state, actions, cards, input} = fixture();
  const unrelated = {...cards[1], id: "LOCAL-LEGACY-DUPLICATE-SN", sn: cards[0].sn};
  state.inventory.push(unrelated);
  const beforeUnrelated = structuredClone(unrelated);
  const claim = actions.addAftersalesClaim(input);
  assert.equal(state.inventory.find((card) => card.id === cards[0].id)!.status, "售后中");
  assert.deepEqual(state.inventory.find((card) => card.id === unrelated.id), beforeUnrelated);
  assert.deepEqual(aftersalesMerge(state, claim).inventory?.map((card) => card.id), [cards[0].id]);
  actions.updateAftersalesStatus(claim.id, {status: "已完成", repairCost: 0, finalResult: "原件寄回"});
  assert.deepEqual(state.inventory.find((card) => card.id === unrelated.id), beforeUnrelated);
});

for (const status of ["已完成", "已拒绝"] as const) {
  for (const change of ["sn", "inventory-id", "sale-owner", "sale-line", "void-sale", "stock-status"] as const) {
    test(`${status} refuses a changed ${change} before any financial or inventory side effect`, () => {
      const {state, actions, cards, sale, input} = fixture();
      const claim = actions.addAftersalesClaim(input);
      const card = state.inventory.find((item) => item.id === cards[0].id)!;
      if (change === "sn") card.sn = "LATER-PHYSICAL-SN";
      if (change === "inventory-id") card.id = "LATER-PHYSICAL-ID";
      if (change === "sale-owner") card.salesInvoiceId = "XS-LATER-SALE";
      if (change === "sale-line") sale.items[0].inventoryId = "KC-LATER-PHYSICAL-ID";
      if (change === "void-sale") sale.accountingStatus = "作废";
      if (change === "stock-status") card.status = "已拆卸";
      const before = structuredClone(state);
      assert.throws(() => actions.updateAftersalesStatus(claim.id, {status, repairCost: status === "已完成" ? 120 : 0, finalResult: "旧工单结案"}), /销售单|库存|序列号|实物/);
      assert.deepEqual(state, before);
    });
  }
}

for (const status of ["已完成", "已拒绝"] as const) {
  test(`a stale ${status} claim cannot overwrite a real return, inspection and resale`, () => {
    const {state, actions, cards, input} = fixture();
    const claim = actions.addAftersalesClaim(input);
    const order = actions.createReturnOrder({type: "销售退货", relatedDocType: "销售单", relatedDocNo: input.salesInvoiceNo,
      sourceInventoryId: cards[0].id, amount: 1000, settlementMode: "原路退款", handler: "本地测试",
      reason: "售后转正式退货", inventoryAction: "退回待检测"});
    actions.completeReturnOrder(order.id);
    const beforeReturnClose = structuredClone(state);
    assert.throws(() => actions.updateAftersalesStatus(claim.id, {status, repairCost: 0, finalResult: "退货后旧结案"}), /销售单|库存|实物/);
    assert.deepEqual(state, beforeReturnClose);
    actions.submitInspection({inventoryId: cards[0].id, sn: cards[0].sn, inspector: "本地测试",
      exteriorCheck: "完美无瑕", fanCheck: "静音顺畅", portsCheck: "全部正常", gpuzCheck: "核对一致",
      furmarkResult: "通过", threedMarkResult: "通过", vramResult: "全显存测试通过", temperature: 70, wattage: 300,
      noise: "适中", repaired: false, hiddenDefects: false, resultStatus: "通过"});
    const current = state.inventory.find((card) => card.id === cards[0].id)!;
    const nextSale = actions.createSalesInvoice({date: "2026-10-04", customerName: "后来再售客户", contact: "LOCAL-LATER-BUYER",
      channel: "到店", paymentMethod: "账期欠款", isPaid: false, paidAmount: 0, unpaidAmount: 1100,
      needInvoice: false, freeShipping: true, aftersalesTerms: "店保", handleBy: "本地销售",
      items: [{inventoryId: current.id, productId: current.productId, productName: current.productName,
        sn: current.sn, condition: current.condition, costPrice: current.costPrice, sellPrice: 1100,
        profit: 1100 - current.costPrice, aftersalesTerms: "店保"}]});
    actions.confirmSalesOutbound(nextSale.id, {handler: "本地仓库", codes: [current.id]});
    const beforeResaleClose = structuredClone(state);
    assert.throws(() => actions.updateAftersalesStatus(claim.id, {status, repairCost: status === "已完成" ? 120 : 0, finalResult: "再售后旧结案"}), /销售单|库存|实物/);
    assert.deepEqual(state, beforeResaleClose);
    const next = actions.addAftersalesClaim({...input, salesInvoiceNo: nextSale.invoiceNo, customerId: nextSale.customerId,
      customerName: nextSale.customerName, contact: nextSale.contact, desc: "新销售归属的新售后"});
    actions.updateAftersalesStatus(next.id, {status: "已完成", repairCost: 0, finalResult: "新归属原件寄回"});
    assert.deepEqual(state.aftersales.find((record) => record.id === claim.id), beforeResaleClose.aftersales.find((record) => record.id === claim.id));
    assert.equal(state.inventory.find((card) => card.id === current.id)!.salesInvoiceId, nextSale.invoiceNo);
  });
}

test("successful rejection returns only its own card to sold and a later new claim remains possible", () => {
  const {state, actions, cards, input} = fixture();
  const first = actions.addAftersalesClaim(input);
  actions.updateAftersalesStatus(first.id, {status: "已拒绝", repairCost: 0, finalResult: "原件寄回"});
  assert.equal(state.inventory.find((card) => card.id === cards[0].id)!.status, "已售出");
  const next = actions.addAftersalesClaim({...input, desc: "之后新的维修问题"});
  assert.notEqual(next.id, first.id);
});

test("legacy SN-only source lines and invoice IDs remain usable when ownership is provable", () => {
  const {state, actions, cards, sale, input} = fixture();
  sale.items[0].inventoryId = "";
  sale.outboundStatus = undefined;
  state.inventory.find((card) => card.id === cards[0].id)!.salesInvoiceId = sale.id;
  const claim = actions.addAftersalesClaim({...input, salesInvoiceNo: sale.id});
  assert.equal(claim.inventoryNo, cards[0].id);
  actions.updateAftersalesStatus(claim.id, {status: "已完成", repairCost: 0, finalResult: "原件寄回"});
  assert.equal(state.inventory.find((card) => card.id === cards[0].id)!.status, "已售出");
});

test("a resolved historical claim missing an ID gains the exact physical ID, never an ambiguous SN fallback", () => {
  for (const duplicateSn of [false, true]) {
    const {state, actions, cards, input} = fixture();
    const claim = actions.addAftersalesClaim(input);
    claim.inventoryNo = "";
    if (duplicateSn) state.inventory.push({...cards[1], id: "LEGACY-DUPLICATE-ID", sn: cards[0].sn});
    const before = structuredClone(state);
    if (duplicateSn) {
      assert.throws(() => actions.updateAftersalesStatus(claim.id, {status: "已完成", repairCost: 120}), /不唯一/);
      assert.deepEqual(state, before);
    } else {
      const completed = actions.updateAftersalesStatus(claim.id, {status: "已完成", repairCost: 0})!;
      assert.equal(completed.inventoryNo, cards[0].id);
      assert.deepEqual(aftersalesMerge(state, completed).inventory?.map((card) => card.id), [cards[0].id]);
    }
  }
});

test("repeating a previously rejected claim cannot release a newer active claim's stock", () => {
  const {state, actions, cards, input} = fixture();
  const rejected = actions.addAftersalesClaim(input);
  actions.updateAftersalesStatus(rejected.id, {status: "已拒绝", repairCost: 0, finalResult: "原件寄回"});
  const current = actions.addAftersalesClaim({...input, desc: "后续新工单"});
  actions.updateAftersalesStatus(rejected.id, {status: "已拒绝", repairCost: 0, finalResult: "原件寄回"});
  assert.equal(state.inventory.find((card) => card.id === cards[0].id)!.status, "售后中");
  assert.equal(state.aftersales.find((claim) => claim.id === current.id)!.status, "待处理");
});

test("new claims derive party and product labels from their verified source, not client-supplied text", () => {
  const {state, actions, input, sale, cards} = fixture();
  const claim = actions.addAftersalesClaim({...input, customerName: "冒名客户", contact: "错误联系", productName: "错误商品"});
  assert.equal(claim.customerName, sale.customerName); assert.equal(claim.contact, sale.contact);
  assert.equal(claim.productName, cards[0].productName);
  assert.equal(state.inventory.find((card) => card.id === cards[0].id)!.status, "售后中");
});

test("historical unlinked and multiply-active claims are preserved but cannot mutate stock or charge money", () => {
  for (const conflict of ["unlinked", "duplicate", "changed-customer", "other-active-sale"] as const) {
    const {state, actions, sale, input} = fixture();
    const claim = actions.addAftersalesClaim(input);
    if (conflict === "unlinked") claim.salesInvoiceNo = "LEGACY-NO-SOURCE";
    if (conflict === "duplicate") state.aftersales.push({...claim, id: "LEGACY-DUPLICATE-CLAIM", status: "处理中"});
    if (conflict === "changed-customer") claim.customerId = "LEGACY-OTHER-CUSTOMER";
    if (conflict === "other-active-sale") state.salesInvoices.push({...sale, id: "LATER-ACTIVE-SALE", invoiceNo: "LATER-ACTIVE-NO"});
    const before = structuredClone(state);
    assert.throws(() => actions.updateAftersalesStatus(claim.id, {status: "已完成", repairCost: 120}), /原销售单|多个|客户|其他销售单/);
    assert.deepEqual(state, before);
  }
});

for (const change of [{sn: "REBIND-SN"}, {inventoryNo: "REBIND-ID"}, {salesInvoiceNo: "REBIND-SALE"}, {customerId: "REBIND-PARTNER"}, {id: "REBIND-CLAIM"}, {repairPaymentOutId: "FAKE-PAYMENT"}]) {
  test(`internal aftersales updates cannot rebind ${Object.keys(change)[0]}`, () => {
    const {state, actions, input} = fixture();
    const claim = actions.addAftersalesClaim(input);
    const before = structuredClone(state);
    assert.throws(() => actions.updateAftersalesStatus(claim.id, {...change, status: "已完成", repairCost: 120}), /不能.*修改|不能.*变更/);
    assert.deepEqual(state, before);
  });
}
