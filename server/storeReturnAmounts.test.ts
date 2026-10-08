import assert from "node:assert/strict";
import test from "node:test";
import type {ReturnOrderCreateInput} from "./storeReturnTypes.ts";
import {createInitialState, createStoreActions} from "./store.ts";

function fixture(type: "进货退货" | "销售退货", batch = false, zeroSalesCost = false) {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const account = state.settlementAccounts.find((item) => item.enabled);
  const product = state.products[0];
  assert.ok(account && product);
  const vendor = actions.createVendor({name: "退货金额测试供应商", contact: "LOCAL-AMOUNT"});
  const purchase = actions.createPurchaseInvoice({
    date: "2026-09-07", sourceType: "同行拿货", sourcePartnerType: "vendor", sourcePartnerId: vendor.id,
    supplierName: vendor.name, contact: vendor.contact, paymentMethod: "现金", isPaid: true,
    paidAmount: 350, unpaidAmount: 0, settlementAccountId: account.id, handleBy: "测试",
    items: [100, 250].map((buyPrice, index) => ({
      tempId: `return-amount-${index}`, productId: product.id, productName: product.name,
      category: product.category, model: product.model, brand: product.brand, version: product.version,
      vram: product.vram, sn: `RETURN-AMOUNT-SN-${index}`, condition: "99新", inWarranty: true,
      repaired: false, gpuRisk: false, fullBox: true, buyPrice, estSellPrice: buyPrice + 50, warehouseLocation: "A-1",
    })),
  });
  let cards = state.inventory.filter((card) => card.purchaseInvoiceNo === purchase.invoiceNo);
  assert.equal(cards.length, 2);
  if (type === "销售退货") {
    const customer = actions.createCustomer({name: "退货金额测试客户", contact: "LOCAL-RETURN-CUSTOMER"});
    state.inventory = state.inventory.map((card) => cards.some((source) => source.id === card.id) ? {...card, status: "已入库", ...(zeroSalesCost && card.id === cards[0].id ? {costPrice: 0} : {})} : card);
    cards = state.inventory.filter((card) => card.purchaseInvoiceNo === purchase.invoiceNo);
    const sales = actions.createSalesInvoice({
      date: "2026-09-07", customerName: customer.name, customerId: customer.id, contact: customer.contact,
      channel: "到店", paymentMethod: "现金", settlementAccountId: account.id, isPaid: true,
      paidAmount: cards.reduce((sum, card) => sum + card.costPrice + 50, 0), unpaidAmount: 0, needInvoice: false, freeShipping: true, aftersalesTerms: "店保",
      handleBy: "测试", paymentHandler: "测试", items: cards.map((card) => ({
        inventoryId: card.id, productId: card.productId, productName: card.productName, sn: card.sn,
        condition: card.condition, costPrice: card.costPrice, sellPrice: card.costPrice + 50,
        profit: 50, aftersalesTerms: "店保",
      })),
    });
    actions.confirmSalesOutbound(sales.id, {handler: "测试", codes: cards.map((card) => card.sn)});
  }
  const invoice = type === "进货退货" ? state.purchaseInvoices.find((item) => item.id === purchase.id)! : state.salesInvoices[0]!;
  const originalPrice = Number(Reflect.get(invoice.items[0], type === "进货退货" ? "buyPrice" : "sellPrice"));
  const input: ReturnOrderCreateInput = {
    type, relatedDocType: type === "进货退货" ? "采购单" : "销售单", relatedDocNo: invoice.invoiceNo,
    sourceInventoryId: cards[0].id, amount: batch ? 0 : originalPrice, settlementMode: "原路退款",
    handler: "测试", reason: "金额边界测试", inventoryAction: type === "进货退货" ? "退回供应商" : "退回待检测",
    ...(batch ? {items: cards.map((card, index) => ({sourceInventoryId: card.id, ...(type === "进货退货" ? {sourcePurchaseItemIndex: index} : {sourceSalesItemIndex: index})}))} : {}),
  };
  return {state, actions, invoice, input, cards, accountId: account.id, priceKey: type === "进货退货" ? "buyPrice" : "sellPrice", originalPrice};
}

function inspectReturnedCard(context: ReturnType<typeof fixture>, inventoryId: string) {
  const {state, actions} = context;
  const card = state.inventory.find((item) => item.id === inventoryId)!;
  actions.submitInspection({
    inventoryId: card.id, sn: card.sn, inspector: "后续质检", exteriorCheck: "完美无瑕",
    fanCheck: "静音顺畅", portsCheck: "全部正常", gpuzCheck: "核对一致",
    furmarkResult: "通过", threedMarkResult: "通过", vramResult: "全显存测试通过",
    temperature: 70, wattage: 300, noise: "适中", repaired: false, hiddenDefects: false,
    resultStatus: "通过",
  });
  return state.inventory.find((item) => item.id === inventoryId)!;
}

