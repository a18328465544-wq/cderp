import assert from "node:assert/strict";
import test from "node:test";
import {adaptProductLedgerPage} from "./product-ledger.adapter";

test("product ledger adapter normalizes rows and protects cost fields", () => {
  const page = adaptProductLedgerPage({data: {rows: [
    {id: "P-1", documentType: "采购入库", documentNo: "JH-1", quantity: 2, unitPrice: 18000, amount: 36000, operationType: "增加", operatedAt: "2026-08-01T10:00:00", supplierName: "供货商", createdBy: "张三"},
    {id: "S-1", documentType: "销售出库", documentNo: "XS-1", quantity: -1, unitPrice: 20000, amount: -20000, operationType: "减少", operatedAt: "2026-08-02T10:00:00", customerName: "客户", createdBy: "李四"},
    {id: "X-1", documentType: "未知", documentNo: "X-1", quantity: "bad", operationType: "未来状态"},
  ], total: 3, page: 1, pageSize: 20, totalPages: 1}}, {showCost: false});

  assert.equal(page.total, 3);
  assert.equal(page.rows[0]?.unitPrice, undefined);
  assert.equal(page.rows[0]?.amount, undefined);
  assert.equal(page.rows[1]?.amount, -20000);
  assert.equal(page.rows[1]?.operationType, "减少");
  assert.equal(page.rows[2]?.operationType, "调整");
  assert.equal(page.rows[2]?.quantity, 0);
});

test("product ledger adapter keeps cost fields when the account is authorized", () => {
  const page = adaptProductLedgerPage({data: {rows: [{id: "P-1", documentType: "采购入库", documentNo: "JH-1", quantity: 1, unitPrice: 18000, amount: 18000}]}}, {showCost: true});
  assert.equal(page.rows[0]?.unitPrice, 18000);
  assert.equal(page.rows[0]?.amount, 18000);
});
