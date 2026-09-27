import assert from "node:assert/strict";
import test from "node:test";
import {adaptPurchaseCreateResponse, adaptPurchaseReferenceData, toPurchaseRequestDto, toPurchaseUpdateRequestDto} from "./purchase.adapter";
import {createPurchaseDefaults} from "@/src/features/purchase/purchase.defaults";
import {storeDate} from "@/src/utils/storeTime";

test("purchase request adapter matches V1 expanded item and settlement semantics", () => {
  const values = createPurchaseDefaults("测试员");
  values.sourcePartnerId = "V-1";
  values.sourcePartnerType = "vendor";
  values.supplierName = "同行供应商";
  values.paymentHandler = "其他经办人";
  values.paidAmount = 400;
  values.vendorCreditAppliedAmount = 200;
  values.settlementAccountId = "ACC-1";
  values.items = [{
    ...values.items[0]!,
    tempId: "line-1",
    productId: "P-1",
    productName: "RTX 4090",
    buyPrice: 1000,
    estSellPrice: 1300,
    quantity: 2,
  }];

  const request = toPurchaseRequestDto(values, {id: "ACC-1", name: "微信账户", type: "微信", balance: 5000, availableBalance: 5000, enabled: true});
  assert.equal(request.paymentMethod, "微信账户");
  assert.equal(request.paidAmount, 400);
  assert.equal(request.vendorCreditAppliedAmount, 200);
  assert.equal(request.unpaidAmount, 1400);
  assert.equal(request.isPaid, false);
  assert.equal(request.settlementAccountId, "ACC-1");
  assert.equal(request.paymentHandler, "测试员");
  assert.equal(request.items.length, 2);
  assert.deepEqual(request.items.map((item) => item.quantity), [1, 1]);
  assert.deepEqual(request.items.map((item) => item.buyPrice), [1000, 1000]);
});

test("purchase request adapter expands quantity 1, 2 and 5 without inventing SN", () => {
  const values = createPurchaseDefaults("测试员");
  values.sourcePartnerId = "V-1";
  values.sourcePartnerType = "vendor";
  values.supplierName = "同行供应商";
  values.items[0] = {...values.items[0]!, productId: "P-1", productName: "RTX", buyPrice: 100, quantity: 1};
  for (const quantity of [1, 2, 5]) {
    values.items[0]!.quantity = quantity;
    const request = toPurchaseRequestDto(values);
    assert.equal(request.items.length, quantity);
    assert.ok(request.items.every((item) => item.quantity === 1 && item.sn === ""));
  }
});

test("purchase request adapter keeps physical inspection fields pending regardless of hidden form state", () => {
  const values = createPurchaseDefaults("测试员");
  values.sourcePartnerId = "V-1";
  values.sourcePartnerType = "vendor";
  values.supplierName = "同行供应商";
  values.items[0] = {
    ...values.items[0]!,
    productId: "P-1",
    productName: "RTX 4090",
    buyPrice: 10_000,
    sn: "SHOULD-NOT-BIND-IN-PURCHASE",
    condition: "全新",
    inWarranty: true,
    warrantyDate: "2027-01-01",
    repaired: true,
    gpuRisk: true,
    fullBox: true,
    warehouseLocation: "A区货架-01",
  };

  const item = toPurchaseRequestDto(values).items[0]!;
  assert.equal(item.sn, "");
  assert.equal(item.condition, "95新");
  assert.equal(item.inWarranty, false);
  assert.equal(item.warrantyDate, undefined);
  assert.equal(item.repaired, false);
  assert.equal(item.gpuRisk, false);
  assert.equal(item.fullBox, false);
  assert.equal(item.warehouseLocation, "待检测区");
});

test("purchase request adapter sends only uploaded media URLs and keeps quantity expansion unchanged", () => {
  const values = createPurchaseDefaults("测试员");
  values.sourcePartnerId = "V-1";
  values.sourcePartnerType = "vendor";
  values.supplierName = "同行供应商";
  values.images = ["/api/media/assets/IMG-receipt-1", "data:image/jpeg;base64,ZmFrZQ=="];
  values.items[0] = {...values.items[0]!, productId: "P-1", productName: "RTX", buyPrice: 100, quantity: 2};
  const request = toPurchaseRequestDto(values);
  assert.deepEqual(request.images, ["/api/media/assets/IMG-receipt-1"]);
  assert.equal(request.items.length, 2);
  assert.ok(request.items.every((item) => item.quantity === 1));
  assert.equal(request.images?.some((image) => image.startsWith("data:")), false);
});

