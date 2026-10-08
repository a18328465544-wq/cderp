import test from "node:test";
import assert from "node:assert/strict";
import type {FinanceAccountItem} from "@/src/types/finance-account";
import type {LinkedSettlementContext} from "@/src/types/finance-settlement";
import {outstandingSettlementAmount, outstandingSettlementContextKey, outstandingSettlementDefaults, outstandingSettlementSchema} from "./outstandingSettlement";

const context: LinkedSettlementContext = {kind: "income", relatedDocType: "销售单", relatedDocNo: "XS-TEST", partyName: "测试客户", remainingAmount: 100};
const account: FinanceAccountItem = {id: "A-TEST", name: "测试账户", type: "现金", owner: "测试员", platform: "", balance: 0, availableBalance: 0, frozenAmount: 0, enabled: true, allowNegative: false};
const values = {...outstandingSettlementDefaults(context, [account]), accountId: account.id};

test("settlement requires a currently enabled account and does not silently pick the first account", () => {
  assert.equal(outstandingSettlementDefaults(context, [account]).accountId, "");
  assert.equal(outstandingSettlementDefaults({...context, defaultAccountId: account.id}, [account]).accountId, account.id);
  assert.equal(outstandingSettlementDefaults({...context, defaultAccountId: account.id}, [{...account, enabled: false}]).accountId, "");
  const schema = outstandingSettlementSchema(context, [account]);
  assert.equal(schema.safeParse({...values, accountId: ""}).success, false);
  assert.equal(schema.safeParse({...values, accountId: "missing"}).success, false);
  assert.equal(outstandingSettlementSchema(context, [{...account, enabled: false}]).safeParse(values).success, false);
});

test("settlement validates partial and full amounts without allowing zero, overpayment or non-finite numbers", () => {
  const schema = outstandingSettlementSchema(context, [account]);
  for (const amount of [0, -1, 100.01, NaN, Infinity]) assert.equal(schema.safeParse({...values, amount}).success, false);
  for (const amount of [0.01, 50, 100]) assert.equal(schema.safeParse({...values, amount}).success, true);
  assert.equal(outstandingSettlementAmount(null), 0);
  assert.equal(outstandingSettlementAmount({...context, remainingAmount: Infinity}), 0);
});

test("settlement draft identity survives refetch but changes with the actual source document", () => {
  const key = outstandingSettlementContextKey(context);
  assert.equal(key, outstandingSettlementContextKey({...context, remainingAmount: 80, partyName: "更新名称"}));
  assert.notEqual(key, outstandingSettlementContextKey({...context, relatedDocNo: "XS-OTHER"}));
  assert.notEqual(key, outstandingSettlementContextKey({...context, kind: "expense", relatedDocType: "采购单"}));
  assert.equal(outstandingSettlementContextKey(null), null);
});

test("settlement rejects invalid methods, dates and oversized notes", () => {
  for (const kind of ["income", "expense"] as const) {
    const schema = outstandingSettlementSchema({...context, kind}, [account]);
    assert.equal(schema.safeParse(values).success, true);
    assert.equal(schema.safeParse({...values, paymentMethod: "未知方式"}).success, false);
    assert.equal(schema.safeParse({...values, date: "invalid"}).success, false);
    assert.equal(schema.safeParse({...values, referenceNo: "x".repeat(121)}).success, false);
    assert.equal(schema.safeParse({...values, remarks: "x".repeat(501)}).success, false);
  }
});
