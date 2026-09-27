import assert from "node:assert/strict";
import test from "node:test";
import {adaptVendorDirectory, toVendorCreateRequest, toVendorUpdateRequest} from "./vendor.adapter";

const values = {name: " 成都同行 ", contact: " 13800000000 ", type: "上游供应商" as const, level: "C级" as const, isCoreCustomer: false, riskReason: "", remarks: " 主营 4090 "};

test("vendor directory adapter exposes only the domain projection and masks profit", () => {
  const result = adaptVendorDirectory({data: {vendors: [{id: "GY-1", name: "成都同行", phone: "138", type: "卖货同行", level: "A级", totalBuyAmount: 3000, avgProfit: 600, accountPayable: 100, accountReceivable: 20, returnCreditBalance: 30}], purchaseInvoices: [{supplierName: "不得透传"}]}}, {showProfit: false});
  assert.equal(result.vendors.length, 1);
  assert.equal(result.vendors[0]?.type, "下游采购方");
  assert.equal(result.vendors[0]?.averageProfit, undefined);
  assert.equal(result.vendors[0]?.payableBalance, 100);
  assert.equal(result.vendors[0]?.receivableBalance, 20);
  assert.equal(result.vendors[0]?.returnCreditBalance, 30);
  assert.equal("purchaseInvoices" in result, false);
});

test("core vendor is always projected and submitted as S level", () => {
  const result = adaptVendorDirectory({data: {vendors: [{id: "GY-2", name: "核心", type: "核心采购方", level: "C级"}]}}, {showProfit: true});
  assert.equal(result.vendors[0]?.isCoreCustomer, true);
  assert.equal(result.vendors[0]?.level, "S级");
  const request = toVendorCreateRequest({...values, type: "核心采购方", level: "C级"});
  assert.equal(request.isCoreCustomer, true);
  assert.equal(request.level, "S级");
});

test("create and update adapters preserve vendor contact and partner semantics", () => {
  const create = toVendorCreateRequest(values);
  const update = toVendorUpdateRequest(values);
  assert.equal(create.name, "成都同行");
  assert.equal(create.contact, "13800000000");
  assert.equal(create.partnerCategory, "同行");
  assert.equal(create.phone, undefined);
  assert.equal(update.phone, "13800000000");
  assert.equal(update.contactPerson, "成都同行");
});