test("purchase update adapter preserves explicit text clearing and supports metadata-only edits", () => {
  const values = createPurchaseDefaults("测试员");
  values.expressNo = "";
  values.remarks = "  修正备注  ";
  const metadata = toPurchaseUpdateRequestDto(values, undefined, 3, "metadata");
  assert.deepEqual(metadata, {expectedRecordVersion: 3, expressNo: "", remarks: "修正备注"});

  values.sourcePartnerId = "V-1";
  values.sourcePartnerType = "vendor";
  values.supplierName = "同行供应商";
  values.items[0] = {...values.items[0]!, productId: "P-1", productName: "RTX", buyPrice: 100};
  const full = toPurchaseUpdateRequestDto(values, undefined, 4, "full");
  assert.equal(full.expectedRecordVersion, 4);
  assert.equal(full.items?.length, 1);
  assert.equal(full.expressNo, "");
});

test("purchase reference adapter exposes only minimum candidates and respects permission gates", () => {
  const response = {data: {
    purchaseInvoices: [{invoiceNo: `JH-${storeDate().replaceAll("-", "")}-002`}],
    products: [{id: "P-1", name: "RTX 4090", category: "显卡", model: "RTX 4090", brand: "NVIDIA", refBuyPrice: 1000, refSellPrice: 1300, currentStock: 2}],
    customers: [{id: "C-1", name: "张三", phone: "13800000000", level: "A级"}],
    vendors: [{id: "V-1", name: "同行", partnerCategory: "同行", phone: "13900000000", returnCreditBalance: 200}],
    settlementAccounts: [{id: "ACC-1", name: "微信", type: "微信", balance: 5000, availableBalance: 5000, enabled: true}],
    inventory: [{warehouseLocation: "A区-01"}, {warehouseLocation: "A区-01"}, {warehouseLocation: "B区-02"}],
  }};
  const data = adaptPurchaseReferenceData(response, {showCost: false, showProfit: false, canReadSettlementAccounts: false, canReadCustomers: true, canReadVendors: true});
  assert.equal(data.products[0]?.refBuyPrice, undefined);
  assert.equal(data.nextInvoiceNo, `JH-${storeDate().replaceAll("-", "")}-003`);
  assert.equal(data.products[0]?.refSellPrice, undefined);
  assert.equal(data.sources.length, 2);
  assert.equal(data.sources.find((source) => source.partnerType === "vendor")?.returnCreditBalance, 200);
  assert.equal(data.settlementAccounts.length, 0);
  assert.deepEqual(data.warehouses, ["A区-01", "B区-02"]);
  assert.equal(data.capabilities.hasWarehouseEndpoint, false);

  const withoutProducts = adaptPurchaseReferenceData(response, {showCost: true, showProfit: true, canReadSettlementAccounts: true, canReadCustomers: true, canReadVendors: true, canReadProducts: false});
  assert.equal(withoutProducts.products.length, 0);

  const withProfit = adaptPurchaseReferenceData(response, {showCost: false, showProfit: true, canReadSettlementAccounts: false, canReadCustomers: true, canReadVendors: true});
  assert.equal(withProfit.products[0]?.refBuyPrice, undefined);
  assert.equal(withProfit.products[0]?.refSellPrice, 1300);
});

test("purchase create response is adapted without exposing raw response to the page", () => {
  const result = adaptPurchaseCreateResponse({data: {id: "CG-1", invoiceNo: "JH-1", totalCount: 2, totalCost: 2000, items: []}, stateMerge: {purchaseInvoices: []}});
  assert.equal(result.invoice.id, "CG-1");
  assert.equal(result.data.invoiceNo, "JH-1");
  assert.deepEqual(result.stateMerge, {purchaseInvoices: []});
});
