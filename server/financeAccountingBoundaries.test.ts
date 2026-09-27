import assert from "node:assert/strict";
import test from "node:test";
import {assertAccountingMovementBoundary} from "./financeAccountingBoundaries.ts";

test("business documents cannot create non-operating money movements", () => {
  assert.throws(
    () => assertAccountingMovementBoundary({businessType: "其他收入", relatedDocType: "退货单", signedAmount: 100}),
    /非经营收支不能绑定业务单据/,
  );
  assert.throws(
    () => assertAccountingMovementBoundary({businessType: "采购付款", relatedDocType: "退货单", direction: "收入", amount: 100}),
    /退货单资金流水必须使用采购退款或客户退款类型/,
  );
});

test("return refund classification enforces direction and signed amount", () => {
  assert.doesNotThrow(() => assertAccountingMovementBoundary({businessType: "采购退款", relatedDocType: "退货单", direction: "收入", amount: 100, signedAmount: 100}));
  assert.doesNotThrow(() => assertAccountingMovementBoundary({businessType: "客户退款", relatedDocType: "退货单", direction: "支出", amount: 100, signedAmount: -100}));
  assert.throws(
    () => assertAccountingMovementBoundary({businessType: "客户退款", relatedDocType: "退货单", direction: "收入", amount: 100, signedAmount: 100}),
    /销售退货只能生成支出方向|客户退款的财务流水必须为负数/,
  );
});

test("after-sales refund and repair movements stay in the after-sales boundary", () => {
  assert.doesNotThrow(() => assertAccountingMovementBoundary({businessType: "客户退款", relatedDocType: "售后单", direction: "支出", amount: 100, signedAmount: -100}));
  assert.doesNotThrow(() => assertAccountingMovementBoundary({businessType: "维修费", relatedDocType: "售后单", direction: "支出", amount: 120, signedAmount: -120}));
  assert.throws(
    () => assertAccountingMovementBoundary({businessType: "其他支出", relatedDocType: "售后单", direction: "支出", amount: 100, signedAmount: -100}),
    /非经营收支不能绑定业务单据/,
  );
  assert.throws(
    () => assertAccountingMovementBoundary({businessType: "维修费", relatedDocType: "售后单", direction: "收入", amount: 100, signedAmount: 100}),
    /售后单资金流水必须为支出方向|售后单资金流水必须为负数/,
  );
});
