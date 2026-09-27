import assert from "node:assert/strict";
import test from "node:test";
import type {PurchaseCommissionRecord} from "../src/types.ts";
import {
  appendCommissionAdjustment,
  commissionAdjustmentAmount,
  commissionStatus,
  effectiveCommissionAmount,
  projectCommissionRecord,
  sanitizeCommissionRecord,
} from "./commissionRecords.ts";

function sampleRecord(): PurchaseCommissionRecord {
  return {
    id: "TC-001",
    inventoryId: "INV-001",
    sn: "SN-001",
    productId: "P-001",
    productName: "RTX 5090",
    purchaseInvoiceNo: "JH-001",
    salesInvoiceNo: "XS-001",
    purchaseHandler: "采购小王",
    salesHandler: "销售小李",
    costPrice: 18000,
    salesPrice: 22000,
    grossProfit: 4000,
    rate: 0.1,
    commissionAmount: 400,
    purchaseRate: 0.02,
    purchaseCommissionAmount: 360,
    salesRate: 0.1,
    salesCommissionAmount: 400,
    purchaseCalculationMethod: "fixed",
    salesCalculationMethod: "fixed",
    status: "待结算",
    createdAt: "2026-08-24 10:00:00",
  };
}

test("commission projections isolate the selected role and financial permission", () => {
  const record = sampleRecord();
  const purchase = projectCommissionRecord(record, "purchase", {
    allowedMenus: ["purchase_commission"],
    showCost: true,
    showProfit: true,
  });
  const purchaseVisible = purchase as Record<string, unknown>;
  assert.equal(purchase.handler, "采购小王");
  assert.equal(purchase.documentNo, "JH-001");
  assert.equal(purchaseVisible.commissionAmount, 360);
  assert.equal("salesHandler" in purchaseVisible, false);
  assert.equal("salesCommissionAmount" in purchaseVisible, false);

  const limited = projectCommissionRecord(record, "sales", {
    allowedMenus: ["sales_commission"],
    showCost: false,
    showProfit: false,
  });
  assert.equal(limited.handler, "销售小李");
  assert.equal("commissionAmount" in limited, false);
  assert.equal("grossProfit" in limited, false);
  assert.equal("purchaseHandler" in limited, false);
});

test("commission adjustments are append-only and calculate effective amount", () => {
  const original = sampleRecord();
  const adjusted = appendCommissionAdjustment(original, {
    id: "TCA-001",
    mode: "sales",
    amount: -400,
    reason: "销售退货",
    documentNo: "XSTH-001",
    createdAt: "2026-08-24 11:00:00",
    createdBy: "老板",
  });
  assert.equal(original.salesCommissionAmount, 400);
  assert.equal(adjusted.salesCommissionAmount, 400);
  assert.equal(commissionAdjustmentAmount(adjusted, "sales"), -400);
  assert.equal(effectiveCommissionAmount(adjusted, "sales"), 0);
  assert.equal(commissionStatus(adjusted, "sales"), "已冲销");

  const duplicate = appendCommissionAdjustment(adjusted, {
    id: "TCA-002",
    mode: "sales",
    amount: -400,
    reason: "销售退货",
    documentNo: "XSTH-001",
    createdAt: "2026-08-24 11:01:00",
    createdBy: "老板",
  });
  assert.equal(duplicate.commissionAdjustments?.length, 1);
});

test("legacy state projection redacts unavailable commission sides instead of sending zeros", () => {
  const record = sampleRecord();
  const scoped = sanitizeCommissionRecord(record, {
    allowedMenus: ["sales_commission"],
    showCost: false,
    showProfit: false,
  });
  assert.equal("purchaseHandler" in scoped, false);
  assert.equal("salesHandler" in scoped, true);
  assert.equal("commissionAmount" in scoped, false);
  assert.equal("costPrice" in scoped, false);
});

test("legacy projection never exposes adjustment amounts without profit permission", () => {
  const record = appendCommissionAdjustment(sampleRecord(), {
    id: "TCA-002",
    mode: "sales",
    amount: -400,
    reason: "销售退货",
    documentNo: "XSTH-002",
    createdAt: "2026-08-24 12:00:00",
    createdBy: "系统",
  });
  const scoped = sanitizeCommissionRecord(record, {
    allowedMenus: ["sales_commission"],
    showCost: false,
    showProfit: false,
  });
  assert.equal("commissionAdjustments" in scoped, false);
});

test("sales-only legacy projection maps generic fields to the sales role", () => {
  const record = {...sampleRecord(), commissionAmount: 360, rate: 0.02};
  const scoped = sanitizeCommissionRecord(record, {
    allowedMenus: ["sales_commission"],
    showCost: false,
    showProfit: true,
  });
  assert.equal(scoped.commissionAmount, 400);
  assert.equal(scoped.rate, 0.1);
  assert.equal("purchaseCommissionAmount" in scoped, false);
  assert.equal("purchaseHandler" in scoped, false);
});
