import assert from "node:assert/strict";
import test from "node:test";
import {isPathAllowed, navigationItems, navigationModules, isNavigationItemActive, requiredMenuIdsForPath} from "./navigation";

test("inventory navigation uses the customer-facing query label", () => {
  const inventory = navigationItems.find((item) => item.id === "inventory");
  assert.ok(inventory);
  assert.equal(inventory.label, "库存查询");
});

test("finance navigation exposes six core entries and keeps low-frequency tools under more", () => {
  const finance = navigationModules.find((module) => module.id === "财务利润");
  assert.ok(finance);
  const visible = finance.items.filter((item) => !item.hiddenInNavigation);
  const primary = visible.filter((item) => item.navigationSection !== "more");
  const more = visible.filter((item) => item.navigationSection === "more");

  assert.deepEqual(primary.map((item) => item.label), ["财务总览", "资金账户", "账户流水", "其他收支", "销售利润", "往来账款"]);
  assert.deepEqual(more.map((item) => item.label), ["资金调拨", "财务核对", "员工提成"]);
});

test("finance navigation preserves hidden route contracts", () => {
  const hiddenIds = navigationItems.filter((item) => item.hiddenInNavigation).map((item) => item.id);
  assert.ok(hiddenIds.includes("payment_out"));
  assert.ok(hiddenIds.includes("return_reconcile"));
  assert.ok(hiddenIds.includes("sales_commission"));
});

test("merged finance entries remain active on their historical child routes", () => {
  const income = navigationItems.find((item) => item.id === "payment_in");
  const reconcile = navigationItems.find((item) => item.id === "finance_closing");
  const commission = navigationItems.find((item) => item.id === "purchase_commission");
  assert.ok(income && reconcile && commission);

  assert.equal(isNavigationItemActive(income, "/finance/expense"), true);
  assert.equal(isNavigationItemActive(reconcile, "/finance/return-reconcile"), true);
  assert.equal(isNavigationItemActive(commission, "/finance/sales-commission"), true);
  assert.equal(isNavigationItemActive(income, "/finance/accounts"), false);
});

test("finance overview does not remain active on finance child routes", () => {
  const overview = navigationItems.find((item) => item.id === "finance");
  assert.ok(overview);
  assert.equal(isNavigationItemActive(overview, "/finance"), true);
  assert.equal(isNavigationItemActive(overview, "/finance/accounts"), false);
});

test("route permission contract follows the backend endpoint requirements", () => {
  assert.deepEqual(requiredMenuIdsForPath("/finance/expense"), ["payment_out"]);
  assert.deepEqual(requiredMenuIdsForPath("/finance/closing"), ["finance"]);
  assert.deepEqual(requiredMenuIdsForPath("/finance/return-reconcile"), ["return_purchase", "return_sales", "return_orders"]);
  assert.equal(isPathAllowed(["payment_out"], "/finance/expense"), true);
  assert.equal(isPathAllowed(["payment_in"], "/finance/expense"), false);
  assert.equal(isPathAllowed(["return_sales"], "/finance/return-reconcile"), true);
  assert.equal(isPathAllowed(["return_reconcile"], "/finance/return-reconcile"), false);
  assert.equal(isPathAllowed(["dashboard"], "/ai-insights"), true);
});
