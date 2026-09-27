import assert from "node:assert/strict";
import test from "node:test";
import {financeAccountsApi} from "./finance-accounts";

test("finance accounts endpoint follows dedicated list and mutation paths", async () => {
  const previous = globalThis.fetch;
  const calls: Array<{url: string; method: string; body?: string}> = [];
  globalThis.fetch = async (input, init) => {
    calls.push({url: String(input), method: init?.method || "GET", ...(typeof init?.body === "string" ? {body: init.body} : {})});
    if (String(input).includes("settlement-accounts")) return new Response(JSON.stringify({data: [], meta: {page: 1, pageSize: 200, total: 0}}), {status: 200, headers: {"Content-Type": "application/json"}});
    return new Response(JSON.stringify({data: {id: "SA-1", name: "现金", type: "现金"}}), {status: 200, headers: {"Content-Type": "application/json"}});
  };
  try {
    await financeAccountsApi.listAll();
    await financeAccountsApi.create({name: "现金", type: "现金"});
    await financeAccountsApi.reconcile("SA/1", {actualBalance: -50});
    await financeAccountsApi.remove("SA/1");
    assert.equal(calls[0]?.url, "/api/gpu_erp/finance/settlement-accounts?page=1&pageSize=200");
    assert.deepEqual(calls.slice(1).map(({url, method}) => ({url, method})), [
      {url: "/api/gpu_erp/finance/settlement-account/create", method: "POST"},
      {url: "/api/gpu_erp/finance/settlement-account/SA%2F1/reconcile", method: "PATCH"},
      {url: "/api/gpu_erp/finance/settlement-account/SA%2F1", method: "DELETE"},
    ]);
    assert.deepEqual(JSON.parse(calls[2]?.body || "{}"), {actualBalance: -50});
  } finally {globalThis.fetch = previous;}
});

test("finance accounts list loads every server page without truncating at 200", async () => {
  const previous = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input); calls.push(url);
    const page = new URL(url, "http://local").searchParams.get("page");
    return new Response(JSON.stringify(page === "1" ? {data: [{id: "A", name: "A", type: "现金"}], meta: {page: 1, pageSize: 200, total: 201}} : {data: [{id: "B", name: "B", type: "微信"}], meta: {page: 2, pageSize: 200, total: 201}}), {status: 200, headers: {"Content-Type": "application/json"}});
  };
  try {
    const result = await financeAccountsApi.listAll();
    assert.equal(calls.length, 2);
    assert.deepEqual(result.accounts.map((item) => item.id), ["A", "B"]);
    assert.equal(result.total, 201);
  } finally {globalThis.fetch = previous;}
});

test("finance account ledger query uses the account id filter", async () => {
  const previous = globalThis.fetch;
  let url = "";
  globalThis.fetch = async (input) => {url = String(input); return new Response(JSON.stringify({data: [], meta: {page: 1, pageSize: 20, total: 0}}), {status: 200, headers: {"Content-Type": "application/json"}});};
  try {
    await financeAccountsApi.ledger("SA/1");
    assert.equal(url, "/api/gpu_erp/finance/settlement-ledger?accountId=SA%2F1&page=1&pageSize=20");
  } finally {globalThis.fetch = previous;}
});
