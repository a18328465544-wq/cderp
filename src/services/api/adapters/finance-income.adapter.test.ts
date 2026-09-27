import assert from "node:assert/strict";
import test from "node:test";
import {adaptFinanceIncomeCollection, adaptFinanceIncomeSnapshot, isNonOperatingIncomeDto, toFinanceIncomeRequest} from "./finance-income.adapter";

test("non-operating adapter excludes sales receipts and keeps standalone income", () => {
  assert.equal(isNonOperatingIncomeDto({businessType: "销售收款"}), false);
  assert.equal(isNonOperatingIncomeDto({relatedDocType: "销售单", businessType: "其他收入"}), false);
  assert.equal(isNonOperatingIncomeDto({relatedDocNo: "XS-1", businessType: "其他收入"}), false);
  assert.equal(isNonOperatingIncomeDto({businessType: "采购退款"}), false);
  assert.equal(isNonOperatingIncomeDto({relatedDocType: "采购单", businessType: "其他收入"}), false);
  assert.equal(isNonOperatingIncomeDto({relatedDocType: "退货单", businessType: "其他收入"}), false);
  assert.equal(isNonOperatingIncomeDto({relatedDocNo: "JHTH-1", businessType: "其他收入"}), false);
  assert.equal(isNonOperatingIncomeDto({businessType: "返点收入"}), true);
  const rows = adaptFinanceIncomeSnapshot({data: {paymentInRecords: [{id: "I-1", customerName: "平台", accountId: "A-1", accountName: "微信", amount: 100, handler: "郭鑫", paymentMethod: "微信", businessType: "返点收入", time: "2026-08-11 10:00:00"}, {id: "I-VOID", customerName: "平台", accountId: "A-1", accountName: "微信", amount: 999, handler: "郭鑫", paymentMethod: "微信", businessType: "返点收入", accountingStatus: "作废", time: "2026-08-11"}, {id: "S-1", businessType: "销售收款", time: "2026-08-11"}]}});
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.source, "平台");
});

test("paged income responses keep purchase refunds out even if an older server leaks them", () => {
  const page = adaptFinanceIncomeCollection({
    data: [
      {id: "R-1", supplierName: "供应商", accountId: "A-1", accountName: "微信", amount: 1000, handler: "财务", paymentMethod: "微信", businessType: "采购退款", relatedDocType: "退货单", relatedDocNo: "JHTH-1", time: "2026-08-02"},
      {id: "I-1", customerName: "平台", accountId: "A-1", accountName: "微信", amount: 80, handler: "财务", paymentMethod: "微信", businessType: "返点收入", time: "2026-08-01"},
    ],
    meta: {page: 1, pageSize: 20, total: 2, totalAmount: 1080},
  }, {keyword: "", businessType: "all", accountId: "all", handler: "", startDate: "", endDate: "", page: 1, pageSize: 20});
  assert.deepEqual(page.items.map((item) => item.id), ["I-1"]);
  assert.equal(page.total, 2);
});

test("filters and paginates the authorized snapshot honestly", () => {
  const page = adaptFinanceIncomeCollection({data: {paymentInRecords: [{id: "I-2", customerName: "物流", accountId: "A-1", accountName: "现金", amount: 30, handler: "甲", paymentMethod: "现金", businessType: "赔偿收入", time: "2026-08-02"}, {id: "I-1", customerName: "平台", accountId: "A-2", accountName: "微信", amount: 100, handler: "乙", paymentMethod: "微信", businessType: "返点收入", time: "2026-08-01"}]}}, {keyword: "平台", businessType: "all", accountId: "all", handler: "", startDate: "", endDate: "", page: 1, pageSize: 20});
  assert.equal(page.total, 1);
  assert.equal(page.totalAmount, 100);
  assert.equal(page.items[0]?.id, "I-1");
  assert.equal(page.source, "authorized-full-state");
});

test("request never emits ERP related document fields or unsafe images", () => {
  const request = toFinanceIncomeRequest({source: " 平台 ", accountId: "A-1", amount: 120.5, paymentMethod: "微信", businessType: "返点收入", referenceNo: " REF-1 ", date: "2026-08-11", remarks: " 说明 ", images: ["/api/media/assets/IMG-1", "data:image/jpeg;base64,bad"]}, "郭鑫");
  assert.deepEqual(request, {customerName: "平台", accountId: "A-1", amount: 120.5, handler: "郭鑫", paymentMethod: "微信", businessType: "返点收入", referenceNo: "REF-1", time: "2026-08-11 12:00:00", images: ["/api/media/assets/IMG-1"], remarks: "说明"});
  assert.equal("relatedDocNo" in request, false);
});
