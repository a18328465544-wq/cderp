import assert from "node:assert/strict";
import test from "node:test";

import {
  getPersistenceKeysForRequest,
  getReloadKeysForRequest,
  getStatePatchKeysForRequest,
  INITIAL_STATE_RELOAD_KEYS,
  shouldAttachFreshStateToResponse,
  shouldReloadStateFromDatabase,
} from "./requestStatePolicy.ts";

test("GET state reloads from database", () => {
  assert.equal(shouldReloadStateFromDatabase("GET", "/api/state"), true);
});

test("business writes reload from database before mutating memory", () => {
  assert.equal(shouldReloadStateFromDatabase("POST", "/api/sales-invoices"), true);
  assert.equal(shouldReloadStateFromDatabase("PUT", "/api/products/SP-001"), true);
  assert.equal(shouldReloadStateFromDatabase("DELETE", "/api/customers/C-001"), true);
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
