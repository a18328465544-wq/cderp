import assert from "node:assert/strict";
import test from "node:test";
import {adaptSalesInvoiceRecord, adaptSalesListState, adaptSalesOutboundState, toSalesOutboundRequestDto} from "./sales.adapter";

function response() {
  return {data: {
    salesInvoices: [{
      id: "SALE-1",
      invoiceNo: "XS-20260808-001",
      date: "2026-08-08",
      customerName: "张先生",
      contact: "13800000000",
      channel: "微信私域",
      paymentMethod: "微信",
      paymentStatus: "部分收款",
      outboundStatus: "待出库",
      totalCount: 2,
      totalAmount: 3000,
      totalCost: 2400,
      totalProfit: 600,
      paidAmount: 1000,
      unpaidAmount: 2000,
      handleBy: "销售员",
      items: [{inventoryId: "", productName: "RTX 4070", sn: "", condition: "95新", quantity: 2, sellPrice: 1500, costPrice: 1200, profit: 300, aftersalesTerms: "店保三个月"}],
    }],
    inventory: [
      {id: "KC-1", salesInvoiceId: "XS-20260808-001"},
      {id: "KC-2", remarks: "销售单:XS-20260808-001"},
      {id: "KC-X", salesInvoiceId: "XS-X"},
    ],
  }};
}

test("sales list adapter projects orders and exact inventory links into domain items", () => {
  const result = adaptSalesListState(response(), {showCost: true, showProfit: true});
  assert.equal(result.source, "state-snapshot");
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.linkedInventoryCount, 2);
  assert.equal(result.items[0]?.productSummary, "RTX 4070");
  assert.equal(result.items[0]?.totalCost, 2400);
  assert.equal(result.items[0]?.totalProfit, 600);
  assert.equal(result.items[0]?.lines[0]?.costPrice, 1200);
});

test("sales outbound adapter exposes only pending invoices and sellable inventory", () => {
  const response = {data: {
    products: [{id: "P-1", name: "RTX 4090"}],
    inventory: [
      {id: "KC-1", sn: "SN-1", productId: "P-1", productName: "RTX 4090", status: "已入库"},
      {id: "KC-2", sn: "SN-2", productId: "P-1", productName: "RTX 4090", status: "已售出"},
    ],
    salesInvoices: [
      {id: "S-1", invoiceNo: "XS-1", outboundStatus: "待出库", items: [{productId: "P-1", productName: "RTX 4090", sellPrice: 10000}]},
      {id: "S-2", invoiceNo: "XS-2", outboundStatus: "已出库", items: []},
      {id: "S-3", invoiceNo: "XS-3", items: [{inventoryId: "KC-2", productId: "P-1", productName: "RTX 4090", sellPrice: 10000}]},
    ],
  }, meta: {page: 1, pageSize: 20, total: 1, summary: {pendingItemCount: 1, pendingAmount: 10000}}};
  const dataset = adaptSalesOutboundState(response);
  assert.equal(dataset.source, "database-page");
  assert.equal(dataset.meta?.total, 1);
  assert.equal(dataset.meta?.summary.pendingAmount, 10000);
  assert.deepEqual(dataset.invoices.map((item) => item.invoiceNo), ["XS-1"]);
  assert.deepEqual(dataset.inventory.map((item) => item.id), ["KC-1"]);
  assert.equal(dataset.invoices[0]?.lines[0]?.productIdentityKey, dataset.inventory[0]?.productIdentityKey);
  assert.equal("costPrice" in dataset.inventory[0]!, false);
});

test("sales outbound request adapter trims but preserves repeated scans for server validation", () => {
  assert.deepEqual(toSalesOutboundRequestDto({handler: " 仓库小李 ", codes: [" KC-1 ", "KC-1", "", "SN-2"], manual: false, remarks: " 已复核 "}), {
    handler: "仓库小李",
    codes: ["KC-1", "KC-1", "SN-2"],
    manual: false,
    remarks: "已复核",
  });
});

test("manual outbound request satisfies the existing DTO without inventing an inventory binding", () => {
  assert.deepEqual(toSalesOutboundRequestDto({handler: " 仓库小李 ", codes: [], manual: true, remarks: "扫码设备异常"}), {
    handler: "仓库小李",
    codes: ["__manual_confirmation__"],
    manual: true,
    remarks: "扫码设备异常",
  });
});

test("sales list adapter redacts cost and profit before feature consumption", () => {
  const result = adaptSalesListState(response(), {showCost: false, showProfit: false});
  assert.equal(result.items[0]?.totalCost, undefined);
  assert.equal(result.items[0]?.totalProfit, undefined);
  assert.equal(result.items[0]?.lines[0]?.costPrice, undefined);
  assert.equal(result.items[0]?.lines[0]?.profit, undefined);
  assert.equal(result.items[0]?.searchText.includes("2400"), false);
});

test("sales detail adapter preserves model quantities and redacts restricted totals", () => {
  const invoice = adaptSalesInvoiceRecord({
    id: "S-1",
    invoiceNo: "XS-1",
    customerName: "客户",
    items: [{productId: "P-1", productName: "RTX 4090", quantity: 2, sellPrice: 1500, costPrice: 1200, profit: 300}],
    totalAmount: 3000,
    paidAmount: 0,
    unpaidAmount: 3000,
  }, {showCost: false, showProfit: false});
  assert.equal(invoice.items[0]?.quantity, 2);
  assert.equal(invoice.totalAmount, 3000);
  assert.equal(invoice.totalCost, 0);
  assert.equal(invoice.totalProfit, 0);
  assert.equal(invoice.items[0]?.costPrice, 0);
  assert.equal(invoice.items[0]?.profit, 0);
});
