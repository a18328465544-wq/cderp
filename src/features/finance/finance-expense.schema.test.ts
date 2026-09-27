import assert from "node:assert/strict";
import test from "node:test";
import {financeExpenseSchema} from "./finance-expense.schema";
test("expense schema requires a positive amount, party, account and date", () => {assert.equal(financeExpenseSchema.safeParse({party: "物流", accountId: "A-1", amount: 100, paymentMethod: "微信", businessType: "运费支出", referenceNo: "", date: "2026-08-11", remarks: "", images: []}).success, true); assert.equal(financeExpenseSchema.safeParse({party: "", accountId: "", amount: 0, paymentMethod: "微信", businessType: "运费支出", referenceNo: "", date: "bad", remarks: "", images: []}).success, false);});
