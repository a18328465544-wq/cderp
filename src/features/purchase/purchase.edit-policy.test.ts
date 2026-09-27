import assert from "node:assert/strict";
import test from "node:test";
import type {PurchaseDetail} from "@/src/types/purchase";
import {derivePurchaseEditPolicy} from "./purchase.edit-policy";

function detail(overrides: Partial<PurchaseDetail> = {}): PurchaseDetail {
  return {
    invoice: {
      id: "JH-1",
      invoiceNo: "JH-1",
      date: "2026-08-08",
      sourceType: "同行拿货",
      supplierName: "供应商",
      contact: "13900000000",
      paymentMethod: "微信",
      isPaid: false,
      paidAmount: 0,
      unpaidAmount: 1000,
      handleBy: "测试员",
      items: [],
      totalCount: 0,
      totalCost: 1000,
      estTotalSell: 1200,
      estTotalProfit: 200,
    },
    inventory: [],
    payments: [],
    inspectionCount: 0,
    completedReturnCount: 0,
    paymentCount: 0,
    source: "state-snapshot",
    ...overrides,
  };
}

test("purchase edit policy opens full editing before inspection for authorized users", () => {
  const policy = derivePurchaseEditPolicy(
    detail({inventory: [{id: "KC-1", productName: "RTX 4090", sn: "", status: "待检测", warehouseLocation: "待检测区", hasInspection: false}]}),
    {canEditHistory: true, hasFullRecordAccess: true},
  );
  assert.equal(policy.mode, "full");
  assert.equal(policy.inventoryStage, "pending-inspection");
  assert.equal(policy.canEditItems, true);
  assert.equal(policy.canEditSettlement, true);
  assert.ok(policy.fields.green.includes("采购备注"));
  assert.ok(policy.fields.yellow.includes("数量"));
});

test("purchase edit policy reports completed inventory, payments and returns", () => {
  const policy = derivePurchaseEditPolicy(detail({
    inventory: [{id: "KC-1", productName: "RTX 4090", sn: "SN-1", status: "已入库", warehouseLocation: "A区", hasInspection: true}],
    inspectionCount: 1,
    paymentCount: 2,
    completedReturnCount: 1,
  }), {canEditHistory: true, hasFullRecordAccess: true});
  assert.equal(policy.mode, "limited");
  assert.equal(policy.canEditMetadata, true);
  assert.equal(policy.canEditItems, false);
  assert.equal(policy.canEditSettlement, false);
  assert.equal(policy.inventoryStage, "completed");
  assert.ok(policy.reasons.some((reason) => reason.includes("2 笔付款")));
  assert.ok(policy.reasons.some((reason) => reason.includes("完成的采购退货")));
});

test("unknown financial and return visibility blocks optimistic edit assumptions", () => {
  const policy = derivePurchaseEditPolicy(
    detail({paymentCount: null, completedReturnCount: null}),
    {canEditHistory: true, hasFullRecordAccess: true},
  );
  assert.equal(policy.mode, "limited");
  assert.ok(policy.reasons.some((reason) => reason.includes("无法读取付款流水")));
  assert.ok(policy.reasons.some((reason) => reason.includes("无法确认是否存在")));
});

test("users without historical edit permission keep a read-only purchase detail", () => {
  const policy = derivePurchaseEditPolicy(detail(), {canEditHistory: false, hasFullRecordAccess: true});
  assert.equal(policy.mode, "read-only");
  assert.equal(policy.canEditMetadata, false);
  assert.ok(policy.reasons.some((reason) => reason.includes("历史单据编辑权限")));
});
