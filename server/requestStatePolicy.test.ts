import assert from "node:assert/strict";
import test from "node:test";
import {requiresStateSerialization} from "./mutationPolicy.ts";

import {
  getAuthenticationReloadKeys,
  AI_INSIGHT_STATE_KEYS,
  AI_DAILY_SALES_STATE_KEYS,
  getPersistenceKeysForRequest,
  getReloadKeysForRequest,
  getStatePatchKeysForRequest,
  INITIAL_STATE_RELOAD_KEYS,
  shouldAttachFreshStateToResponse,
  shouldReloadStateFromDatabase,
} from "./requestStatePolicy.ts";

test("authenticated SQL reads load only users and tenant settings, unknown reads keep compatibility", () => {
  for (const route of ["/api/inventory/items", "/api/sales-invoices", "/api/purchase-invoices", "/api/global-search", "/api/state/revision", "/api/finance/profit-report"]) {
    assert.deepEqual(getAuthenticationReloadKeys("GET", route), ["systemUsers"]);
  }
  assert.deepEqual(getAuthenticationReloadKeys("POST", "/api/returns"), ["systemUsers"]);
  assert.equal(getAuthenticationReloadKeys("GET", "/api/unknown-read"), null);
  assert.deepEqual(getAuthenticationReloadKeys("GET", "/api/state", true), [...new Set(["systemUsers", ...INITIAL_STATE_RELOAD_KEYS])]);
});

test("AI routes do not load the same full state both during authentication and in their handler", () => {
  for (const route of ["/api/ai/insights", "/api/ai/insight-actions", "/api/ai/daily-sales-summary"]) {
    assert.deepEqual(getAuthenticationReloadKeys("GET", route), ["systemUsers"]);
    assert.deepEqual(getReloadKeysForRequest("GET", route), []);
  }
  assert.deepEqual(AI_INSIGHT_STATE_KEYS, ["inventory", "salesInvoices", "purchaseInvoices", "marketQuotes"]);
  assert.deepEqual(AI_DAILY_SALES_STATE_KEYS, ["inventory", "salesInvoices", "returnOrders"]);
});

test("GET state reloads from database", () => {
  assert.equal(shouldReloadStateFromDatabase("GET", "/api/state"), true);
});

test("POST previews load their explicit read dependencies, not the command-only authentication snapshot", () => {
  const path = "/api/sales-invoices/XS-internal-id/outbound/preflight";
  assert.deepEqual(getAuthenticationReloadKeys("POST", path), ["systemUsers", "salesInvoices", "inventory", "products"]);
  assert.deepEqual(getAuthenticationReloadKeys("post", `${path}/`), ["systemUsers", "salesInvoices", "inventory", "products"]);
  assert.deepEqual(getReloadKeysForRequest("POST", path), ["salesInvoices", "inventory", "products"]);
  assert.equal(getPersistenceKeysForRequest("POST", path), null);
  assert.equal(getStatePatchKeysForRequest("POST", path), null);
  assert.equal(shouldAttachFreshStateToResponse("POST", path, {data: {ready: true}}), false);
  assert.deepEqual(getAuthenticationReloadKeys("POST", "/api/gpu_erp/crm/quick-capture/parse"), ["systemUsers", "customers", "products"]);
  assert.deepEqual(getAuthenticationReloadKeys("POST", "/api/gpu_erp/crm/customer/lead-preview"), ["systemUsers"]);
  for (const command of ["/api/sales-invoices/XS-internal-id/outbound", "/api/sales-invoices", "/api/gpu_erp/crm/quick-capture/confirm"]) {
    assert.deepEqual(getAuthenticationReloadKeys("POST", command), ["systemUsers"]);
  }
});

test("outbound preview stays a scoped read across middleware policies and URL variants", () => {
  for (const method of ["POST", "post"]) {
    for (const suffix of ["", "/"]) {
      const path = `/api/sales-invoices/XS-internal-id/outbound/preflight${suffix}`;
      assert.equal(requiresStateSerialization(method, `${path}?source=outbound`), false);
      assert.deepEqual(getAuthenticationReloadKeys(method, path), ["systemUsers", "salesInvoices", "inventory", "products"]);
      assert.deepEqual(getReloadKeysForRequest(method, path), ["salesInvoices", "inventory", "products"]);
      assert.equal(getPersistenceKeysForRequest(method, path), null);
      assert.equal(getStatePatchKeysForRequest(method, path), null);
      assert.equal(shouldAttachFreshStateToResponse(method, path, {data: {ready: true}}), false);
    }
  }
  const confirmPath = "/api/sales-invoices/XS-internal-id/outbound";
  assert.equal(requiresStateSerialization("POST", confirmPath), true);
  assert.deepEqual(getAuthenticationReloadKeys("POST", confirmPath), ["systemUsers"]);
  assert.ok(getReloadKeysForRequest("POST", confirmPath)?.includes("salesInvoices"));
  assert.ok(getPersistenceKeysForRequest("POST", confirmPath)?.includes("inventory"));
});

