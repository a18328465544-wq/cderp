import assert from "node:assert/strict";
import test from "node:test";
import {adaptPurchaseReturnList, adaptSalesReturnComplete, adaptSalesReturnList, adaptSalesReturnMutation, toPurchaseReturnRequestDto, toSalesReturnUpdateRequestDto} from "./returns.adapter";
import type {PurchaseReturnFormValues} from "@/src/types/returns";

test("sales return adapter maps the paginated API envelope into domain items", () => {
  const result = adaptSalesReturnList({data: {data: [{
    id: "RET-1",
    returnNo: "TH-20260809-001",
    type: "销售退货",
    status: "待处理",
    date: "2026-08-09",
    relatedDocNo: "XS-20260808-001",
    productName: "RTX 4090 24G",
    sn: "SN-4090",
    partyName: "张先生",
    amount: 18000,
    settlementMode: "原路退款",
    inventoryAction: "退回待检测",
  }], meta: {page: 2, pageSize: 20, total: 23}}});
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.returnNo, "TH-20260809-001");
  assert.equal(result.items[0]?.amount, 18000);
  assert.deepEqual(result.meta, {page: 2, pageSize: 20, total: 23, totalPages: 2});
});

test("sales return adapter never leaks purchase return rows into the feature", () => {
  const result = adaptSalesReturnList({data: {data: [
    {id: "S-1", type: "销售退货", status: "已完成"},
    {id: "P-1", type: "进货退货", status: "待处理"},
  ], meta: {page: 1, pageSize: 20, total: 1}}});
  assert.deepEqual(result.items.map((item) => item.id), ["S-1"]);
});

test("return adapter keeps nested inventory references for batch detail lookup", () => {
  const result = adaptSalesReturnList({data: {data: [{id: "RET-BATCH", returnNo: "TH-BATCH", type: "销售退货", batchMode: "多件退货", items: [{sourceInventoryId: "KC-1", productName: "RTX 4090", sn: "SN-1", amount: 10000}, {sourceInventoryId: "KC-2", productName: "RTX 4080", sn: "SN-2", amount: 8000}]}], meta: {page: 1, pageSize: 20, total: 1}}});
  assert.equal(result.items[0]?.sourceInventoryId, "KC-1");
  assert.deepEqual(result.items[0]?.sourceInventoryIds, ["KC-1", "KC-2"]);
  assert.equal(result.items[0]?.batchMode, "多件退货");
  assert.deepEqual(result.items[0]?.returnItems?.map((item) => [item.sourceInventoryId, item.productName, item.sn, item.amount]), [["KC-1", "RTX 4090", "SN-1", 10000], ["KC-2", "RTX 4080", "SN-2", 8000]]);
});

test("return adapter infers a batch marker when legacy rows only contain multiple nested items", () => {
  const result = adaptPurchaseReturnList({data: {data: [{id: "RET-LEGACY-BATCH", returnNo: "JTH-BATCH", type: "进货退货", items: [{sourceInventoryId: "KC-1", productName: "RTX 4090"}, {sourceInventoryId: "KC-2", productName: "RTX 4080"}]}], meta: {page: 1, pageSize: 20, total: 1}}});
  assert.equal(result.items[0]?.batchMode, "多件退货");
  assert.equal(result.items[0]?.productName, "RTX 4090");
  assert.equal(result.items[0]?.returnItems?.length, 2);
});

test("sales return completion response is projected without state patches", () => {
  assert.deepEqual(adaptSalesReturnComplete({id: "RET-1", returnNo: "TH-1", status: "已完成", completedAt: "2026-08-09 12:00", stateMerge: {inventory: []}}), {
    id: "RET-1",
    returnNo: "TH-1",
    status: "已完成",
    completedAt: "2026-08-09 12:00",
  });
});

test("purchase return list preserves authoritative settlement effects", () => {
  const result = adaptPurchaseReturnList({data: {data: [{id: "PR-1", returnNo: "JTH-1", type: "进货退货", status: "已完成", amount: 5000, settlementMode: "抵扣账款", creditAmount: 1000, vendorCreditAmount: 4000, cashReleasedAmount: 3000}], meta: {page: 1, pageSize: 20, total: 1}}});
  assert.equal(result.items[0]?.type, "进货退货");
  assert.equal(result.items[0]?.creditAmount, 1000);
  assert.equal(result.items[0]?.vendorCreditAmount, 4000);
  assert.equal(result.items[0]?.cashReleasedAmount, 3000);
});

