import assert from "node:assert/strict";
import test from "node:test";
import {aftersalesApi} from "./aftersales";

function response(payload: unknown, status = 200) {return new Response(JSON.stringify(payload), {status, headers: {"Content-Type": "application/json"}});}

test("aftersales workspace reads its feature-scoped snapshot", async () => {const previous = globalThis.fetch; globalThis.fetch = async (input) => {assert.equal(input, "/api/aftersales/workspace"); return response({data: {aftersales: []}});}; try {const result = await aftersalesApi.workspace(); assert.equal(result.source, "state-snapshot");} finally {globalThis.fetch = previous;}});

test("aftersales create and resolution use existing write endpoints", async () => {
  const previous = globalThis.fetch; const requests: Array<{url: string; method: string; body: Record<string, unknown>}> = [];
  globalThis.fetch = async (input, init) => {requests.push({url: String(input), method: String(init?.method), body: JSON.parse(String(init?.body)) as Record<string, unknown>}); return response({data: {id: requests.length === 1 ? "SH-1" : "SH-1", salesInvoiceNo: "XS-1", customerName: "张三", inventoryNo: "KC-1", productName: "RTX 4090", sn: "SN-1", type: "维修", desc: "花屏", status: requests.length === 1 ? "待处理" : "已完成", createTime: "2026-08-10"}}, requests.length === 1 ? 201 : 200);};
  try {const candidate = {inventoryId: "KC-1", productName: "RTX 4090", serialNumber: "SN-1", saleInvoiceNo: "XS-1", customerName: "张三", contact: "138"}; await aftersalesApi.create({candidateId: "KC-1", type: "维修", description: "花屏"}, candidate, "郭鑫"); await aftersalesApi.resolve("SH-1", {action: "维修完成", repairCost: 200, note: "更换风扇"}, "郭鑫"); assert.deepEqual(requests.map((item) => [item.url, item.method]), [["/api/aftersales", "POST"], ["/api/aftersales/SH-1", "PATCH"]]); assert.equal(requests[1]?.body.repairCost, 200);} finally {globalThis.fetch = previous;}
});
