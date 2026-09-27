import assert from "node:assert/strict";
import test from "node:test";
import {financeTransferSchema} from "./finance-transfer.schema";

test("transfer schema enforces distinct accounts and fee boundary", () => {
  const valid = financeTransferSchema.safeParse({fromAccountId: "A", toAccountId: "B", amount: 500, fee: 5, date: "2026-08-11", remarks: ""});
  assert.equal(valid.success, true);
  assert.equal(financeTransferSchema.safeParse({...valid.success ? valid.data : {}, toAccountId: "A"}).success, false);
  assert.equal(financeTransferSchema.safeParse({...valid.success ? valid.data : {}, fee: 501}).success, false);
});
