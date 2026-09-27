import assert from "node:assert/strict";
import test from "node:test";
import {createInspectionDefaults} from "./inspection.defaults";
import {inspectionSchema} from "./inspection.schema";

const candidate = {
  id: "KC-1", productId: "P-1", productName: "RTX 4090", category: "显卡" as const, model: "RTX 4090", brand: "华硕", version: "猛禽", vram: "24G", serialNumber: "", expressNo: "", supplierName: "供应商", purchaseHandler: "采购经办人", purchaseInvoiceNo: "JH-1", status: "待检测", condition: "95新" as const, inWarranty: true, warrantyDate: "2028-01-01", repaired: false, fullBox: true, warehouseLocation: "待检测区", entryTime: "2026-08-09", inventoryDays: 0, isGpu: true, searchText: "",
};

test("inspection defaults never invent measured GPU results", () => {
  const defaults = createInspectionDefaults(candidate, "检测员");
  assert.equal(defaults.furmarkResult, "");
  assert.equal(defaults.threedMarkResult, "");
  assert.equal(defaults.temperature, 0);
  assert.equal(defaults.wattage, 0);
  assert.equal(defaults.warehouseLocation, "A区货架-01");
});

test("GPU inspection requires SN, warehouse and actual measurements", () => {
  const values = createInspectionDefaults(candidate, "检测员");
  assert.equal(inspectionSchema.safeParse(values).success, false);
  values.serialNumber = "SN-1";
  values.furmarkResult = "稳定 20 分钟";
  values.threedMarkResult = "98%";
  values.temperature = 72;
  values.wattage = 350;
  assert.equal(inspectionSchema.safeParse(values).success, true);
});

test("brand-new inventory only requires SN and warranty confirmation", () => {
  const values = createInspectionDefaults({...candidate, condition: "全新"}, "检测员");
  values.serialNumber = "NEW-SN-1";
  assert.equal(values.furmarkResult, "");
  assert.equal(values.threedMarkResult, "");
  assert.equal(values.temperature, 0);
  assert.equal(values.wattage, 0);
  assert.equal(inspectionSchema.safeParse(values).success, true);
});

test("accessory simple inspection does not require GPU measurements", () => {
  const values = createInspectionDefaults({...candidate, id: "CPU-1", category: "CPU", productName: "i9", isGpu: false, inWarranty: false, warrantyDate: ""}, "检测员");
  values.serialNumber = "CPU-SN";
  assert.equal(inspectionSchema.safeParse(values).success, true);
});

test("selecting brand-new on a used candidate only requires SN and retains optional metadata", () => {
  const values = createInspectionDefaults({...candidate, warrantyDate: ""}, "检测员");
  values.serialNumber = "QUICK-SN";
  values.condition = "全新";
  values.warehouseLocation = "";
  values.temperature = 190;
  values.wattage = 2500;
  assert.equal(inspectionSchema.safeParse(values).success, true);
  assert.equal(values.inWarranty, true);
  values.serialNumber = " ";
  assert.equal(inspectionSchema.safeParse(values).success, false);
});

test("switching back to used condition restores warehouse, warranty and GPU validation", () => {
  const values = createInspectionDefaults({...candidate, condition: "全新", warrantyDate: ""}, "检测员");
  values.serialNumber = "SWITCH-SN";
  assert.equal(inspectionSchema.safeParse(values).success, true);
  values.condition = "95新";
  values.warehouseLocation = "";
  const result = inspectionSchema.safeParse(values);
  assert.equal(result.success, false);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path[0]);
    for (const field of ["warehouseLocation", "warrantyDate", "furmarkResult", "threedMarkResult", "temperature", "wattage"]) assert.ok(fields.includes(field));
  }
});
