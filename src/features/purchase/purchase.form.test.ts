import assert from "node:assert/strict";
import test from "node:test";
import {createPurchaseDefaults} from "./purchase.defaults";
import {calculatePurchaseSettlement, calculatePurchaseSummary, expandPurchaseLines} from "./purchase.calculations";
import {parsePurchaseOrderValues, purchaseOrderSchema} from "./purchase.schema";
import {filterPurchaseSources, purchasePartnerTypeForSource} from "./purchase.sources";

function validPurchaseValues() {
  const values = createPurchaseDefaults("测试员");
  values.sourcePartnerId = "V-1";
  values.sourcePartnerType = "vendor";
  values.supplierName = "同行供应商";
  values.items = [{
    ...values.items[0]!,
    productId: "P-1",
    productName: "RTX 4090",
    category: "显卡",
    brand: "NVIDIA",
    model: "RTX 4090",
    buyPrice: 1000,
    estSellPrice: 1300,
    quantity: 2,
  }];
  return values;
}

test("purchase defaults use the current operator for the order and payment handlers", () => {
  const values = createPurchaseDefaults("当前操作人");
  assert.equal(values.handleBy, "当前操作人");
  assert.equal(values.paymentHandler, "当前操作人");
  assert.equal(values.items.length, 4);
  assert.ok(values.items.every((item) => item.productId === ""));
});

test("purchase summary and expansion preserve quantity greater than one", () => {
  const values = validPurchaseValues();
  values.items[0]!.tempId = "row-1";
  const summary = calculatePurchaseSummary(values.items);
  assert.deepEqual(summary, {totalCount: 2, totalCost: 2000, estTotalSell: 2600, estTotalProfit: 600});

  const expanded = expandPurchaseLines(values.items);
  assert.equal(expanded.length, 2);
  assert.deepEqual(expanded.map((item) => item.quantity), [1, 1]);
  assert.deepEqual(expanded.map((item) => item.tempId), ["row-1", "row-1-2"]);
});

test("purchase request quantities 1, 2 and 5 always expand to physical rows", () => {
  const values = validPurchaseValues();
  for (const quantity of [1, 2, 5]) {
    values.items[0]!.quantity = quantity;
    const expanded = expandPurchaseLines(values.items);
    assert.equal(expanded.length, quantity);
    assert.ok(expanded.every((item) => item.quantity === 1));
  }
});

test("purchase settlement keeps vendor credit separate from cash", () => {
  const settlement = calculatePurchaseSettlement(1000, 400, 200);
  assert.deepEqual(settlement, {paidAmount: 400, vendorCreditAppliedAmount: 200, unpaidAmount: 400, isPaid: false, paymentStatus: "部分付款", overpaid: false});

  const overpaid = calculatePurchaseSettlement(1000, 900, 200);
  assert.equal(overpaid.overpaid, true);
  assert.equal(overpaid.unpaidAmount, 0);
  assert.equal(overpaid.isPaid, false);
});

test("purchase schema requires a filled line and validates settlement cross-fields", () => {
  const empty = createPurchaseDefaults("测试员");
  assert.equal(purchaseOrderSchema.safeParse(empty).success, false);

  const values = validPurchaseValues();
  values.paidAmount = 100;
  values.vendorCreditAppliedAmount = 50;
  values.settlementAccountId = "ACC-1";
  assert.equal(parsePurchaseOrderValues(values, 100).success, true);

  values.settlementAccountId = "";
  assert.equal(parsePurchaseOrderValues(values, 100).success, false);
  values.settlementAccountId = "ACC-1";
  values.vendorCreditAppliedAmount = 150;
  assert.equal(parsePurchaseOrderValues(values, 100).success, false);

  values.vendorCreditAppliedAmount = 0;
  values.sourcePartnerType = "customer";
  values.paidAmount = 0;
  assert.equal(parsePurchaseOrderValues(values).success, true);
});

test("purchase source switching filters the correct partner type", () => {
  assert.equal(purchasePartnerTypeForSource("个人回收"), "customer");
  assert.equal(purchasePartnerTypeForSource("同行拿货"), "vendor");
  const options = [
    {id: "C-1", name: "张三", partnerType: "customer" as const, contact: "138", selectable: true},
    {id: "V-1", name: "同行供应商", partnerType: "vendor" as const, contact: "139", selectable: true},
  ];
  assert.deepEqual(filterPurchaseSources(options, "个人回收").map((option) => option.id), ["C-1"]);
  assert.deepEqual(filterPurchaseSources(options, "同行拿货", "供应").map((option) => option.id), ["V-1"]);
});