test("business writes reload from database before mutating memory", () => {
  assert.equal(shouldReloadStateFromDatabase("POST", "/api/sales-invoices"), true);
  assert.equal(shouldReloadStateFromDatabase("PUT", "/api/products/SP-001"), true);
  assert.equal(shouldReloadStateFromDatabase("DELETE", "/api/customers/C-001"), true);
});

test("payment mutations load refund and aftersales dependencies without persisting those read-only collections", () => {
  for (const direction of ["in", "out"]) for (const [method, suffix] of [["POST", "create"], ["PUT", "PAY-1"], ["DELETE", "PAY-1"], ["POST", "PAY-1/reverse"]]) {
    const route = `/api/gpu_erp/finance/payment-${direction}/${suffix}`;
    assert.deepEqual(getAuthenticationReloadKeys(method!, route), ["systemUsers"]);
    for (const key of ["returnOrders", "aftersales"] as const) {
      assert.ok(getReloadKeysForRequest(method!, route)?.includes(key), route);
      assert.equal(getPersistenceKeysForRequest(method!, route)?.includes(key), false, route);
    }
  }
});

test("inspection and inventory mutations reload and persist purchase revisions while workspace reads stay scoped", () => {
  for (const [method, path] of [["POST", "/api/inspections"], ["PUT", "/api/inspections/JC-1"], ["PATCH", "/api/inventory/batch"], ["POST", "/api/inventory/scan-flow"]]) {
    assert.ok(getReloadKeysForRequest(method, path)?.includes("purchaseInvoices"), path);
    assert.ok(getPersistenceKeysForRequest(method, path)?.includes("purchaseInvoices"), path);
  }
  assert.deepEqual(getReloadKeysForRequest("GET", "/api/inspections/workspace"), []);
  assert.deepEqual(getReloadKeysForRequest("GET", "/api/inventory/items"), []);
});

test("aftersales writes reload related identities and source payments while SQL workspace reads stay lightweight", () => {
  assert.deepEqual(getAuthenticationReloadKeys("GET", "/api/aftersales/workspace"), ["systemUsers"]);
  assert.deepEqual(getReloadKeysForRequest("GET", "/api/aftersales/workspace"), []);
  for (const [method, path] of [["POST", "/api/aftersales"], ["PATCH", "/api/aftersales/SH-1"]]) {
    assert.deepEqual(getAuthenticationReloadKeys(method, path), ["systemUsers"]);
    assert.equal(requiresStateSerialization(method, path), true);
    const keys = getReloadKeysForRequest(method, path);
    for (const key of ["aftersales", "inventory", "products", "salesInvoices", "customers", "vendors", "paymentInRecords", "paymentOutRecords", "settlementAccounts", "settlementLedger", "financeLedger"]) assert.ok(keys?.includes(key as NonNullable<typeof keys>[number]), key);
  }
});

test("reads participate in revision checks while HEAD and OPTIONS remain lightweight", () => {
  assert.equal(shouldReloadStateFromDatabase("GET", "/api/products"), true);
  assert.equal(shouldReloadStateFromDatabase("HEAD", "/api/products"), false);
  assert.equal(shouldReloadStateFromDatabase("OPTIONS", "/api/products"), false);
  assert.deepEqual(getReloadKeysForRequest("GET", "/api/inventory/items"), []);
  assert.deepEqual(getReloadKeysForRequest("GET", "/api/ai/daily-sales-summary"), []);
  assert.deepEqual(getReloadKeysForRequest("GET", "/api/customers/page"), []);
  assert.deepEqual(getReloadKeysForRequest("GET", "/api/vendors"), []);
  assert.deepEqual(getReloadKeysForRequest("GET", "/api/products"), []);
  assert.deepEqual(getReloadKeysForRequest("GET", "/api/market-quotes"), ["marketQuotes", "inventory"]);
  assert.deepEqual(getReloadKeysForRequest("GET", "/api/sales-invoices/outbound"), []);
  assert.deepEqual(getReloadKeysForRequest("GET", "/api/logs"), []);
});

test("customer funds reads directly from the database without warming the process cache", () => {
  assert.deepEqual(getReloadKeysForRequest("GET", "/api/gpu_erp/finance/customer-funds"), []);
});

