import assert from "node:assert/strict";
import test from "node:test";
import {derivePurchaseCapabilities} from "./purchase.permissions";

test("purchase permission matrix separates read and quick-create capabilities", () => {
  const purchaseOnly = derivePurchaseCapabilities(["purchase_add"]);
  assert.equal(purchaseOnly.canEnterPurchaseCost, true);
  assert.equal(purchaseOnly.canReadCustomers, true);
  assert.equal(purchaseOnly.canCreateCustomer, false);
  assert.equal(purchaseOnly.canReadVendors, true);
  assert.equal(purchaseOnly.canCreateVendor, false);
  assert.equal(purchaseOnly.canReadProducts, true);
  assert.equal(purchaseOnly.canCreateProduct, false);
  assert.equal(purchaseOnly.canReadSettlementAccounts, true);
  assert.equal(purchaseOnly.canInspect, false);

  const crmOnly = derivePurchaseCapabilities(["crm"]);
  assert.equal(crmOnly.canReadCustomers, true);
  assert.equal(crmOnly.canCreateCustomer, false);

  const sourceAndProducts = derivePurchaseCapabilities(["customers", "vendors", "products"]);
  assert.equal(sourceAndProducts.canReadCustomers, true);
  assert.equal(sourceAndProducts.canCreateCustomer, true);
  assert.equal(sourceAndProducts.canReadVendors, true);
  assert.equal(sourceAndProducts.canCreateVendor, true);
  assert.equal(sourceAndProducts.canReadProducts, true);
  assert.equal(sourceAndProducts.canCreateProduct, true);
  assert.equal(sourceAndProducts.canReadSettlementAccounts, false);

  const owner = derivePurchaseCapabilities(["all"]);
  assert.deepEqual(owner, {
    canReadCustomers: true,
    canReadVendors: true,
    canReadProducts: true,
    canCreateCustomer: true,
    canCreateVendor: true,
    canCreateProduct: true,
    canReadSettlementAccounts: true,
    canInspect: true,
    canEnterPurchaseCost: true,
  });
});
