import assert from "node:assert/strict";
import test from "node:test";
import {financeIncomeSchema} from "./finance-income.schema";

test("income schema requires a positive amount, source, account and valid date", () => {
  assert.equal(financeIncomeSchema.safeParse({source: "平台", accountId: "A-1", amount: 100, paymentMethod: "微信", businessType: "返点收入", referenceNo: "", date: "2026-08-11", remarks: "", images: []}).success, true);
  assert.equal(financeIncomeSchema.safeParse({source: "", accountId: "", amount: 0, paymentMethod: "微信", businessType: "返点收入", referenceNo: "", date: "bad", remarks: "", images: []}).success, false);
});