function resellReturnedCard(context: ReturnType<typeof fixture>, inventoryId: string) {
  const {actions, accountId} = context;
  const card = inspectReturnedCard(context, inventoryId);
  const buyer = actions.createCustomer({name: "后续销售客户", contact: "LOCAL-RESALE"});
  const sellPrice = card.costPrice + 100;
  const sales = actions.createSalesInvoice({
    date: "2026-09-08", customerId: buyer.id, customerName: buyer.name, contact: buyer.contact,
    channel: "到店", paymentMethod: "现金", settlementAccountId: accountId, isPaid: true,
    paidAmount: sellPrice, unpaidAmount: 0, needInvoice: false, freeShipping: true, aftersalesTerms: "店保",
    handleBy: "后续销售", paymentHandler: "后续销售", items: [{
      inventoryId: card.id, productId: card.productId, productName: card.productName, sn: card.sn,
      condition: card.condition, costPrice: card.costPrice, sellPrice, profit: sellPrice - card.costPrice,
      aftersalesTerms: "店保",
    }],
  });
  return actions.confirmSalesOutbound(sales.id, {handler: "后续仓库", codes: [card.sn]});
}

for (const batch of [false, true]) {
  test(`sales return ${batch ? "batch" : "single"} reversal cannot steal inventory from a later completed sale`, () => {
    const context = fixture("销售退货", batch);
    const {state, actions, input, cards} = context;
    const created = actions.createReturnOrder(input);
    const completed = actions.completeReturnOrder(created.id);
    const resold = resellReturnedCard(context, cards[batch ? 1 : 0].id);
    const before = structuredClone(state);
    assert.throws(() => actions.reverseReturnOrder(completed.id), /后续|库存状态/);
    assert.deepEqual(state, before);
    assert.equal(state.inventory.find((item) => item.id === cards[batch ? 1 : 0].id)?.salesInvoiceId, resold.invoiceNo);
  });
  test(`sales return ${batch ? "batch" : "single"} reversal checks active invoice linkage even if stock status was reset`, () => {
    const context = fixture("销售退货", batch);
    const {state, actions, input, cards} = context;
    const completed = actions.completeReturnOrder(actions.createReturnOrder(input).id);
    const targetId = cards[batch ? 1 : 0].id;
    resellReturnedCard(context, targetId);
    state.inventory = state.inventory.map((card) => card.id === targetId ? {...card, status: "待检测", salesInvoiceId: undefined} : card);
    const before = structuredClone(state);
    assert.throws(() => actions.reverseReturnOrder(completed.id), /后续销售关联/);
    assert.deepEqual(state, before);
  });
  for (const operation of ["inspection", "disassembly"] as const) {
    test(`sales return ${batch ? "batch" : "single"} rejects reversal after a later ${operation}`, () => {
      const context = fixture("销售退货", batch);
      const {state, actions, input, cards} = context;
      const completed = actions.completeReturnOrder(actions.createReturnOrder(input).id);
      const target = cards[batch ? 1 : 0];
      if (operation === "inspection") inspectReturnedCard(context, target.id);
      else actions.createAssemblyOperation({
        type: "拆卸", handler: "后续拆装", beforeSn: target.sn,
        afterParts: [{partName: "后续拆装配件", category: "其他配件", sn: `LATER-PART-${batch}`, costPrice: target.costPrice}],
      });
      const before = structuredClone(state);
      assert.throws(() => actions.reverseReturnOrder(completed.id), /库存状态/);
      assert.deepEqual(state, before);
    });
  }
}

