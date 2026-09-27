import assert from "node:assert/strict";
import test from "node:test";
import {inspectionApi} from "./inspection";
import type {InspectionFormValues} from "@/src/types/inspection";

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {status, headers: {"Content-Type": "application/json"}});
}

function values(): InspectionFormValues {
  return {
    inventoryId: "KC-1", isGpu: true, serialNumber: "SN-1", condition: "95新", inWarranty: false, warrantyDate: "", fullBox: true,
    warehouseLocation: "A区货架-01", inspector: "郭鑫", exteriorCheck: "完美无瑕", fanCheck: "静音顺畅", portsCheck: "全部正常", gpuzCheck: "核对一致",
    furmarkResult: "20 分钟稳定", threedMarkResult: "98.5%", vramResult: "全显存测试通过", temperature: 72, wattage: 350, noise: "适中",
    repaired: false, hiddenDefects: false, resultStatus: "通过", remarks: "", images: ["/api/media/assets/IMG-1"],
  };
}

test("inspection create uses the existing POST contract and unwraps the response", async () => {
  const previous = globalThis.fetch;
  let request: {url: string; method: string; body: Record<string, unknown>} | undefined;
  globalThis.fetch = async (input, init) => {
    request = {url: String(input), method: String(init?.method), body: JSON.parse(String(init?.body)) as Record<string, unknown>};
    return response({data: {id: "JC-1", inventoryId: "KC-1", sn: "SN-1", resultStatus: "通过", inspectTime: "2026-08-18 10:00"}}, 201);
  };
  try {
    const result = await inspectionApi.create(values());
    assert.equal(request?.url, "/api/inspections");
    assert.equal(request?.method, "POST");
    assert.equal(request?.body.inventoryId, "KC-1");
    assert.equal(request?.body.sn, "SN-1");
    assert.deepEqual(request?.body.images, ["/api/media/assets/IMG-1"]);
    assert.deepEqual(result, {id: "JC-1", inventoryId: "KC-1", serialNumber: "SN-1", resultStatus: "通过", inspectTime: "2026-08-18 10:00"});
  } finally {
    globalThis.fetch = previous;
  }
});

test("inspection update encodes the inspection id and keeps the same request body contract", async () => {
  const previous = globalThis.fetch;
  let request: {url: string; method: string; body: Record<string, unknown>} | undefined;
  globalThis.fetch = async (input, init) => {
    request = {url: String(input), method: String(init?.method), body: JSON.parse(String(init?.body)) as Record<string, unknown>};
    return response({data: {id: "JC/1", inventoryId: "KC-1", sn: "SN-1", resultStatus: "轻微问题", inspectTime: "2026-08-18 10:00"}});
  };
  try {
    const result = await inspectionApi.update("JC/1", values(), 3);
    assert.equal(request?.url, "/api/inspections/JC%2F1");
    assert.equal(request?.method, "PUT");
    assert.equal(request?.body.expectedRecordVersion, 3);
    assert.equal(result.id, "JC/1");
  } finally {
    globalThis.fetch = previous;
  }
});
