import assert from "node:assert/strict";
import test from "node:test";
import type {ReturnOrderCreateInput} from "./storeReturnTypes.ts";
import {createInitialState, createStoreActions} from "./store.ts";

function fixture(type: "进货退货" | "销售退货", batch = false, noPurchaseSn = false) {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const account = state.settlementAccounts.find((item) => item.enabled)!;
  const products = state.products.slice(0, 2);
  assert.equal(products.length, 2);
  const vendor = actions.createVendor({name: "本地关联测试供应商", contact: "LOCAL-RETURN-BINDING"});
  const purchase = actions.createPurchaseInvoice({
    date: "2026-09-07", sourceType: "同行拿货", sourcePartnerType: "vendor", sourcePartnerId: vendor.id,
    supplierName: vendor.name, contact: vendor.contact, paymentMethod: "现金", isPaid: true,
    paidAmount: 200, unpaidAmount: 0, settlementAccountId: account.id, handleBy: "本地测试",
    items: products.map((product, index) => ({
      tempId: `binding-line-${index}`, productId: product.id, productName: product.name,
      category: product.category, model: product.model, brand: product.brand, version: product.version,
      vram: product.vram, sn: noPurchaseSn ? "" : `LOCAL-BINDING-SN-${index}`, condition: "99新", inWarranty: true,
      repaired: false, gpuRisk: false, fullBox: true, buyPrice: 100, estSellPrice: 150, warehouseLocation: "A-1",
    })),
  });
  const cards = state.inventory.filter((card) => card.purchaseInvoiceNo === purchase.invoiceNo);
  assert.equal(cards.length, 2);
  const customer = actions.createCustomer({name: "本地关联测试客户", contact: "LOCAL-RETURN-BUYER"});
  const sell = () => {
    const current = cards.map((card) => state.inventory.find((item) => item.id === card.id)!);
    const sales = actions.createSalesInvoice({
      date: "2026-09-07", customerId: customer.id, customerName: customer.name, contact: customer.contact,
      channel: "到店", paymentMethod: "现金", isPaid: true, paidAmount: 300, unpaidAmount: 0,
      settlementAccountId: account.id, needInvoice: false, freeShipping: false, aftersalesTerms: "店保",
      handleBy: "本地销售", paymentHandler: "本地销售", items: current.map((card) => ({
        inventoryId: card.id, productId: card.productId, productName: card.productName, sn: card.sn,
        condition: card.condition, costPrice: card.costPrice, sellPrice: 150, profit: 50, aftersalesTerms: "店保",
      })),
    });
    return actions.confirmSalesOutbound(sales.id, {handler: "本地仓库", codes: current.map((card) => card.id)});
  };
  const inspect = () => {
    for (const card of cards) actions.submitInspection({
      inventoryId: card.id, sn: card.sn || `LOCAL-INSPECTED-${card.id}`, inspector: "本地质检",
      exteriorCheck: "完美无瑕", fanCheck: "静音顺畅", portsCheck: "全部正常", gpuzCheck: "核对一致",
      furmarkResult: "通过", threedMarkResult: "通过", vramResult: "全显存测试通过", temperature: 70,
      wattage: 300, noise: "适中", repaired: false, hiddenDefects: false, resultStatus: "通过",
    });
  };
  let sourceNo = purchase.invoiceNo;
  if (type === "销售退货") {inspect(); sourceNo = sell().invoiceNo;}
  const input: ReturnOrderCreateInput = {
    type, relatedDocType: type === "进货退货" ? "采购单" : "销售单", relatedDocNo: sourceNo,
    sourceInventoryId: cards[0].id, amount: type === "进货退货" ? 100 : 150, settlementMode: "原路退款",
    handler: "本地测试", reason: "实物关联回归", inventoryAction: type === "进货退货" ? "退回供应商" : "退回待检测",
    ...(batch ? {batchMode: "多件退货", items: [{sourceInventoryId: cards[0].id, ...(type === "进货退货" ? {sourcePurchaseItemIndex: 0} : {sourceSalesItemIndex: 0})}]} : {}),
  };
  return {state, actions, cards, purchase, input, inspect, sell};
}

for (const type of ["进货退货", "销售退货"] as const) {
  for (const batch of [false, true]) {
    test(`${type} ${batch ? "batch" : "single"} rejects a same-price line belonging to another physical product`, () => {
      const {state, actions, cards, input} = fixture(type, batch, type === "进货退货");
      const before = structuredClone(state);
      const wrongIndex = type === "进货退货" ? {sourcePurchaseItemIndex: 1} : {sourceSalesItemIndex: 1};
      const command = batch ? {...input, items: [{sourceInventoryId: cards[0].id, ...wrongIndex}]} : {...input, ...wrongIndex};
      assert.throws(() => actions.createReturnOrder(command), /不匹配|不属于/);
      assert.deepEqual(state, before);
    });
    test(`${type} ${batch ? "batch" : "single"} completion rejects changed physical SN without touching refunds or stock`, () => {
      const {state, actions, cards, input} = fixture(type, batch);
      const order = actions.createReturnOrder(input);
      state.inventory = state.inventory.map((card) => card.id === cards[0].id ? {...card, sn: "LATER-CHANGED-SN"} : card);
      const before = structuredClone(state);
      assert.throws(() => actions.completeReturnOrder(order.id), /不匹配|序列号|不存在/);
      assert.deepEqual(state, before);
    });
  }
}

