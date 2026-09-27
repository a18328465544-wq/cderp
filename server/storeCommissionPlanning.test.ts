import assert from "node:assert/strict";
import test from "node:test";
import type {CardInventory, PurchaseInvoice, SalesInvoice} from "../src/types.ts";
import {DEFAULT_COMMISSION_RULES} from "../src/utils/commissionRules.ts";
import {createCommissionPlanningHelpers, type CommissionPlanningState} from "./storeCommissionPlanning.ts";

function makeState(): CommissionPlanningState {
  const card: CardInventory = {
    id: "INV-1",
    productId: "P-1",
    productName: "RTX 4090",
    category: "显卡",
    model: "RTX 4090",
    brand: "华硕",
    version: "猛禽",
    vram: "24G",
    sn: "SN-1",
    sourceType: "门店自采",
    supplierName: "供应商甲",
    purchaseHandler: "采购员",
    purchaseInvoiceNo: "JH-1",
    costPrice: 9000,
    estSellPrice: 11000,
    marketPrice: 10000,
    status: "已售出",
    condition: "95新",
    inWarranty: true,
    repaired: false,
    gpuRisk: false,
    fullBox: true,
    warehouseLocation: "A-01",
    entryTime: "2026-08-01",
    storageDays: 0,
  };
  const purchase = {
    id: "JH-1",
    invoiceNo: "JH-1",
    date: "2026-08-01",
    sourceType: "门店自采",
    supplierName: "供应商甲",
    contact: "",
    paymentMethod: "微信",
    isPaid: true,
    paidAmount: 9000,
    unpaidAmount: 0,
    handleBy: "采购员",
    items: [],
    totalCount: 1,
    totalCost: 9000,
    estTotalSell: 11000,
    estTotalProfit: 2000,
  } as unknown as PurchaseInvoice;
  return {
    inventory: [card],
    purchaseInvoices: [purchase],
    purchaseCommissions: [],
    commissionRules: structuredClone(DEFAULT_COMMISSION_RULES),
  };
}

test("commission planning creates one record from physical cost and prevents duplicate generation", () => {
  const state = makeState();
  let sequence = 0;
  const helpers = createCommissionPlanningHelpers({
    state,
    genId: (prefix) => `${prefix}-${++sequence}`,
    nowStamp: () => "2026-08-02 10:00",
    systemActor: () => "老板 (系统)",
  });
  const invoice = {
    invoiceNo: "XS-1",
    handleBy: "销售员",
    items: [{inventoryId: "INV-1", productId: "P-1", productName: "RTX 4090", sn: "SN-1", costPrice: 0, sellPrice: 10000}],
  } as unknown as SalesInvoice;

  const created = helpers.ensurePurchaseCommissionsForSale(invoice, "2026-08-02 10:00", "仓库员");
  assert.equal(created.length, 1);
  assert.equal(created[0]?.purchaseInvoiceNo, "JH-1");
  assert.equal(created[0]?.grossProfit, 1000);
  assert.equal(created[0]?.purchaseCommissionAmount, 100);
  assert.equal(helpers.ensurePurchaseCommissionsForSale(invoice, "2026-08-02 10:00", "仓库员").length, 0);
});

test("commission planning appends one purchase and sales adjustment for a returned card", () => {
  const state = makeState();
  state.purchaseCommissions = [{
    id: "TC-1",
    inventoryId: "INV-1",
    sn: "SN-1",
    productId: "P-1",
    productName: "RTX 4090",
    salesInvoiceNo: "XS-1",
    purchaseHandler: "采购员",
    salesHandler: "销售员",
    costPrice: 9000,
    salesPrice: 10000,
    grossProfit: 1000,
    rate: 0.1,
    commissionAmount: 100,
    purchaseRate: 0.1,
    purchaseCommissionAmount: 100,
    salesRate: 0.1,
    salesCommissionAmount: 100,
    status: "待结算",
    createdAt: "2026-08-02 10:00",
  }];
  let sequence = 0;
  const helpers = createCommissionPlanningHelpers({
    state,
    genId: (prefix) => `${prefix}-${++sequence}`,
    nowStamp: () => "2026-08-03 10:00",
    systemActor: () => "老板 (系统)",
  });

  helpers.adjustCommissionForSalesReturn("XS-1", "INV-1", "XSTH-1");
  const updated = state.purchaseCommissions[0]!;
  assert.equal(updated.purchaseStatus, "已冲销");
  assert.equal(updated.salesStatus, "已冲销");
  assert.deepEqual(updated.commissionAdjustments?.map((item) => item.amount), [-100, -100]);
  helpers.adjustCommissionForSalesReturn("XS-1", "INV-1", "XSTH-1");
  assert.equal(state.purchaseCommissions[0]?.commissionAdjustments?.length, 2);
});
