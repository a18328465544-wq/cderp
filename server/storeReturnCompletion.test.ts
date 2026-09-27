import assert from "node:assert/strict";
import test from "node:test";
import {createStateProxy, runTenantContext} from "./requestTenantContext.ts";
import {createInitialState, createStoreActions, type AppState} from "./store.ts";

test("return completion works when a legacy action caller supplies the request state proxy", () => {
  const concrete = createInitialState();
  const proxy = createStateProxy<AppState>();

  runTenantContext({tenantId: "tenant-proxy-test", storeId: "store-proxy-test", state: concrete}, () => {
    const actions = createStoreActions(proxy);
    const product = concrete.products[0];
    assert.ok(product);

    const invoice = actions.createPurchaseInvoice({
      date: "2026-09-07",
      sourceType: "同行拿货",
      supplierName: "Proxy测试供应商",
      contact: "13800000000",
      paymentMethod: "现金",
      isPaid: false,
      paidAmount: 0,
      unpaidAmount: 100,
      handleBy: "测试",
      items: [{
        tempId: "proxy-return-line-1",
        productId: product.id,
        productName: product.name,
        category: product.category,
        model: product.model,
        brand: product.brand,
        version: product.version,
        vram: product.vram,
        sn: "PROXY-RETURN-SN",
        condition: "99新",
        inWarranty: true,
        repaired: false,
        gpuRisk: false,
        fullBox: true,
        buyPrice: 100,
        estSellPrice: 120,
        warehouseLocation: "A-1",
      }],
    });
    const card = concrete.inventory.find((item) => item.purchaseInvoiceNo === invoice.invoiceNo);
    assert.ok(card);

    const order = actions.createReturnOrder({
      type: "进货退货",
      relatedDocType: "采购单",
      relatedDocNo: invoice.invoiceNo,
      sourceInventoryId: card.id,
      amount: 100,
      settlementMode: "抵扣账款",
      handler: "测试",
      reason: "Proxy快照回归",
      inventoryAction: "退回供应商",
    });
    const completed = actions.completeReturnOrder(order.id);

    assert.equal(completed.status, "已完成");
    assert.equal(concrete.inventory.find((item) => item.id === card.id)?.status, "已退货");
    assert.equal(concrete.purchaseInvoices.find((item) => item.id === invoice.id)?.items.length, 0);
  });
});
