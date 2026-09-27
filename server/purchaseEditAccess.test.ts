import assert from "node:assert/strict";
import test from "node:test";
import {assertPurchaseUpdateScope, canFullyEditPurchaseRecord} from "./purchaseEditAccess.ts";

const full = {
  allowedMenus: ["purchase_add", "payment_out", "return_purchase"],
  showCost: true,
  showProfit: true,
};

test("purchase full editing requires every sensitive visibility boundary", () => {
  assert.equal(canFullyEditPurchaseRecord(full), true);
  assert.equal(canFullyEditPurchaseRecord({...full, showCost: false}), false);
  assert.equal(canFullyEditPurchaseRecord({...full, allowedMenus: ["purchase_add", "payment_out"]}), false);
});

test("restricted purchase editors can update metadata but cannot submit hidden business fields", () => {
  const restricted = {...full, showProfit: false};
  assert.doesNotThrow(() => assertPurchaseUpdateScope(restricted, {expressNo: "SF123", remarks: "补充"}));
  assert.throws(() => assertPurchaseUpdateScope(restricted, {paidAmount: 1}), /只能修改采购快递单号和采购备注/);
});