for (const type of ["进货退货", "销售退货"] as const) {
  test(`${type} domain reversal rejects pending orders without voiding or deleting them`, () => {
    const {state, actions, input} = fixture(type);
    const order = actions.createReturnOrder(input);
    const before = structuredClone(state);
    assert.throws(() => actions.reverseReturnOrder(order.id), /只有已完成退货单可以冲销/);
    assert.deepEqual(state, before);
  });
  for (const batch of [false, true]) {
    for (const operation of ["missing-id", "changed-sn"] as const) {
      test(`${type} ${batch ? "batch" : "single"} does not restore a changed physical identity (${operation})`, () => {
        const {state, actions, input, cards} = fixture(type, batch);
        const completed = actions.completeReturnOrder(actions.createReturnOrder(input).id);
        const line = batch ? completed.items![0] : completed;
        if (operation === "missing-id") line.sourceInventoryId = "MISSING-PHYSICAL-CARD";
        else state.inventory = state.inventory.map((card) => card.id === cards[0].id ? {...card, sn: "CHANGED-PHYSICAL-SN"} : card);
        const before = structuredClone(state);
        assert.throws(() => actions.reverseReturnOrder(completed.id), /原库存编号不一致|序列号已变更/);
        assert.deepEqual(state, before);
      });
    }
    test(`${type} ${batch ? "batch" : "single"} direct-scrap reversal preserves normal restoration and rejects a second execution`, () => {
      const {state, actions, input, invoice, cards} = fixture(type, batch);
      const sourceStatus = state.inventory.find((item) => item.id === cards[0].id)!.status;
      const completed = actions.completeReturnOrder(actions.createReturnOrder({...input, inventoryAction: "直接报废"}).id);
      assert.equal(state.inventory.find((item) => item.id === cards[0].id)?.status, "已报废");
      const reversed = actions.reverseReturnOrder(completed.returnNo);
      assert.equal(reversed.status, "已作废");
      const restored = type === "进货退货" ? state.purchaseInvoices.find((item) => item.id === invoice.id)! : state.salesInvoices.find((item) => item.id === invoice.id)!;
      assert.deepEqual(restored.items, invoice.items);
      assert.equal(state.inventory.find((item) => item.id === cards[0].id)?.status, sourceStatus);
      const before = structuredClone(state);
      assert.throws(() => actions.reverseReturnOrder(completed.id), /只有已完成退货单可以冲销/);
      assert.deepEqual(state, before);
    });
  }
}

test("return completion rejection restores optional inspection fields exactly without import normalization", () => {
  const context = fixture("进货退货");
  const {state, actions, input, cards} = context;
  inspectReturnedCard(context, cards[1].id);
  const order = actions.createReturnOrder(input);
  order.amount = 999;
  const before = structuredClone(state);
  assert.throws(() => actions.completeReturnOrder(order.id), /金额与原单明细不一致/);
  assert.deepEqual(state, before);
});

