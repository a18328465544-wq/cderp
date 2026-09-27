import assert from "node:assert/strict";
import test from "node:test";
import {ApiError} from "../errors";
import {partnersApi} from "./partners";

function response(payload: unknown, status = 201) {
  return new Response(JSON.stringify(payload), {status, headers: {"Content-Type": "application/json"}});
}

test("customer quick-create sends the V1-compatible request and adapts the returned archive", async () => {
  const previousFetch = globalThis.fetch;
  let body = "";
  globalThis.fetch = async (input, init) => {
    assert.equal(input, "/api/customers");
    body = String(init?.body || "");
    return response({data: {id: "KH-1", name: "张三", phone: "138"}, stateMerge: {customers: [{id: "KH-1"}]}});
  };
  try {
    const result = await partnersApi.createCustomer({name: " 张三 ", contact: "138", channel: "闲鱼", remarks: "回收"});
    assert.equal(result.id, "KH-1");
    assert.equal(result.partnerType, "customer");
    assert.deepEqual(JSON.parse(body), {name: "张三", contact: "138", type: "个人买家客户", firstChannel: "闲鱼", remarks: "回收", tags: ["个人客户"]});
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("vendor quick-create keeps vendor type and surfaces conflict/permission errors", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => response({error: {code: "CONFLICT", message: "联系方式已被同行使用"}}, 409);
  try {
    await assert.rejects(() => partnersApi.createVendor({name: "同行", contact: "139", vendorType: "上游供应商", remarks: ""}), (error: unknown) => error instanceof ApiError && error.status === 409);
    globalThis.fetch = async () => response({error: {code: "FORBIDDEN", message: "无供应商权限"}}, 403);
    await assert.rejects(() => partnersApi.createVendor({name: "同行", contact: "139", vendorType: "上游供应商", remarks: ""}), (error: unknown) => error instanceof ApiError && error.status === 403);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
