import assert from "node:assert/strict";
import test from "node:test";
import {salesApi, toSalesCustomerQueryParams, toSalesInventoryQueryParams} from "./sales";
import type {SalesFormValues} from "@/src/types/sales";

test("sales customer query uses server paging and keyword contract", () => {
  const params = toSalesCustomerQueryParams(" 张三 ", 2, 20);
  assert.equal(params.has("role"), false);
  assert.equal(params.get("keyword"), "张三");
  assert.equal(params.get("page"), "2");
  assert.equal(params.get("pageSize"), "20");
});

test("sales customer picker requests the bounded full first page", () => {
  const params = toSalesCustomerQueryParams("", 1, 200);
  assert.equal(params.has("role"), false);
  assert.equal(params.get("pageSize"), "200");
});

test("sales customer picker reads the canonical customer archive endpoint", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.equal(input, "/api/sales/customers?page=1&pageSize=200&keyword=%E5%BC%A0%E4%B8%89");
    return new Response(JSON.stringify({data: {items: [{id: "CUSTOMER-KH-1", displayName: "张三", roles: ["customer"], legacyCustomer: {id: "KH-1", name: "张三"}}], meta: {page: 1, pageSize: 200, total: 1}}}), {status: 200, headers: {"Content-Type": "application/json"}});
  };
  try {
    const result = await salesApi.searchCustomers(" 张三 ");
    assert.equal(result[0]?.id, "KH-1");
    assert.equal(result[0]?.selectable, true);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("sales inventory query requests only active candidates", () => {
  const params = toSalesInventoryQueryParams("SN-1", 1, 20);
  assert.equal(params.get("activeOnly"), "true");
  assert.equal(params.get("includeSold"), "false");
  assert.equal(params.get("keyword"), "SN-1");
  assert.equal(params.get("sortKey"), "entryTime");
});

test("sales product picker requests the product-level availability endpoint", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.equal(input, "/api/sales/product-candidates?keyword=RTX+4090");
    return new Response(JSON.stringify({data: [{id: "P-1", productId: "P-1", productName: "RTX 4090", inventoryQuantity: 5, reservedQuantity: 2, availableQuantity: 3, estimatedSellPrice: 12800, saleable: true}]}), {status: 200, headers: {"Content-Type": "application/json"}});
  };
  try {
    const result = await salesApi.searchProductCandidates(" RTX 4090 ", {showCost: false, showProfit: false});
    assert.equal(result[0]?.productName, "RTX 4090");
    assert.equal(result[0]?.availableQuantity, 3);
    assert.equal(result[0]?.estimatedSellPrice, 12800);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("sales outbound requests server paging and keyword filters", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.equal(input, "/api/sales-invoices/outbound?page=2&pageSize=20&keyword=RTX+4090");
    return new Response(JSON.stringify({data: {salesInvoices: [], inventory: [], products: []}, meta: {page: 2, pageSize: 20, total: 21, summary: {pendingItemCount: 30, pendingAmount: 300000}}}), {status: 200, headers: {"Content-Type": "application/json"}});
  };
  try {
    const result = await salesApi.outbound({keyword: " RTX 4090 ", page: 2, pageSize: 20});
    assert.equal(result.source, "database-page");
    assert.equal(result.meta?.totalPages, 2);
    assert.equal(result.meta?.summary.pendingItemCount, 30);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("sales outbound preflight uses the authoritative server endpoint", async () => {
  const previousFetch = globalThis.fetch;
  let requestedBody = "";
  globalThis.fetch = async (input, init) => {
    assert.equal(input, "/api/sales-invoices/S-1/outbound/preflight");
    assert.equal(init?.method, "POST");
    requestedBody = String(init?.body || "");
    return new Response(JSON.stringify({data: {invoiceId: "S-1", invoiceNo: "XS-1", expectedCount: 1, matchedCount: 1, ready: true, unknownCodes: [], duplicateCodes: [], rows: [{lineId: "L-1", productName: "RTX 4090", inventoryId: "I-1", serialNumber: "SN-1", matched: true, reason: "服务器已匹配可售库存"}]}}), {status: 200, headers: {"Content-Type": "application/json"}});
  };
  try {
    const result = await salesApi.preflightOutbound("S-1", {handler: "仓库", codes: ["SN-1"], manual: false, remarks: ""});
    assert.match(requestedBody, /SN-1/);
    assert.equal(result.ready, true);
    assert.equal(result.rows[0]?.inventoryId, "I-1");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("sales detail resolver can locate an invoice by an inventory-card reference", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.equal(input, "/api/sales-invoices?page=1&pageSize=1&keyword=KC-1");
    return new Response(JSON.stringify({data: {salesInvoices: [{id: "S-1", invoiceNo: "XS-1", items: [{inventoryId: "KC-1", productName: "RTX 4090", sn: "SN-1", sellPrice: 18000}]}], inventory: []}, meta: {page: 1, pageSize: 1, total: 1}}), {status: 200, headers: {"Content-Type": "application/json"}});
  };
  try {
    const result = await salesApi.findByReference(" KC-1 ", {showCost: false, showProfit: false});
    assert.equal(result?.invoiceNo, "XS-1");
    assert.equal(result?.lines[0]?.id, "KC-1");
  } finally { globalThis.fetch = previousFetch; }
});

test("sales delete endpoint encodes the invoice id and adapts the deleted document", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.equal(input, "/api/sales-invoices/XS%2F1");
    assert.equal(init?.method, "DELETE");
    return new Response(JSON.stringify({data: {id: "XS/1", invoiceNo: "XS-1", totalCount: 1, totalAmount: 100, paidAmount: 0, unpaidAmount: 100, paymentStatus: "未收款", outboundStatus: "待出库"}}), {status: 200, headers: {"Content-Type": "application/json"}});
  };
  try {
    const result = await salesApi.remove("XS/1");
    assert.equal(result.invoiceNo, "XS-1");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("sales edit sends model quantities expanded once and keeps physical binding for outbound", async () => {
  const previousFetch = globalThis.fetch;
  const values: SalesFormValues = {
    date: "2026-09-12",
    customerId: "C-1",
    customerPartnerType: "customer",
    customerName: "客户",
    contact: "13800000000",
    channel: "微信私域",
    paymentMethod: "微信",
    settlementAccountId: "",
    paidAmount: 0,
    needInvoice: false,
    freeShipping: true,
    expressCompany: "",
    expressNo: "SF-1",
    aftersalesTerms: "店保三个月",
    handleBy: "销售",
    paymentHandler: "销售",
    remarks: "编辑备注",
    items: [{inventoryId: "", productId: "P-1", productName: "RTX 4090", brand: "华硕", model: "4090", vram: "24G", condition: "出库核验", quantity: 2, sellPrice: 1500, costPrice: 1200, remarks: "", aftersalesTerms: "店保三个月"}],
  };
  globalThis.fetch = async (input, init) => {
    assert.equal(input, "/api/sales-invoices/S-1");
    assert.equal(init?.method, "PUT");
    const body = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
    const items = body.items as Array<Record<string, unknown>>;
    assert.equal(items.length, 2);
    assert.equal(items.every((item) => item.inventoryId === "" && item.quantity === undefined && item.sn === ""), true);
    assert.equal("purchaseDraftId" in body, false);
    return new Response(JSON.stringify({data: {id: "S-1", invoiceNo: "XS-1", date: values.date, customerId: "C-1", customerName: values.customerName, contact: values.contact, channel: values.channel, paymentMethod: values.paymentMethod, paidAmount: 0, unpaidAmount: 3000, paymentStatus: "未收款", outboundStatus: "待出库", items}}), {status: 200, headers: {"Content-Type": "application/json"}});
  };
  try {
    const result = await salesApi.update("S-1", values, undefined, "full", {showCost: true, showProfit: true});
    assert.equal(result.invoice.id, "S-1");
    assert.equal(result.invoice.items.length, 2);
  } finally { globalThis.fetch = previousFetch; }
});

test("sales limited edit only sends editable metadata", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.equal(input, "/api/sales-invoices/S-1");
    assert.equal(init?.method, "PUT");
    assert.deepEqual(JSON.parse(String(init?.body || "{}")), {expressNo: "SF-2", remarks: "补充说明"});
    return new Response(JSON.stringify({data: {id: "S-1", invoiceNo: "XS-1", items: [], paidAmount: 0, unpaidAmount: 0, paymentStatus: "未收款", outboundStatus: "已出库"}}), {status: 200, headers: {"Content-Type": "application/json"}});
  };
  try {
    const result = await salesApi.update("S-1", {...({} as SalesFormValues), expressNo: " SF-2 ", remarks: " 补充说明 "}, undefined, "metadata", {showCost: false, showProfit: false});
    assert.equal(result.invoice.invoiceNo, "XS-1");
  } finally { globalThis.fetch = previousFetch; }
});