test("purchase return request adapter emits only the existing backend contract", () => {
  assert.deepEqual(toPurchaseReturnRequestDto({date: "2026-08-09", relatedDocNo: " JH-1 ", sourceInventoryId: " KC-1 ", amount: 5000, settlementMode: "原路退款", settlementAccountId: " ACC-1 ", handler: " 郭鑫 ", reason: " 型号不符 ", inventoryAction: "退回供应商", remarks: " 原包装 "}), {
    type: "进货退货",
    relatedDocType: "采购单",
    date: "2026-08-09",
    relatedDocNo: "JH-1",
    sourceInventoryId: "KC-1",
    amount: 5000,
    settlementMode: "原路退款",
    settlementAccountId: "ACC-1",
    handler: "郭鑫",
    reason: "型号不符",
    inventoryAction: "退回供应商",
    remarks: "原包装",
  });
});

test("purchase return request adapter serializes whole-document lines without leaking draft-only fields", () => {
  const values: PurchaseReturnFormValues = {
    date: "2026-08-09",
    relatedDocNo: "JH-BATCH-1",
    sourceInventoryId: "",
    amount: 5000,
    settlementMode: "抵扣账款",
    settlementAccountId: "",
    handler: "郭鑫",
    reason: "整单退货",
    inventoryAction: "退回供应商",
    remarks: "",
    returnScope: "document",
    returnItems: [
      {sourceInventoryId: "KC-1", sourcePurchaseItemIndex: 0},
      {sourceInventoryId: "KC-2", sourcePurchaseItemIndex: 1},
    ],
  };
  assert.deepEqual(toPurchaseReturnRequestDto(values), {
    type: "进货退货",
    relatedDocType: "采购单",
    date: "2026-08-09",
    relatedDocNo: "JH-BATCH-1",
    sourceInventoryId: "",
    amount: 5000,
    settlementMode: "抵扣账款",
    settlementAccountId: undefined,
    handler: "郭鑫",
    reason: "整单退货",
    inventoryAction: "退回供应商",
    remarks: undefined,
    batchMode: "整单退货",
    items: [
      {sourceInventoryId: "KC-1", sourcePurchaseItemIndex: 0},
      {sourceInventoryId: "KC-2", sourcePurchaseItemIndex: 1},
    ],
  });
});

test("purchase return request adapter serializes selected multi-item lines distinctly from whole-document returns", () => {
  const values: PurchaseReturnFormValues = {
    date: "2026-08-09",
    relatedDocNo: "JH-MULTIPLE-1",
    sourceInventoryId: "KC-1",
    amount: 8000,
    settlementMode: "抵扣账款",
    settlementAccountId: "",
    handler: "郭鑫",
    reason: "部分商品退回",
    inventoryAction: "退回供应商",
    remarks: "只退选中的两件",
    returnScope: "multiple",
    returnItems: [
      {sourceInventoryId: "KC-1", sourcePurchaseItemIndex: 0},
      {sourceInventoryId: "KC-3", sourcePurchaseItemIndex: 2},
    ],
  };

  assert.deepEqual(toPurchaseReturnRequestDto(values), {
    type: "进货退货",
    relatedDocType: "采购单",
    date: "2026-08-09",
    relatedDocNo: "JH-MULTIPLE-1",
    sourceInventoryId: "KC-1",
    amount: 8000,
    settlementMode: "抵扣账款",
    settlementAccountId: undefined,
    handler: "郭鑫",
    reason: "部分商品退回",
    inventoryAction: "退回供应商",
    remarks: "只退选中的两件",
    batchMode: "多件退货",
    items: [
      {sourceInventoryId: "KC-1", sourcePurchaseItemIndex: 0},
      {sourceInventoryId: "KC-3", sourcePurchaseItemIndex: 2},
    ],
  });
});

test("sales return update adapter only sends editable history fields", () => {
  assert.deepEqual(toSalesReturnUpdateRequestDto({handler: " 郭鑫 ", reason: " 客户拒收 ", remarks: " 外包装完整 ",}), {
    handler: "郭鑫",
    reason: "客户拒收",
    remarks: "外包装完整",
  });
});

test("sales return mutation adapter unwraps the returned record and ignores state patches", () => {
  const result = adaptSalesReturnMutation({data: {id: "RET-1", returnNo: "XSTH-1", type: "销售退货", status: "待处理", amount: 1000}, stateMerge: {salesInvoices: [{id: "XS-1"}]}});
  assert.equal(result?.id, "RET-1");
  assert.equal(result?.returnNo, "XSTH-1");
  assert.equal(result?.amount, 1000);
  assert.equal("stateMerge" in (result || {}), false);
});
