import assert from "node:assert/strict";
import test from "node:test";
import {financeReconciliationApi} from "./finance-reconciliation";

test("finance reconciliation endpoint keeps the audit limit bounded", async () => {
  const previous = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    return new Response(JSON.stringify({data: {healthy: true, issues: [], summary: {}, checks: {}, generatedAt: "2026-09-20T00:00:00.000Z", truncated: false}}), {status: 200, headers: {"Content-Type": "application/json"}});
  };
  try {
    await financeReconciliationApi.inspect(9999);
    assert.equal(calls[0], "/api/finance/reconciliation?limit=500");
  } finally {
    globalThis.fetch = previous;
  }
});
