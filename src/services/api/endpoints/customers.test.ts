import assert from "node:assert/strict";
import test from "node:test";
import {customersApi} from "./customers";

function response(payload: unknown, status = 200) {return new Response(JSON.stringify(payload), {status, headers: {"Content-Type": "application/json"}});}

test("customer directory reads its server-paginated endpoint", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {assert.equal(input, "/api/customers/page?page=1&pageSize=20&keyword=%E5%BC%A0%E4%B8%89"); return response({data: {items: [{id: "KH-1", name: "张三"}]}, meta: {page: 1, pageSize: 20, total: 1, summary: {coreCount: 0, receivable: 0, payable: 0}}});};
  try {const result = await customersApi.list({keyword: "张三", type: "all", channel: "all", level: "all", page: 1, pageSize: 20}, [], {showProfit: false}); assert.equal(result.customers[0]?.id, "KH-1"); assert.equal(result.total, 1); assert.equal("inventory" in result, false);} finally {globalThis.fetch = previousFetch;}
});

test("customer update uses the existing CRM patch endpoint", async () => {
  const previousFetch = globalThis.fetch;
  let method = "";
  globalThis.fetch = async (input, init) => {assert.equal(input, "/api/gpu_erp/crm/customer/KH-1"); method = String(init?.method); return response({data: {id: "KH-1", name: "张三", level: "C级"}});};
  try {await customersApi.update("KH-1", {name: "张三", contact: "", type: "个人买家客户", source: "微信", level: "C级", isCoreCustomer: false, riskReason: "", remarks: ""}, {showProfit: false}); assert.equal(method, "PATCH");} finally {globalThis.fetch = previousFetch;}
});
