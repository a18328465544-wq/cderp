import assert from "node:assert/strict";
import test from "node:test";
import {returnsApi} from "./returns";
import {defaultSalesReturnListFilters} from "@/src/features/returns/sales-return.filters";
import type {SalesReturnFormValues} from "@/src/types/returns";

test("sales returns endpoint keeps type filtering and exposes completion, void, edit, and delete routes", async () => {
  const previous = globalThis.fetch;
  const calls: Array<{url: string; method: string; body?: string; idempotencyKey?: string}> = [];
  globalThis.fetch = async (input, init) => {
    const idempotencyKey = new Headers(init?.headers).get("Idempotency-Key") || undefined;
    calls.push({url: String(input), method: init?.method || "GET", ...(typeof init?.body === "string" ? {body: init.body} : {}), ...(idempotencyKey ? {idempotencyKey} : {})});
    const payload = String(input).includes("/api/returns?")
      ? {data: {data: [{id: "RET-1", returnNo: "XSTH-1", type: "销售退货", status: "待处理", amount: 1000}], meta: {page: 1, pageSize: 20, total: 1}}}
      : {data: {id: "RET-1", returnNo: "XSTH-1", type: "销售退货", status: "已完成", amount: 1000, completedAt: "2026-08-11 12:00:00"}};
    return new Response(JSON.stringify(payload), {status: 200, headers: {"Content-Type": "application/json"}});
  };
  try {
    await returnsApi.listSales({...defaultSalesReturnListFilters, keyword: " SN-1 "});
    await returnsApi.complete("RET/1");
    await returnsApi.voidReturn("RET/1");
    await returnsApi.update("RET/1", {handler: " 郭鑫 ", reason: " 客户拒收 ", remarks: ""});
    await returnsApi.remove("RET/1");
    assert.equal(calls[0]?.url, "/api/returns?type=%E9%94%80%E5%94%AE%E9%80%80%E8%B4%A7&page=1&pageSize=20&keyword=SN-1");
    assert.deepEqual(calls.slice(1).map(({url, method}) => ({url, method})), [
      {url: "/api/returns/RET%2F1/complete", method: "POST"},
      {url: "/api/returns/RET%2F1/void", method: "POST"},
      {url: "/api/returns/RET%2F1", method: "PATCH"},
      {url: "/api/returns/RET%2F1", method: "DELETE"},
    ]);
    assert.match(calls[1]?.idempotencyKey || "", /^return-complete-/);
    assert.deepEqual(JSON.parse(calls[3]?.body || "{}"), {handler: "郭鑫", reason: "客户拒收", remarks: ""});
  } finally { globalThis.fetch = previous; }
});

test("return completion retries reuse the same idempotency key", async () => {
  const previous = globalThis.fetch;
  const keys: string[] = [];
  globalThis.fetch = async (_input, init) => {
    keys.push(new Headers(init?.headers).get("Idempotency-Key") || "");
    return new Response(JSON.stringify({data: {id: "RET-1", returnNo: "XSTH-1", type: "销售退货", status: "已完成", amount: 1000}}), {status: 200, headers: {"Content-Type": "application/json"}});
  };
  try {
    await returnsApi.complete("RET/1");
    await returnsApi.complete("RET/1");
    assert.equal(keys.length, 2);
    assert.equal(keys[0], keys[1]);
  } finally { globalThis.fetch = previous; }
});

test("sales return endpoint serializes whole-document lines and omits draft-only scope fields", async () => {
  const previous = globalThis.fetch;
  let requestBody: Record<string, unknown> = {};
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
    return new Response(JSON.stringify({data: {id: "RET-BATCH", returnNo: "XSTH-BATCH", type: "销售退货", status: "待处理", amount: 5000}}), {status: 200, headers: {"Content-Type": "application/json"}});
  };
  const values: SalesReturnFormValues = {
    date: "2026-08-09",
    relatedDocNo: "XS-BATCH-1",
    sourceInventoryId: "",
    sourceSalesItemIndex: -1,
    productId: "",
    productName: "",
    sn: "",
    partyName: "客户",
    partyId: "KH-1",
    contact: "13900000000",
    amount: 5000,
    inventoryAction: "退回待检测",
    reason: "整单退货",
    responsibility: "客户",
    handler: "郭鑫",
    remarks: "",
    returnScope: "document",
    returnItems: [
      {sourceInventoryId: "KC-1", sourceSalesItemIndex: 0},
      {sourceInventoryId: "KC-2", sourceSalesItemIndex: 1},
    ],
  };
  try {
    await returnsApi.createSales(values);
    assert.equal(requestBody.type, "销售退货");
    assert.equal(requestBody.batchMode, "整单退货");
    assert.deepEqual(requestBody.items, values.returnItems);
    assert.equal("returnScope" in requestBody, false);
    assert.equal("returnItems" in requestBody, false);
  } finally { globalThis.fetch = previous; }
});

test("return detail resolvers locate batch orders by nested inventory-card references", async () => {
  const previousFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    return new Response(JSON.stringify({data: {data: [{id: "RET-BATCH", returnNo: "XSTH-BATCH", type: "销售退货", status: "待处理", items: [{sourceInventoryId: "KC-2"}], amount: 5000}], meta: {page: 1, pageSize: 100, total: 1}}}), {status: 200, headers: {"Content-Type": "application/json"}});
  };
  try {
    const result = await returnsApi.findSalesByReference("KC-2");
    assert.equal(result?.returnNo, "XSTH-BATCH");
    assert.deepEqual(result?.sourceInventoryIds, ["KC-2"]);
    assert.equal(calls[0], "/api/returns?type=%E9%94%80%E5%94%AE%E9%80%80%E8%B4%A7&page=1&pageSize=100&keyword=KC-2");
  } finally { globalThis.fetch = previousFetch; }
});
