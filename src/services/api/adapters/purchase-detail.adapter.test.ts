import assert from "node:assert/strict";
import test from "node:test";
import {adaptPurchaseDetailState} from "./purchase.adapter";

const invoice = {
  id: "PUR-1",
  invoiceNo: "JH-20260808-001",
  date: "2026-08-08",
  sourceType: "同行拿货",
  sourcePartnerId: "V-1",
  sourcePartnerType: "vendor",
  supplierName: "测试供应商",
  contact: "13900000000",
  paymentMethod: "微信",
  paidAmount: 800,
  vendorCreditAppliedAmount: 100,
  unpaidAmount: 100,
  isPaid: false,
  paymentStatus: "部分付款",
  handleBy: "采购员",
  items: [{
    tempId: "line-1",
    productId: "P-1",
    productName: "RTX 4090",
    category: "显卡",
    model: "RTX 4090",
    brand: "华硕",
    version: "ROG",
    vram: "24G",
    sn: "",
    condition: "95新",
    inWarranty: false,
    repaired: false,
    gpuRisk: false,
    fullBox: true,
    quantity: 1,
    buyPrice: 1000,
    estSellPrice: 1300,
    warehouseLocation: "待检测区",
  }],
  totalCount: 1,
  totalCost: 1000,
  estTotalSell: 1300,
  estTotalProfit: 300,
};

function response() {
  return {data: {
    purchaseInvoices: [invoice],
    inventory: [
      {id: "KC-1", productName: "RTX 4090", purchaseInvoiceNo: invoice.invoiceNo, sn: "SN-1", status: "已入库", warehouseLocation: "A区"},
      {id: "KC-2", productName: "RTX 4090", remarks: `进货单:${invoice.invoiceNo}`, sn: "", status: "待检测", warehouseLocation: "待检测区"},
      {id: "KC-X", productName: "其他商品", purchaseInvoiceNo: "JH-X", status: "已入库"},
    ],
    inspections: [{id: "JC-1", inventoryId: "KC-1"}],
    paymentOutRecords: [{id: "PAY-1", relatedDocNo: invoice.invoiceNo, amount: 800, accountName: "微信账户", paymentMethod: "微信", handler: "财务", time: "2026-08-08 10:00"}],
    returnOrders: [{id: "RT-1", type: "进货退货", status: "已完成", relatedDocNo: invoice.invoiceNo}],
  }};
}

test("purchase detail adapter links invoice, inventory, inspections, payments and completed returns", () => {
  const detail = adaptPurchaseDetailState(response(), invoice.invoiceNo, {showCost: true, showProfit: true, canReadPayments: true, canReadPurchaseReturns: true});
  assert.ok(detail);
  assert.equal(detail.invoice.id, "PUR-1");
  assert.equal(detail.inventory.length, 2);
  assert.equal(detail.inventory.find((item) => item.id === "KC-1")?.hasInspection, true);
  assert.equal(detail.inspectionCount, 1);
  assert.equal(detail.paymentCount, 1);
  assert.equal(detail.payments[0]?.amount, 800);
  assert.equal(detail.completedReturnCount, 1);
});

test("purchase detail adapter does not interpret permission-trimmed collections as zero history", () => {
  const detail = adaptPurchaseDetailState(response(), "PUR-1", {showCost: true, showProfit: true, canReadPayments: false, canReadPurchaseReturns: false});
  assert.ok(detail);
  assert.equal(detail.paymentCount, null);
  assert.equal(detail.completedReturnCount, null);
  assert.deepEqual(detail.payments, []);
});

test("purchase detail adapter projects cost and profit permissions before feature consumption", () => {
  const detail = adaptPurchaseDetailState(response(), "PUR-1", {showCost: false, showProfit: false, canReadPayments: true, canReadPurchaseReturns: true});
  assert.ok(detail);
  assert.equal(detail.invoice.totalCost, 0);
  assert.equal(detail.invoice.estTotalSell, 0);
  assert.equal(detail.invoice.estTotalProfit, 0);
  assert.equal(detail.invoice.items[0]?.buyPrice, 0);
  assert.equal(detail.invoice.items[0]?.estSellPrice, 0);
});

test("purchase detail adapter returns null for missing or inaccessible invoices", () => {
  const detail = adaptPurchaseDetailState(response(), "JH-MISSING", {showCost: true, showProfit: true, canReadPayments: true, canReadPurchaseReturns: true});
  assert.equal(detail, null);
});
