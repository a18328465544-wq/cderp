import assert from "node:assert/strict";
import test from "node:test";
import {toPaymentInRequest, toPaymentOutRequest} from "./finance-settlements";

const values = {accountId: "ACC-1", amount: 320, paymentMethod: "现金", date: "2026-09-20", referenceNo: "  RCPT-1 ", remarks: "  补录  "};

test("linked settlement request keeps the original document reference", () => {
  const request = toPaymentInRequest(values, {kind: "income", relatedDocType: "销售单", relatedDocNo: "XS-1", partyName: "客户甲", partyId: "KH-1", partnerType: "customer", remainingAmount: 320}, "经办人");
  assert.deepEqual(request, {
    customerId: "KH-1",
    customerPartnerType: "customer",
    customerName: "客户甲",
    accountId: "ACC-1",
    amount: 320,
    handler: "经办人",
    paymentMethod: "现金",
    businessType: "销售收款",
    relatedDocType: "销售单",
    relatedDocNo: "XS-1",
    referenceNo: "RCPT-1",
    time: "2026-09-20 12:00:00",
    remarks: "补录",
  });
});

test("purchase follow-up payment identifies vendor and keeps the purchase reference", () => {
  const request = toPaymentOutRequest(values, {kind: "expense", relatedDocType: "采购单", relatedDocNo: "JH-1", partyName: "供应商乙", partyId: "GY-1", partnerType: "vendor", remainingAmount: 320}, "经办人");
  assert.equal(request.supplierId, "GY-1");
  assert.equal(request.supplierName, "供应商乙");
  assert.equal(request.businessType, "采购付款");
  assert.equal(request.relatedDocNo, "JH-1");
});

test("personal purchase follow-up payment keeps the counterparty on the customer side", () => {
  const request = toPaymentOutRequest(values, {kind: "expense", relatedDocType: "采购单", relatedDocNo: "JH-2", partyName: "个人回收方", partyId: "KH-2", partnerType: "customer", remainingAmount: 320}, "经办人");
  assert.equal(request.supplierId, undefined);
  assert.equal(request.supplierName, undefined);
  assert.equal(request.customerId, "KH-2");
  assert.equal(request.customerName, "个人回收方");
  assert.equal(request.relatedDocNo, "JH-2");
});
