import assert from "node:assert/strict";
import test from "node:test";
import {adaptAftersalesWorkspace, normalizeAftersalesStatus, toAftersalesCreateRequest, toAftersalesUpdateRequest} from "./aftersales.adapter";

test("aftersales adapter normalizes legacy statuses and exposes a minimal domain projection", () => {
  const result = adaptAftersalesWorkspace({data: {aftersales: [{id: "SH-1", salesInvoiceNo: "XS-1", customerName: "张三", inventoryNo: "KC-1", productName: "RTX 4090", sn: "SN-1", type: "维修", desc: "花屏", status: "处理中", repairCost: 200, createTime: "2026-08-10 10:00"}], settlementAccounts: [{id: "secret", balance: 9000}]}});
  assert.equal(result.items[0]?.status, "检测中");
  assert.equal(result.items[0]?.serialNumber, "SN-1");
  assert.equal(result.items[0]?.repairCost, 200);
  assert.equal("settlementAccounts" in result, false);
  assert.equal(normalizeAftersalesStatus("已维修"), "已完成");
});

test("aftersales candidates are linked by sold inventory and sales invoice without cost fields", () => {
  const result = adaptAftersalesWorkspace({data: {aftersales: [{id: "SH-2", salesInvoiceNo: "XS-1", customerName: "张三", inventoryNo: "KC-1", productName: "RTX 4090", sn: "SN-1", type: "检测争议", desc: "异响", status: "待处理", createTime: "2026-08-10"}], inventory: [{id: "KC-1", productName: "RTX 4090", sn: "SN-1", status: "售后中", salesInvoiceId: "XS-1", costPrice: 12000}, {id: "KC-2", productName: "RTX 4080", sn: "SN-2", status: "已入库"}], salesInvoices: [{id: "sale-id", invoiceNo: "XS-1", customerId: "KH-1", customerName: "张三", contact: "138"}]}});
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0]?.activeClaimId, "SH-2");
  assert.equal(result.candidates[0]?.customerId, "KH-1");
  assert.equal("costPrice" in (result.candidates[0] || {}), false);
});

test("aftersales request adapters preserve server field names and finance semantics", () => {
  const candidate = {inventoryId: "KC-1", productName: "RTX 4090", serialNumber: "SN-1", saleInvoiceNo: "XS-1", customerName: "张三", contact: "138"};
  const create = toAftersalesCreateRequest({candidateId: "KC-1", type: "维修", description: " 显卡花屏 "}, candidate, "郭鑫");
  assert.equal(create.sn, "SN-1"); assert.equal(create.desc, "显卡花屏"); assert.equal(create.refundAmount, 0);
  const complete = toAftersalesUpdateRequest({action: "维修完成", repairCost: 300.4, note: " 更换风扇 "}, "郭鑫");
  assert.equal(complete.status, "已完成"); assert.equal(complete.repairCost, 300); assert.equal(complete.finalResult, "维修完成：更换风扇");
  const rejected = toAftersalesUpdateRequest({action: "拒绝售后", repairCost: 0, note: " SN 不一致 "}, "郭鑫");
  assert.equal(rejected.status, "已拒绝");
  assert.equal(toAftersalesUpdateRequest({action: "拒绝售后", repairCost: 999, note: "SN 不一致"}, "郭鑫").repairCost, 0);
});
