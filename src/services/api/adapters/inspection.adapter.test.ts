import assert from "node:assert/strict";
import test from "node:test";
import {adaptInspectionCreateResult, adaptInspectionWorkspace, toInspectionCreateRequestDto, toInspectionUpdateRequestDto} from "./inspection.adapter";
import type {InspectionFormValues} from "@/src/types/inspection";

function gpuValues(): InspectionFormValues {
  return {
    inventoryId: "KC-1", isGpu: true, serialNumber: " SN-1 ", condition: "95新", inWarranty: true, warrantyDate: "2028-01-01", fullBox: true, warehouseLocation: " A区-01 ", inspector: " 郭鑫 ",
    exteriorCheck: "完美无瑕", fanCheck: "静音顺畅", portsCheck: "全部正常", gpuzCheck: "核对一致", furmarkResult: " 20 分钟稳定 ", threedMarkResult: " 98.5% ", vramResult: "全显存测试通过", temperature: 72, wattage: 350, noise: "适中", repaired: false, hiddenDefects: false, resultStatus: "通过", remarks: " 正常 ", images: ["/api/media/assets/IMG-1", "data:image/jpeg;base64,bad"],
  };
}

test("inspection workspace keeps only valid pending candidates and enriches history", () => {
  const result = adaptInspectionWorkspace({data: {
    inventory: [
      {id: "GPU-1", category: "显卡", productName: "RTX 4090", status: "待检测", entryTime: "2026-08-09", condition: "95新", supplierName: "供应商甲", purchaseHandler: "采购经办人", purchaseInvoiceNo: "JH-1"},
      {id: "GPU-2", category: "显卡", productName: "RTX 4080", status: "已入库", entryTime: "2026-08-08"},
      {id: "CPU-1", category: "CPU", productName: "i9", status: "待检测", entryTime: "2026-08-07"},
      {id: "CPU-2", category: "CPU", productName: "i7", status: "已售出", entryTime: "2026-08-06"},
    ],
    inspections: [{id: "JC-1", inventoryId: "CPU-1", sn: "CPU-SN", resultStatus: "通过", recordVersion: 4, inspectTime: "2026-08-09 10:00", images: ["/api/media/assets/IMG-2"]}],
  }});
  assert.deepEqual(result.candidates.map((item) => item.id), ["GPU-1"]);
  assert.equal(result.candidates[0]?.purchaseHandler, "采购经办人");
  assert.equal(result.history[0]?.productName, "i9");
  assert.equal(result.history[0]?.category, "CPU");
  assert.equal(result.history[0]?.temperature, undefined);
  assert.equal(result.history[0]?.candidate.id, "CPU-1");
  assert.deepEqual(result.history[0]?.images, ["/api/media/assets/IMG-2"]);
  assert.equal(result.history[0]?.recordVersion, 4);
});

test("inspection workspace excludes inventory reserved by a non-voided purchase return", () => {
  const result = adaptInspectionWorkspace({data: {
    inventory: [
      {id: "GPU-RETURNED", category: "显卡", productName: "RTX 4090", status: "待检测"},
      {id: "CPU-RETURNED-BATCH", category: "CPU", productName: "i9", status: "待检测"},
      {id: "GPU-AVAILABLE", category: "显卡", productName: "RTX 4080", status: "待检测"},
    ],
    inspections: [],
    returnOrders: [
      {id: "TH-1", type: "进货退货", status: "待处理", sourceInventoryId: "GPU-RETURNED"},
      {id: "TH-2", type: "进货退货", status: "已完成", items: [{sourceInventoryId: "CPU-RETURNED-BATCH"}]},
      {id: "TH-3", type: "进货退货", status: "已作废", sourceInventoryId: "GPU-AVAILABLE"},
    ],
  }});
  assert.deepEqual(result.candidates.map((item) => item.id), ["GPU-AVAILABLE"]);
});

