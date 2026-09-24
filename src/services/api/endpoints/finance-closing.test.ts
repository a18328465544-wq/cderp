import assert from "node:assert/strict";
import test from "node:test";
import {financeClosingApi} from "./finance-closing";

test("daily closing endpoints use the dedicated snapshot paths and bounded limit", async () => {
  const previous = globalThis.fetch;
  const calls: Array<{url: string; method: string; body?: string}> = [];
  globalThis.fetch = async (input, init) => {
    calls.push({url: String(input), method: init?.method || "GET", ...(typeof init?.body === "string" ? {body: init.body} : {})});
    return new Response(JSON.stringify({data: {id: "RJ-1", date: "2026-08-11", snapshot: {}}}), {status: 200, headers: {"Content-Type": "application/json"}});
  };
  try {
    await financeClosingApi.list(999);
    await financeClosingApi.get("2026-08-11");
    await financeClosingApi.create({date: "2026-08-11", remarks: " 复核 "});
    assert.equal(calls[0]?.url, "/api/finance/daily-closings?limit=90");
    assert.equal(calls[1]?.url, "/api/finance/daily-closing?date=2026-08-11");
    assert.equal(calls[2]?.url, "/api/finance/daily-closing");
    assert.equal(calls[2]?.method, "POST");
    assert.deepEqual(JSON.parse(calls[2]?.body || "{}"), {date: "2026-08-11", remarks: "复核"});
  } finally {
    globalThis.fetch = previous;
  }
});

test("accounting period endpoints expose lock and reopen actions", async () => {
  const previous = globalThis.fetch;
  const calls: Array<{url: string; method: string; body?: string}> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({url, method: init?.method || "GET", ...(typeof init?.body === "string" ? {body: init.body} : {})});
    const data = url.includes("accounting-periods?limit")
      ? [{period: "2026-09", status: "open"}]
      : {period: "2026-09", status: url.endsWith("/close") ? "closed" : "open"};
    return new Response(JSON.stringify({data}), {status: 200, headers: {"Content-Type": "application/json"}});
  };
  try {
    await financeClosingApi.listAccountingPeriods(999);
    await financeClosingApi.closeAccountingPeriod("2026-09", " 月结 ");
    await financeClosingApi.reopenAccountingPeriod("2026-09");
    assert.equal(calls[0]?.url, "/api/finance/accounting-periods?limit=120");
    assert.equal(calls[1]?.url, "/api/finance/accounting-periods/2026-09/close");
    assert.equal(calls[1]?.method, "POST");
    assert.deepEqual(JSON.parse(calls[1]?.body || "{}"), {remarks: "月结"});
    assert.equal(calls[2]?.url, "/api/finance/accounting-periods/2026-09/reopen");
  } finally {
    globalThis.fetch = previous;
  }
});
