import assert from "node:assert/strict";
import test from "node:test";
import {calculatePurchaseReturnPreview, canDirectWriteOffPurchase} from "./purchase-return.calculations";

test("purchase return settlement releases payable then vendor credit then cash", () => {
  assert.deepEqual(calculatePurchaseReturnPreview({totalCost: 10000, paidAmount: 5000, unpaidAmount: 3000, vendorCreditAppliedAmount: 2000, returnAmount: 7000, settlementMode: "抵扣账款"}), {
    resultingTotal: 3000,
    cashRefundAmount: 2000,
    payableOffset: 3000,
    releasedVendorCredit: 2000,
    vendorCreditIncrease: 4000,
    paidAfter: 3000,
    unpaidAfter: 0,
  });
});

test("direct write-off only allows one exact cash payment for a full return", () => {
  assert.equal(canDirectWriteOffPurchase({totalCost: 5000, returnAmount: 5000, paidAmount: 5000, vendorCreditAppliedAmount: 0, linkedPayments: [{amount: 5000, businessType: "采购付款"}]}), true);
  assert.equal(canDirectWriteOffPurchase({totalCost: 5000, returnAmount: 2000, paidAmount: 5000, vendorCreditAppliedAmount: 0, linkedPayments: [{amount: 5000, businessType: "采购付款"}]}), false);
  assert.equal(canDirectWriteOffPurchase({totalCost: 5000, returnAmount: 5000, paidAmount: 5000, vendorCreditAppliedAmount: 100, linkedPayments: [{amount: 5000, businessType: "采购付款"}]}), false);
});