for (const type of ["进货退货", "销售退货"] as const) {
  for (const batch of [false, true]) {
    for (const badPrice of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      test(`${type} ${batch ? "batch" : "single"} rejects source price ${badPrice} without changing any aggregate`, () => {
        const {state, actions, invoice, input, priceKey} = fixture(type, batch);
        Reflect.set(invoice.items[0], priceKey, badPrice);
        const before = structuredClone(state);
        assert.throws(() => actions.createReturnOrder(input), /明细金额必须为大于 0 的有效数字/);
        assert.deepEqual(state, before);
      });
    }
    for (const target of ["source", "order", ...(batch ? ["line"] : [])]) {
      for (const badPrice of [0, 999, Number.NaN]) {
        test(`${type} ${batch ? "batch" : "single"} completion rejects changed ${target} ${badPrice} atomically`, () => {
          const {state, actions, invoice, input, priceKey} = fixture(type, batch);
          const order = actions.createReturnOrder(input);
          if (target === "source") Reflect.set(invoice.items[0], priceKey, badPrice);
          else if (target === "line") order.items![0].amount = badPrice;
          else order.amount = badPrice;
          const before = structuredClone(state);
          assert.throws(() => actions.completeReturnOrder(order.id), /明细金额必须|金额与原单明细不一致/);
          assert.deepEqual(state, before);
          assert.equal(state.returnOrders.find((item) => item.id === order.id)?.status, "待处理");
        });
      }
    }
    test(`${type} ${batch ? "batch" : "single"} still reverses source invoice, inventory and all refund ledgers together`, () => {
      const {state, actions, input, invoice, cards, accountId, originalPrice} = fixture(type, batch);
      const balanceBefore = state.settlementAccounts.find((item) => item.id === accountId)!.balance;
      const order = actions.createReturnOrder(input);
      const expected = batch ? (type === "进货退货" ? 350 : 450) : originalPrice;
      assert.equal(order.amount, expected);
      assert.equal(actions.completeReturnOrder(order.id).status, "已完成");
      assert.equal(state.settlementAccounts.find((item) => item.id === accountId)!.balance, balanceBefore + (type === "进货退货" ? expected : -expected));
      const source = type === "进货退货" ? state.purchaseInvoices.find((item) => item.id === invoice.id)! : state.salesInvoices.find((item) => item.id === invoice.id)!;
      assert.equal(source.items.length, batch ? 0 : 1);
      for (const card of batch ? cards : cards.slice(0, 1)) assert.equal(state.inventory.find((item) => item.id === card.id)?.status, type === "进货退货" ? "已退货" : "待检测");
      const payments = (type === "进货退货" ? state.paymentInRecords : state.paymentOutRecords).filter((item) => item.relatedDocNo === order.returnNo);
      assert.equal(payments.length, 1);
      assert.equal(payments[0].amount, expected);
      assert.equal(state.settlementLedger.filter((item) => item.relatedDocNo === order.returnNo).length, 1);
      assert.equal(state.financeLedger.filter((item) => item.relatedId === order.returnNo).length, 1);
      assert.equal(actions.completeReturnOrder(order.id).status, "已完成");
      assert.equal((type === "进货退货" ? state.paymentInRecords : state.paymentOutRecords).filter((item) => item.relatedDocNo === order.returnNo).length, 1);
    });
    for (const corrupt of ["snapshot-zero", "snapshot-invalid", "order-zero", ...(batch ? ["line-zero"] : [])]) {
      test(`${type} ${batch ? "batch" : "single"} reversal rejects ${corrupt} before touching any collection`, () => {
        const {state, actions, input, priceKey} = fixture(type, batch);
        const created = actions.createReturnOrder(input);
        const completed = actions.completeReturnOrder(created.id);
        const line = batch ? completed.items![0] : completed;
        if (corrupt.startsWith("snapshot")) Reflect.set(type === "进货退货" ? line.sourcePurchaseItemSnapshot! : line.sourceSalesItemSnapshot!, priceKey, corrupt === "snapshot-zero" ? 0 : Number.NaN);
        else if (corrupt === "line-zero") line.amount = 0;
        else completed.amount = 0;
        const before = structuredClone(state);
        assert.throws(() => actions.reverseReturnOrder(completed.id), /快照不一致|明细合计不一致/);
        assert.deepEqual(state, before);
      });
    }
    test(`${type} ${batch ? "batch" : "single"} rolls back an earlier refund reversal when a later linked payment fails`, () => {
      const {state, actions, input} = fixture(type, batch);
      const created = actions.createReturnOrder(input);
      const completed = actions.completeReturnOrder(created.id);
      // Inject a malformed historical second refund after the valid one. The
      // first payment is reversed before the second fails its ledger lookup.
      if (type === "进货退货") {
        const refund = state.paymentInRecords.find((item) => item.relatedDocNo === completed.returnNo)!;
        state.paymentInRecords.push({...refund, id: "BROKEN-REFUND-IN", settlementLedgerId: "MISSING-SETTLEMENT", financeLedgerId: "MISSING-FINANCE"});
      } else {
        const refund = state.paymentOutRecords.find((item) => item.relatedDocNo === completed.returnNo)!;
        state.paymentOutRecords.push({...refund, id: "BROKEN-REFUND-OUT", settlementLedgerId: "MISSING-SETTLEMENT", financeLedgerId: "MISSING-FINANCE"});
      }
      const before = structuredClone(state);
      assert.throws(() => actions.reverseReturnOrder(completed.id), /缺少唯一关联流水/);
      assert.deepEqual(state, before);
    });
  }
  test(`${type} persists the canonical source price instead of a tolerated stale client amount`, () => {
    const {actions, input, originalPrice} = fixture(type);
    assert.equal(actions.createReturnOrder({...input, amount: originalPrice + 0.005}).amount, originalPrice);
  });
}

for (const batch of [false, true]) {
  test(`legacy missing purchase price ${batch ? "batch" : "single"} uses stock cost consistently through completion`, () => {
    const {state, actions, invoice, input, accountId} = fixture("进货退货", batch);
    Reflect.deleteProperty(invoice.items[0], "buyPrice");
    const vendorBefore = state.vendors.find((item) => item.name === "退货金额测试供应商")!;
    const totalBefore = vendorBefore.totalBuyAmount;
    const balanceBefore = state.settlementAccounts.find((item) => item.id === accountId)!.balance;
    const order = actions.createReturnOrder(input);
    const expected = batch ? 350 : 100;
    assert.equal(order.amount, expected);
    actions.completeReturnOrder(order.id);
    const vendorAfter = state.vendors.find((item) => item.id === vendorBefore.id)!;
    assert.equal(vendorAfter.totalBuyAmount, totalBefore - expected);
    assert.equal(state.settlementAccounts.find((item) => item.id === accountId)!.balance, balanceBefore + expected);
    assert.equal(state.purchaseInvoices.find((item) => item.id === invoice.id)?.items.length, batch ? 0 : 1);
    actions.reverseReturnOrder(order.id);
    const restored = state.purchaseInvoices.find((item) => item.id === invoice.id)!;
    assert.equal(restored.items[0].buyPrice, 100);
    assert.equal(restored.totalCost, 350);
    assert.equal(state.settlementAccounts.find((item) => item.id === accountId)!.balance, balanceBefore);
  });
}

