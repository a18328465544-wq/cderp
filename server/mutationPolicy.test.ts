import assert from "node:assert/strict";
import test from "node:test";
import { isStateMutationPath, requiresStateSerialization } from "./mutationPolicy.ts";

test("mutation policy includes shared ERP writes and cache writes, while excluding read-only POST analysis", () => {
  assert.equal(isStateMutationPath("POST", "/api/sales-invoices"), true);
  assert.equal(isStateMutationPath("PATCH", "/api/gpu_erp/finance/payment-in/PK-001"), true);
  assert.equal(isStateMutationPath("POST", "/api/ai/copilot"), false);
  // Refreshing insights persists the generated payload in the shared cache, so
  // it must use the same serialization boundary as other state-changing routes.
  assert.equal(isStateMutationPath("POST", "/api/ai/insights/refresh"), true);
  assert.equal(isStateMutationPath("POST", "/api/gpu_erp/crm/customer/lead-preview"), false);
  assert.equal(isStateMutationPath("GET", "/api/sales-invoices"), false);
  assert.equal(isStateMutationPath("POST", "/api/order-pool"), true);
  assert.equal(isStateMutationPath("POST", "/api/order-pool/DD-1/events"), true);
});

test("full-state backups share the serialization boundary without becoming mutations", () => {
  assert.equal(isStateMutationPath("POST", "/api/backup"), false);
  assert.equal(requiresStateSerialization("POST", "/api/backup"), true);
  assert.equal(requiresStateSerialization("GET", "/api/backup"), false);
  assert.equal(requiresStateSerialization("POST", "/api/backup/download"), false);
});
