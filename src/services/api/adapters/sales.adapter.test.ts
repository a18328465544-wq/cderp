import assert from "node:assert/strict";
import test from "node:test";
import {adaptSalesCustomer, adaptSalesCustomers, adaptSalesInventoryCandidate, adaptSalesProductCandidate, toCreateSalesRequest} from "./sales.adapter";
import {createSalesDefaults} from "@/src/features/sales/sales.defaults";

test("sales customer adapter uses legacy archive id and blocks unmapped主体", () => {
  const mapped = adaptSalesCustomer({id: "CRM-1", displayName: "张三", primaryPhone: "13800000000", legacyCustomer: {id: "KH-1", name: "张三", phone: "13800000000", level: "A级"}});
  assert.equal(mapped.id, "KH-1");
  assert.equal(mapped.selectable, true);
  assert.equal(mapped.level, "A级");
  const unmapped = adaptSalesCustomer({id: "CRM-2", displayName: "未映射主体"});
  assert.equal(unmapped.selectable, false);
});

test("sales customer adapter accepts normalized CRM page envelope", () => {
  const customers = adaptSalesCustomers({data: {items: [{id: "CRM-1", displayName: "张三", legacyCustomer: {id: "KH-1", name: "张三"}}]}});
  assert.equal(customers.length, 1);
  assert.equal(customers[0]?.id, "KH-1");
});

test("sales customer adapter prefers the customer role for a dual-role主体", () => {
  const customer = adaptSalesCustomer({
    id: "CRM-CORE-1",
    displayName: "核心合作伙伴",
    roles: ["buyer", "customer", "peer", "supplier"],
    legacyCustomer: {id: "KH-CORE-1", name: "核心合作伙伴", type: "购买客户", level: "S级"},
    legacyVendor: {id: "GY-CORE-1", name: "核心合作伙伴", type: "核心采购方", level: "S级"},
  });
  assert.equal(customer.partnerType, "customer");
  assert.equal(customer.id, "KH-CORE-1");
  assert.equal(customer.type, "购买客户");
  assert.equal(customer.selectable, true);
});

test("sales inventory adapter hides cost without permission and gates saleable statuses", () => {
  const available = adaptSalesInventoryCandidate({id: "KC-1", productId: "P-1", productName: "RTX 4090", brand: "华硕", model: "4090", status: "已上架", sn: "SN-1", costPrice: 100, estSellPrice: 200}, {showCost: false, showProfit: false});
  assert.equal(available.saleable, true);
  assert.equal(available.costPrice, undefined);
  const locked = adaptSalesInventoryCandidate({id: "KC-2", productId: "P-1", productName: "RTX 4090", status: "已锁定", sn: "SN-2"}, {showCost: true, showProfit: true});
  assert.equal(locked.saleable, false);
});

test("sales product candidate adapter keeps product quantity and reference sell price", () => {
  const candidate = adaptSalesProductCandidate({
    id: "P-1",
    productId: "P-1",
    productName: "英伟达 RTX 4090 FE 24G",
    brand: "英伟达",
    model: "RTX 4090 FE",
    vram: "24G",
    inventoryQuantity: 10,
    reservedQuantity: 3,
    availableQuantity: 7,
    estimatedSellPrice: 12800,
    saleable: true,
  }, {showCost: false});
  assert.equal(candidate.productName, "英伟达 RTX 4090 FE 24G");
  assert.equal(candidate.availableQuantity, 7);
  assert.equal(candidate.reservedQuantity, 3);
  assert.equal(candidate.estimatedSellPrice, 12800);
  assert.equal(candidate.costPrice, undefined);
  assert.equal("serialNumber" in candidate, false);
});

test("sales request adapter expands quantity and calculates receivable", () => {
  const values = createSalesDefaults("测试员");
  values.customerId = "KH-1";
  values.customerName = "张三";
  values.contact = "13800000000";
  values.paymentHandler = "其他经办人";
  values.paidAmount = 150;
  values.settlementAccountId = "ACC-1";
  values.items = [{inventoryId: "KC-1", productId: "P-1", productName: "RTX 4090", brand: "", model: "", vram: "", condition: "99新", quantity: 2, sellPrice: 100, costPrice: 60, remarks: "", aftersalesTerms: "店保三个月"}];
  const request = toCreateSalesRequest(values, {id: "ACC-1", name: "微信", type: "微信", enabled: true});
  assert.equal(request.items.length, 2);
  assert.equal(request.items[0]?.inventoryId, "");
  assert.equal(request.paidAmount, 150);
  assert.equal(request.unpaidAmount, 50);
  assert.equal(request.isPaid, false);
  assert.equal(request.paymentHandler, "测试员");
});

test("sales request adapter ignores the untouched default placeholder rows", () => {
  const values = createSalesDefaults("测试员");
  values.customerId = "KH-1";
  values.customerName = "张三";
  values.items[0] = {...values.items[0]!, productId: "P-1", productName: "RTX 4090", quantity: 2, sellPrice: 100};
  const request = toCreateSalesRequest(values);
  assert.equal(values.items.length, 4);
  assert.equal(request.items.length, 2);
  assert.ok(request.items.every((item) => item.productId === "P-1"));
});
