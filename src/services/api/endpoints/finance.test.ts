import assert from "node:assert/strict";
import test from "node:test";
import {financeApi} from "./finance";

test("finance dashboard reads its feature-scoped snapshot", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => {assert.equal(input, "/api/finance/dashboard?startDate=2026-08-01&endDate=2026-08-07"); return new Response(JSON.stringify({data: {settlementAccounts: []}}), {status: 200, headers: {"Content-Type": "application/json"}});};
  try {
    const result = await financeApi.dashboard({showCost: false, showProfit: true, canViewAccounts: false, canViewSettlementLedger: false, canViewReturns: false}, {startDate: "2026-08-01", endDate: "2026-08-07"});
    assert.equal(result.source, "state-snapshot");
  } finally {globalThis.fetch = previous;}
});

test("finance profit flow query preserves the report date range and normalizes aggregates", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.equal(input, "/api/gpu_erp/finance/profit-flows?dateStart=2026-08-01&dateEnd=2026-08-31");
    return new Response(JSON.stringify({data: {flows: [{date: "2026-08-10", income: 200, expense: 80, net: 120}]}}), {status: 200, headers: {"Content-Type": "application/json"}});
  };
  try {
    const result = await financeApi.profitFlows({startDate: "2026-08-01", endDate: "2026-08-31"});
    assert.deepEqual(result, [{date: "2026-08-10", income: 200, expense: 80, net: 120}]);
  } finally {globalThis.fetch = previous;}
});