test("business writes attach fresh state when route payload omitted it", () => {
  assert.equal(shouldAttachFreshStateToResponse("POST", "/api/purchase-invoices", { data: { id: "JH-1" } }), true);
  assert.equal(shouldAttachFreshStateToResponse("PUT", "/api/sales-invoices/XS-1", { data: { id: "XS-1" } }), true);
});

test("reads and existing state payloads do not get another state wrapper", () => {
  assert.equal(shouldAttachFreshStateToResponse("GET", "/api/state", { data: {} }), false);
  assert.equal(shouldAttachFreshStateToResponse("POST", "/api/purchase-invoices", { data: {}, state: {} }), false);
  assert.equal(shouldAttachFreshStateToResponse("POST", "/api/purchase-invoices", { data: {}, stateMerge: {} }), false);
  assert.equal(shouldAttachFreshStateToResponse("POST", "/api/purchase-invoices", null), false);
});

test("purchase and sales writes persist only affected collections", () => {
  assert.deepEqual(getPersistenceKeysForRequest("POST", "/api/purchase-invoices"), [
    "purchaseInvoices",
    "inventory",
    "customers",
    "vendors",
    "financeLedger",
    "settlementAccounts",
    "settlementLedger",
    "paymentOutRecords",
    "logs",
  ]);
  assert.deepEqual(getPersistenceKeysForRequest("POST", "/api/sales-invoices"), [
    "salesInvoices",
    "inventory",
    "purchaseCommissions",
    "customers",
    "vendors",
    "financeLedger",
    "settlementAccounts",
    "settlementLedger",
    "paymentInRecords",
    "logs",
  ]);
});

test("business writes do not preload immutable audit logs before writing a new log", () => {
  assert.deepEqual(getReloadKeysForRequest("POST", "/api/purchase-invoices"), [
    "purchaseInvoices",
    "inventory",
    "customers",
    "vendors",
    "financeLedger",
    "settlementAccounts",
    "settlementLedger",
    "paymentOutRecords",
  ]);
  assert.deepEqual(getReloadKeysForRequest("POST", "/api/sales-invoices"), [
    "salesInvoices",
    "inventory",
    "purchaseCommissions",
    "customers",
    "vendors",
    "financeLedger",
    "settlementAccounts",
    "settlementLedger",
    "paymentInRecords",
  ]);
});

test("quick partner creates do not preload full logs before writing one new log", () => {
  assert.deepEqual(getReloadKeysForRequest("POST", "/api/customers"), ["customers"]);
  assert.deepEqual(getReloadKeysForRequest("POST", "/api/vendors"), ["vendors"]);
  assert.deepEqual(getReloadKeysForRequest("POST", "/api/gpu_erp/crm/customer/create"), [
    "customers",
    "crmFollowUps",
    "crmRequirements",
  ]);
});

test("quick capture keeps parse lightweight and confirms CRM state atomically", () => {
  assert.equal(getPersistenceKeysForRequest("POST", "/api/gpu_erp/crm/quick-capture/parse"), null);
  assert.deepEqual(getReloadKeysForRequest("POST", "/api/gpu_erp/crm/quick-capture/parse"), ["customers", "products"]);
  assert.deepEqual(getPersistenceKeysForRequest("POST", "/api/gpu_erp/crm/quick-capture/confirm"), ["customers", "crmFollowUps", "logs"]);
  assert.deepEqual(getReloadKeysForRequest("POST", "/api/gpu_erp/crm/quick-capture/confirm"), ["customers", "crmFollowUps"]);
  assert.deepEqual(getReloadKeysForRequest("GET", "/api/gpu_erp/crm/quick-capture/leads"), []);
});

test("initial sync excludes histories that have dedicated lazy endpoints", () => {
  assert.equal(INITIAL_STATE_RELOAD_KEYS.includes("logs"), false);
  assert.equal(INITIAL_STATE_RELOAD_KEYS.includes("products"), false);
  assert.equal(INITIAL_STATE_RELOAD_KEYS.includes("financeLedger"), false);
  assert.equal(INITIAL_STATE_RELOAD_KEYS.includes("settlementLedger"), false);
  assert.equal(INITIAL_STATE_RELOAD_KEYS.includes("inventory"), true);
  assert.equal(INITIAL_STATE_RELOAD_KEYS.includes("salesInvoices"), true);
});

test("write responses attach only the collections needed by the current page", () => {
  assert.deepEqual(getStatePatchKeysForRequest("POST", "/api/purchase-invoices"), [
    "purchaseInvoices",
    "inventory",
    "customers",
    "vendors",
    "financeLedger",
    "settlementAccounts",
    "settlementLedger",
    "paymentOutRecords",
    "logs",
  ]);
  assert.deepEqual(getStatePatchKeysForRequest("POST", "/api/products/import"), null);
});
