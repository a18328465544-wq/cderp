import assert from "node:assert/strict";
import test from "node:test";
import type {SalesListItem} from "@/src/types/sales";
import {deriveSalesEditPolicy} from "./sales.edit-policy";

function item(overrides: Partial<SalesListItem> = {}): SalesListItem {
  return {
    id: "S-1",
    invoiceNo: "XS-1",
    date: "2026-09-12",
    customerName: "客户",
    contact: "13800000000",
    channel: "微信私域",
    paymentMethod: "微信",
    paymentStatus: "已收款",
    outboundStatus: "待出库",
    outboundTime: "",
    outboundHandler: "",
    totalCount: 1,
    totalAmount: 1000,
    paidAmount: 1000,
    unpaidAmount: 0,
    linkedInventoryCount: 0,
    needInvoice: false,
    freeShipping: false,
    expressCompany: "",
    expressNo: "",
    aftersalesTerms: "店保三个月",
    handleBy: "销售",
    remarks: "",
    productSummary: "RTX",
    searchText: "xs-1 客户 rtx",
    lines: [],
    ...overrides,
  };
}

test("pending sales invoice allows full edit for authorized users", () => {
  const policy = deriveSalesEditPolicy(item(), {canEditHistory: true, hasFullRecordAccess: true});
  assert.equal(policy.mode, "full");
  assert.equal(policy.canEditItems, true);
  assert.equal(policy.canEditSettlement, true);
  assert.ok(policy.fields.yellow.includes("销售价"));
});

test("outbound sales invoice keeps metadata-only edit", () => {
  const policy = deriveSalesEditPolicy(item({outboundStatus: "已出库", linkedInventoryCount: 1}), {canEditHistory: true, hasFullRecordAccess: true});
  assert.equal(policy.mode, "limited");
  assert.equal(policy.canEditItems, false);
  assert.equal(policy.canEditMetadata, true);
});

test("users without history permission stay read-only", () => {
  const policy = deriveSalesEditPolicy(item(), {canEditHistory: false, hasFullRecordAccess: true});
  assert.equal(policy.mode, "read-only");
  assert.equal(policy.canEditMetadata, false);
});