test("inspection adapter normalizes legacy condition labels before form validation", () => {
  const result = adaptInspectionWorkspace({data: {
    inventory: [
      {id: "GPU-LEGACY-99", category: "显卡", productName: "RTX 4090", status: "待检测", condition: "充新99新"},
      {id: "GPU-LEGACY-95", category: "显卡", productName: "RTX 4080", status: "待检测", condition: "靓机95新"},
    ],
    inspections: [],
  }});
  assert.deepEqual(result.candidates.map((item) => item.condition), ["99新", "95新"]);
});

test("GPU inspection request preserves measured values and trims identifiers", () => {
  const request = toInspectionCreateRequestDto(gpuValues());
  assert.equal(request.sn, "SN-1");
  assert.equal(request.warehouseLocation, "A区-01");
  assert.equal(request.inspector, "郭鑫");
  assert.equal(request.temperature, 72);
  assert.equal(request.furmarkResult, "20 分钟稳定");
  assert.deepEqual(request.images, ["/api/media/assets/IMG-1"]);
});

test("brand-new inspection request records a quick SN and warranty verification", () => {
  const request = toInspectionCreateRequestDto({
    ...gpuValues(),
    condition: "全新",
    serialNumber: " NEW-SN-1 ",
    furmarkResult: "",
    threedMarkResult: "",
    temperature: 0,
    wattage: 0,
  });
  assert.equal(request.sn, "NEW-SN-1");
  assert.equal(request.condition, "全新");
  assert.equal(request.resultStatus, "通过");
  assert.equal(request.temperature, 0);
  assert.equal(request.wattage, 0);
  assert.equal(request.furmarkResult, "全新商品快速核验，不拆封烤机");
  assert.equal(request.threedMarkResult, "全新商品快速核验，不做跑分");
  assert.match(request.remarks || "", /仅核验 SN/);
});

test("accessory inspection request uses the existing simple inspection contract", () => {
  const values = {...gpuValues(), isGpu: false, inventoryId: "CPU-1", resultStatus: "需要维修" as const, temperature: 91, wattage: 999, hiddenDefects: true, repaired: true};
  const request = toInspectionCreateRequestDto(values);
  assert.equal(request.resultStatus, "通过");
  assert.equal(request.temperature, 0);
  assert.equal(request.wattage, 0);
  assert.equal(request.repaired, false);
  assert.equal(request.hiddenDefects, false);
  assert.match(request.remarks || "", /其他配件简易检测/);
});

test("quick inbound normalizes stale GPU fields and supplies the default optional warehouse", () => {
  const values = {...gpuValues(), condition: "全新" as const, warehouseLocation: " ", warrantyDate: "", temperature: 190, wattage: 2500, repaired: true, hiddenDefects: true, resultStatus: "需要维修" as const};
  const request = toInspectionCreateRequestDto(values);
  assert.equal(request.warehouseLocation, "A区货架-01");
  assert.equal(request.inWarranty, true);
  assert.equal(request.warrantyDate, undefined);
  assert.equal(request.repaired, false);
  assert.equal(request.hiddenDefects, false);
  assert.equal(request.temperature, 0);
  assert.equal(request.wattage, 0);
  assert.equal(request.resultStatus, "通过");
  // Switching modes must not overwrite the user's unsaved measurement inputs.
  assert.equal(values.temperature, 190);
});

test("inspection create response excludes state patches", () => {
  assert.deepEqual(adaptInspectionCreateResult({id: "JC-1", inventoryId: "KC-1", sn: "SN-1", resultStatus: "通过", inspectTime: "2026-08-09 12:00", stateMerge: {inventory: []}}), {
    id: "JC-1", inventoryId: "KC-1", serialNumber: "SN-1", resultStatus: "通过", inspectTime: "2026-08-09 12:00",
  });
});

test("inspection update request carries the optimistic-lock version", () => {
  const request = toInspectionUpdateRequestDto(gpuValues(), 7);
  assert.equal(request.expectedRecordVersion, 7);
  assert.equal(request.sn, "SN-1");
});
