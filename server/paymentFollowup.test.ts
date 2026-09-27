import assert from "node:assert/strict";
import test from "node:test";
import {createInitialState, createStoreActions} from "./store";

test("linked follow-up payments cannot exceed an invoice outstanding balance", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const account = state.settlementAccounts.find((item) => item.enabled);
  const card = state.inventory.find((item) => item.status === "已入库" || item.status === "已上架");
  const product = state.products[0];
  assert.ok(account && card && product);

  const sale = actions.createSalesInvoice({
    date: "2026-09-20",
    customerName: "补录收款测试客户",
    contact: "13800000001",
    channel: "到店",
    paymentMethod: "账期欠款",
    isPaid: false,
    paidAmount: 0,
    unpaidAmount: 1000,
    needInvoice: false,
    freeShipping: true,
    aftersalesTerms: "店保",
    handleBy: "测试经办人",
    items: [{
      inventoryId: card.id,
      productId: card.productId,
      productName: card.productName,
      sn: card.sn,
      condition: card.condition,
      costPrice: card.costPrice,
      sellPrice: 1000,
      profit: 1000 - card.costPrice,
      aftersalesTerms: "店保",
    }],
  });
  assert.equal(sale.unpaidAmount, 1000);
  assert.throws(() => actions.createPaymentIn({
    customerName: sale.customerName,
    accountId: account.id,
    amount: 1000.01,
    handler: "测试经办人",
    paymentMethod: "现金",
    businessType: "销售收款",
    relatedDocType: "销售单",
    relatedDocNo: sale.invoiceNo,
    time: "2026-09-20 10:00",
  }), /当前未收/);
  actions.createPaymentIn({
    customerName: sale.customerName,
    accountId: account.id,
    amount: 1000,
    handler: "测试经办人",
    paymentMethod: "现金",
    businessType: "销售收款",
    relatedDocType: "销售单",
    relatedDocNo: sale.invoiceNo,
    time: "2026-09-20 10:01",
  });
  assert.equal(state.salesInvoices.find((item) => item.invoiceNo === sale.invoiceNo)?.paymentStatus, "已收款");

  const purchase = actions.createPurchaseInvoice({
    date: "2026-09-20",
    sourceType: "同行拿货",
    supplierName: "补录付款测试供应商",
    contact: "13800000002",
    paymentMethod: "账期欠款",
    isPaid: false,
    paidAmount: 0,
    unpaidAmount: 1000,
    handleBy: "测试经办人",
    items: [{
      tempId: "follow-up-payment",
      productId: product.id,
      productName: product.name,
      category: product.category,
      model: product.model,
      brand: product.brand,
      version: product.version,
      vram: product.vram,
      sn: "FOLLOW-UP-PAYMENT-SN",
      condition: "95新",
      inWarranty: true,
      repaired: false,
      gpuRisk: false,
      fullBox: true,
      buyPrice: 1000,
      estSellPrice: 1200,
      warehouseLocation: "待检测区",
    }],
  });
  assert.equal(purchase.unpaidAmount, 1000);
  assert.throws(() => actions.createPaymentOut({
    supplierName: purchase.supplierName,
    accountId: account.id,
    amount: 1000.01,
    handler: "测试经办人",
    paymentMethod: "现金",
    businessType: "采购付款",
    relatedDocType: "采购单",
    relatedDocNo: purchase.invoiceNo,
    time: "2026-09-20 11:00",
  }), /当前未付/);
  actions.createPaymentOut({
    supplierName: purchase.supplierName,
    accountId: account.id,
    amount: 1000,
    handler: "测试经办人",
    paymentMethod: "现金",
    businessType: "采购付款",
    relatedDocType: "采购单",
    relatedDocNo: purchase.invoiceNo,
    time: "2026-09-20 11:01",
  });
  assert.equal(state.purchaseInvoices.find((item) => item.invoiceNo === purchase.invoiceNo)?.paymentStatus, "已付款");
});