for (const batch of [false, true]) {
  test(`sales reversal ${batch ? "batch" : "single"} preserves zero source cost even if current stock cost changes`, () => {
    const {state, actions, input, invoice, accountId, cards} = fixture("销售退货", batch, true);
    const balanceBefore = state.settlementAccounts.find((item) => item.id === accountId)!.balance;
    const sourceItems = structuredClone(invoice.items);
    const salesSource = state.salesInvoices.find((item) => item.id === invoice.id)!;
    const customer = state.customers.find((item) => item.id === salesSource.customerId)!;
    // Keep the partner aggregate above this return's profit so its existing
    // nonnegative clamp does not obscure source-cost restoration in this test.
    customer.totalProfit = 1_000;
    const profitBefore = customer.totalProfit;
    const order = actions.createReturnOrder(input);
    const completed = actions.completeReturnOrder(order.id);
    state.inventory = state.inventory.map((card) => card.id === cards[0].id ? {...card, costPrice: 999} : card);
    const snapshot = batch ? completed.items![0].sourceSalesItemSnapshot! : completed.sourceSalesItemSnapshot!;
    Reflect.deleteProperty(snapshot, "profit");
    actions.reverseReturnOrder(completed.id);
    const restored = state.salesInvoices.find((item) => item.id === invoice.id)!;
    assert.deepEqual(restored.items, sourceItems);
    assert.equal(restored.items[0].costPrice, 0);
    assert.equal(restored.items[0].profit, 50);
    assert.equal(state.customers.find((item) => item.id === salesSource.customerId)?.totalProfit, profitBefore);
    assert.equal(state.settlementAccounts.find((item) => item.id === accountId)!.balance, balanceBefore);
    assert.equal(state.inventory.find((item) => item.id === cards[0].id)?.salesPrice, 50);
  });
}

test("new sales collections persist their normalized business type across payment and both ledgers", () => {
  const {state, invoice} = fixture("销售退货");
  const payment = state.paymentInRecords.find((item) => item.relatedDocNo === invoice.invoiceNo);
  assert.ok(payment);
  assert.equal(payment.businessType, "销售收款");
  assert.equal(state.settlementLedger.find((item) => item.id === payment.settlementLedgerId)?.businessType, "销售收款");
  assert.equal(state.financeLedger.find((item) => item.id === payment.financeLedgerId)?.type, "销售收入");
});

test("legacy untyped linked sales collection can be allocated without inventing a new payment or editing history", () => {
  const {state, actions, invoice, input} = fixture("销售退货");
  const payment = state.paymentInRecords.find((item) => item.relatedDocNo === invoice.invoiceNo)!;
  Reflect.deleteProperty(payment, "businessType");
  const beforePayments = structuredClone(state.paymentInRecords);
  const order = actions.createReturnOrder(input);
  assert.equal(order.refundAllocations?.[0]?.sourcePaymentRecordId, payment.id);
  assert.deepEqual(state.paymentInRecords, beforePayments);
  actions.completeReturnOrder(order.id);
  assert.deepEqual(state.paymentInRecords, beforePayments);
  assert.equal(state.paymentOutRecords.filter((item) => item.relatedDocNo === order.returnNo).length, 1);
});

test("untyped unrelated income and explicitly non-sales types are not used as sales refund sources", () => {
  for (const incompatible of ["untyped-unrelated", "explicit-other"] as const) {
    const {state, actions, invoice, input} = fixture("销售退货");
    const payment = state.paymentInRecords.find((item) => item.relatedDocNo === invoice.invoiceNo)!;
    if (incompatible === "untyped-unrelated") {
      Reflect.deleteProperty(payment, "businessType");
      payment.relatedDocType = "其他";
    } else payment.businessType = "其他收入";
    const before = structuredClone(state);
    assert.throws(() => actions.createReturnOrder(input), /原单缺少收付款流水/);
    assert.deepEqual(state, before);
  }
});