for (const batch of [false, true]) {
  test(`pending purchase ${batch ? "batch" : "single"} cannot reclaim stock after inspection and a later sale`, () => {
    const {state, actions, cards, input, inspect, sell} = fixture("进货退货", batch);
    const order = actions.createReturnOrder(input);
    inspect();
    const sales = sell();
    const before = structuredClone(state);
    assert.throws(() => actions.completeReturnOrder(order.id), /已售出|销售关联|库存状态|后续/);
    assert.deepEqual(state, before);
    assert.equal(state.inventory.find((card) => card.id === cards[0].id)?.salesInvoiceId, sales.invoiceNo);
  });
}

for (const type of ["进货退货", "销售退货"] as const) {
  for (const batch of [false, true]) {
    test(`${type} ${batch ? "batch" : "single"} completes and reverses the correct physical unit`, () => {
      const {state, actions, cards, purchase, input} = fixture(type, batch, type === "进货退货");
      const originalItems = structuredClone(type === "进货退货" ? purchase.items : state.salesInvoices[0].items);
      const order = actions.createReturnOrder(input);
      const completed = actions.completeReturnOrder(order.id);
      const invoice = type === "进货退货" ? state.purchaseInvoices.find((item) => item.id === purchase.id)! : state.salesInvoices[0];
      assert.equal(invoice.items.length, 1);
      assert.equal(invoice.items[0].productId, originalItems[1].productId);
      assert.equal(state.inventory.find((card) => card.id === cards[0].id)?.status, type === "进货退货" ? "已退货" : "待检测");
      actions.reverseReturnOrder(completed.id);
      const restored = type === "进货退货" ? state.purchaseInvoices.find((item) => item.id === purchase.id)! : state.salesInvoices[0];
      assert.deepEqual(restored.items, originalItems);
    });
    for (const change of ["line", "purchase-link", "missing-id"] as const) {
      test(`${type} ${batch ? "batch" : "single"} completion rejects a changed ${change} atomically`, () => {
        const {state, actions, cards, input, purchase} = fixture(type, batch);
        const order = actions.createReturnOrder(input);
        const line = batch ? order.items![0] : order;
        if (change === "line") {
          if (type === "进货退货") line.sourcePurchaseItemId = `temp:${purchase.items[1].tempId}`;
          else line.sourceSalesItemId = `inventory:${cards[1].id}`;
        } else if (change === "missing-id") line.sourceInventoryId = "MISSING-LOCAL-INVENTORY";
        else state.inventory = state.inventory.map((card) => card.id === cards[0].id
          ? {...card, ...(type === "进货退货" ? {purchaseInvoiceNo: "OTHER-PURCHASE"} : {salesInvoiceId: "OTHER-SALE"})} : card);
        const before = structuredClone(state);
        assert.throws(() => actions.completeReturnOrder(order.id), /不匹配|不属于|不存在|库存/);
        assert.deepEqual(state, before);
      });
    }
  }
  test(`${type} creation does not substitute an existing SN for an explicit missing inventory ID`, () => {
    const {state, actions, cards, input} = fixture(type);
    const before = structuredClone(state);
    assert.throws(() => actions.createReturnOrder({...input, sourceInventoryId: "MISSING-LOCAL-ID", sn: cards[0].sn}), /不属于|库存|不匹配/);
    assert.deepEqual(state, before);
  });
}

for (const batch of [false, true]) {
  for (const change of ["locked", "hidden-sale", "changed-source-sn"] as const) {
    test(`purchase ${batch ? "batch" : "single"} completion rejects ${change} without releasing someone else's stock`, () => {
      const {state, actions, cards, input, purchase, inspect, sell} = fixture("进货退货", batch);
      const order = actions.createReturnOrder(input);
      if (change === "locked") state.inventory = state.inventory.map((card) => card.id === cards[0].id ? {...card, status: "已锁定"} : card);
      else if (change === "hidden-sale") {
        inspect(); sell();
        state.inventory = state.inventory.map((card) => card.id === cards[0].id ? {...card, status: "已入库", salesInvoiceId: undefined} : card);
      } else purchase.items[0].sn = "OTHER-PHYSICAL-SN";
      const before = structuredClone(state);
      assert.throws(() => actions.completeReturnOrder(order.id), /不匹配|已锁定|销售关联/);
      assert.deepEqual(state, before);
    });
  }
  test(`purchase ${batch ? "batch" : "single"} permits inspection of an initially blank SN before return completion`, () => {
    const {state, actions, cards, input, inspect} = fixture("进货退货", batch, true);
    const order = actions.createReturnOrder(input);
    inspect();
    assert.equal(actions.completeReturnOrder(order.id).status, "已完成");
    assert.equal(state.inventory.find((card) => card.id === cards[0].id)?.status, "已退货");
  });
}

test("legacy SN-bound sale updates the resolved physical inventory even when its line has no inventory ID", () => {
  const {state, actions, cards, input} = fixture("销售退货");
  state.salesInvoices[0].items[0].inventoryId = "";
  const completed = actions.completeReturnOrder(actions.createReturnOrder(input).id);
  assert.equal(completed.sourceInventorySnapshot?.status, "已售出");
  assert.equal(state.inventory.find((card) => card.id === cards[0].id)?.status, "待检测");
  assert.equal(state.inventory.find((card) => card.id === cards[1].id)?.status, "已售出");
});
